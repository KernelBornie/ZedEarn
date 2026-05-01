const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const { safeEnum } = require('../utils/sanitize');

const TX_TYPES = ['deposit', 'withdraw', 'task_reward', 'referral_bonus', 'cashback', 'vip_purchase', 'marketplace_sale', 'adjustment', 'transfer'];
const TX_STATUSES = ['pending', 'completed', 'failed', 'reversed'];

// GET /api/wallet - balances + recent transactions
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const recentTransactions = await Transaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      wallet: {
        balance: user.balance,
        rewardBalance: user.rewardBalance,
        commissionBalance: user.commissionBalance,
        frozenBalance: user.frozenBalance,
        pendingBalance: user.pendingBalance,
        lifetimeEarnings: user.lifetimeEarnings,
      },
      recentTransactions,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/wallet/transactions - paginated history
router.get('/transactions', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const query = { userId: req.user._id };
    const safeType = safeEnum(type, TX_TYPES);
    const safeStatus = safeEnum(status, TX_STATUSES);
    if (safeType) query.type = safeType;
    if (safeStatus) query.status = safeStatus;

    const total = await Transaction.countDocuments(query);
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      transactions,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/wallet/stats
router.get('/stats', protect, async (req, res) => {
  try {
    const [deposits, withdrawals, earned] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            userId: req.user._id,
            type: 'deposit',
            status: 'completed',
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            userId: req.user._id,
            type: 'withdraw',
            status: 'completed',
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            userId: req.user._id,
            type: { $in: ['task_reward', 'referral_bonus', 'cashback'] },
            status: 'completed',
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalDeposited: deposits[0]?.total || 0,
        depositCount: deposits[0]?.count || 0,
        totalWithdrawn: withdrawals[0]?.total || 0,
        withdrawalCount: withdrawals[0]?.count || 0,
        totalEarned: earned[0]?.total || 0,
        earnedCount: earned[0]?.count || 0,
        lifetimeEarnings: req.user.lifetimeEarnings,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/wallet/recharge
router.post(
  '/recharge',
  protect,
  [
    body('amount')
      .isFloat({ min: 10 })
      .withMessage('Minimum recharge amount is ZMW 10'),
    body('method')
      .notEmpty()
      .withMessage('Payment method is required')
      .isIn(['airtel_money', 'mtn_money', 'zamtel_kwacha', 'bank_transfer', 'card'])
      .withMessage('Invalid payment method'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { amount, method, phone } = req.body;

      const transaction = await Transaction.create({
        userId: req.user._id,
        type: 'deposit',
        amount: parseFloat(amount),
        fee: 0,
        method,
        status: 'pending',
        description: `Recharge via ${method.replace(/_/g, ' ')}`,
        meta: { phone: phone || req.user.phone },
      });

      // Update pending balance
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { pendingBalance: parseFloat(amount) },
      });

      const paymentInstructions = {
        airtel_money: `Send ZMW ${amount} to *115# and use reference: ${transaction.reference}`,
        mtn_money: `Send ZMW ${amount} to *303# and use reference: ${transaction.reference}`,
        zamtel_kwacha: `Send ZMW ${amount} to *322# and use reference: ${transaction.reference}`,
        bank_transfer: `Transfer ZMW ${amount} to ZedEarn Acc: 1234567890 at Zanaco, Ref: ${transaction.reference}`,
        card: `A payment link will be sent to your email/phone for ZMW ${amount}`,
      };

      res.status(201).json({
        success: true,
        message: 'Recharge initiated',
        reference: transaction.reference,
        instructions: paymentInstructions[method],
        transaction,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// POST /api/wallet/withdraw
router.post(
  '/withdraw',
  protect,
  [
    body('amount')
      .isFloat({ min: 20 })
      .withMessage('Minimum withdrawal amount is ZMW 20'),
    body('method')
      .notEmpty()
      .withMessage('Withdrawal method is required')
      .isIn(['airtel_money', 'mtn_money', 'zamtel_kwacha', 'bank_transfer'])
      .withMessage('Invalid withdrawal method'),
    body('accountNumber').notEmpty().withMessage('Account number is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { amount, method, accountNumber, accountName } = req.body;
      const withdrawAmount = parseFloat(amount);

      const user = await User.findById(req.user._id);

      if (user.balance < withdrawAmount) {
        return res
          .status(400)
          .json({ success: false, message: 'Insufficient balance' });
      }

      // Fee: 2% for VIP, 5% for regular users
      const isVIP = user.vipTier !== 'none' && user.vipExpiry && user.vipExpiry > new Date();
      const feeRate = isVIP ? 0.02 : 0.05;
      const fee = parseFloat((withdrawAmount * feeRate).toFixed(2));
      const netAmount = parseFloat((withdrawAmount - fee).toFixed(2));

      // Deduct from balance and freeze
      await User.findByIdAndUpdate(req.user._id, {
        $inc: {
          balance: -withdrawAmount,
          frozenBalance: withdrawAmount,
        },
      });

      const transaction = await Transaction.create({
        userId: req.user._id,
        type: 'withdraw',
        amount: withdrawAmount,
        fee,
        method,
        status: 'pending',
        description: `Withdrawal via ${method.replace(/_/g, ' ')}`,
        meta: { accountNumber, accountName: accountName || '' },
      });

      await Notification.create({
        userId: req.user._id,
        title: 'Withdrawal Request Submitted',
        message: `Your withdrawal of ZMW ${netAmount.toFixed(2)} (after ZMW ${fee.toFixed(2)} fee) is being processed.`,
        type: 'transaction',
        link: '/wallet/transactions',
      });

      const io = req.app.get('io');
      if (io) {
        const updatedUser = await User.findById(req.user._id);
        io.to(`user:${req.user._id}`).emit('balanceUpdate', {
          balance: updatedUser.balance,
          frozenBalance: updatedUser.frozenBalance,
        });
      }

      res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted',
        reference: transaction.reference,
        amountRequested: withdrawAmount,
        fee,
        netAmount,
        transaction,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

module.exports = router;
