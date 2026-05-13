const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Task = require('../models/Task');
const Campaign = require('../models/Campaign');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { escapeRegex, safeEnum } = require('../utils/sanitize');
const ledgerService = require('../services/ledgerService');
const paymentService = require('../services/payments/paymentService');
const logger = require('../utils/logger');

const adminAuth = [protect, authorize('admin', 'superadmin')];

const USER_ROLES = ['guest', 'user', 'vip', 'agent', 'merchant', 'support', 'admin', 'superadmin'];
const TX_TYPES = ['deposit', 'withdraw', 'task_reward', 'referral_bonus', 'cashback', 'vip_purchase', 'marketplace_sale', 'adjustment', 'transfer'];
const TX_STATUSES = ['pending', 'processing', 'completed', 'failed', 'reversed'];
const TASK_TYPES = ['ad_watch', 'survey', 'daily_checkin', 'referral', 'mission'];
const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed'];

// GET /api/admin/analytics
router.get('/analytics', ...adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      activeUsersToday,
      vipUsers,
      todayDeposits,
      weekDeposits,
      monthDeposits,
      todayWithdrawals,
      weekWithdrawals,
      monthWithdrawals,
      vipSalesMonth,
      pendingTransactions,
      taskRewardsMonth,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ lastLogin: { $gte: startOfDay } }),
      User.countDocuments({ vipTier: { $ne: 'none' }, vipExpiry: { $gt: new Date() } }),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: 'completed', createdAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: 'completed', createdAt: { $gte: startOfWeek } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: 'completed', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'withdraw', status: 'completed', createdAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'withdraw', status: 'completed', createdAt: { $gte: startOfWeek } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'withdraw', status: 'completed', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            type: 'vip_purchase',
            status: 'completed',
            createdAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.countDocuments({ status: 'pending' }),
      Transaction.aggregate([
        {
          $match: {
            type: 'task_reward',
            status: 'completed',
            createdAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      success: true,
      analytics: {
        users: { total: totalUsers, activeToday: activeUsersToday, vip: vipUsers },
        deposits: {
          today: { total: todayDeposits[0]?.total || 0, count: todayDeposits[0]?.count || 0 },
          week: { total: weekDeposits[0]?.total || 0, count: weekDeposits[0]?.count || 0 },
          month: { total: monthDeposits[0]?.total || 0, count: monthDeposits[0]?.count || 0 },
        },
        withdrawals: {
          today: {
            total: todayWithdrawals[0]?.total || 0,
            count: todayWithdrawals[0]?.count || 0,
          },
          week: {
            total: weekWithdrawals[0]?.total || 0,
            count: weekWithdrawals[0]?.count || 0,
          },
          month: {
            total: monthWithdrawals[0]?.total || 0,
            count: monthWithdrawals[0]?.count || 0,
          },
        },
        vipSalesMonth: { total: vipSalesMonth[0]?.total || 0, count: vipSalesMonth[0]?.count || 0 },
        pendingTransactions,
        taskRewardsMonth: {
          total: taskRewardsMonth[0]?.total || 0,
          count: taskRewardsMonth[0]?.count || 0,
        },
        conversionRate:
          totalUsers > 0 ? ((vipUsers / totalUsers) * 100).toFixed(1) + '%' : '0%',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/users
router.get('/users', ...adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role, status } = req.query;
    const query = {};
    if (search) {
      const safeSearch = escapeRegex(String(search).substring(0, 100));
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    const safeRole = safeEnum(role, USER_ROLES);
    if (safeRole) query.role = safeRole;
    if (status === 'frozen') query.isFrozen = true;
    else if (status === 'active') query.isFrozen = false;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/adjust-balance
router.put(
  '/users/:id/adjust-balance',
  ...adminAuth,
  [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('reason').notEmpty().withMessage('Reason is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { amount, reason, balanceType = 'balance' } = req.body;
      const adjustAmount = parseFloat(amount);

      const validBalanceTypes = ['balance', 'rewardBalance', 'commissionBalance'];
      if (!validBalanceTypes.includes(balanceType)) {
        return res.status(400).json({ success: false, message: 'Invalid balance type' });
      }

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const currentBalance = user[balanceType];
      if (adjustAmount < 0 && currentBalance + adjustAmount < 0) {
        return res
          .status(400)
          .json({ success: false, message: 'Balance cannot go below zero' });
      }

      await ledgerService.adminAdjust(
        req.params.id,
        adjustAmount,
        balanceType,
        reason,
        req.user._id
      );

      await Transaction.create({
        userId: req.params.id,
        type: 'adjustment',
        amount: Math.abs(adjustAmount),
        fee: 0,
        status: 'completed',
        description: `Admin adjustment: ${reason}`,
        meta: { adjustedBy: req.user._id, balanceType, direction: adjustAmount > 0 ? 'credit' : 'debit' },
        processedAt: new Date(),
      });

      await Notification.create({
        userId: req.params.id,
        title: 'Balance Adjusted',
        message: `Your ${balanceType.replace(/([A-Z])/g, ' $1').toLowerCase()} was ${adjustAmount > 0 ? 'credited' : 'debited'} by ZMW ${Math.abs(adjustAmount).toFixed(2)}. Reason: ${reason}`,
        type: adjustAmount > 0 ? 'success' : 'warning',
      });

      res.json({ success: true, message: 'Balance adjusted successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /api/admin/transactions
router.get('/transactions', ...adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status, userId } = req.query;
    const query = {};
    const safeType = safeEnum(type, TX_TYPES);
    const safeStatus = safeEnum(status, TX_STATUSES);
    if (safeType) query.type = safeType;
    if (safeStatus) query.status = safeStatus;
    if (userId) query.userId = userId;

    const total = await Transaction.countDocuments(query);
    const transactions = await Transaction.find(query)
      .populate('userId', 'name email phone')
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

// PUT /api/admin/transactions/:id/approve
router.put('/transactions/:id/approve', ...adminAuth, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    if (transaction.status !== 'pending') {
      return res
        .status(400)
        .json({ success: false, message: 'Only pending transactions can be approved' });
    }

    if (transaction.type === 'deposit') {
      // Deposit approvals don't trigger an outbound payment — just credit the ledger
      transaction.status = 'completed';
      transaction.processedAt = new Date();
      await transaction.save();

      await ledgerService.approveDeposit(
        transaction.userId,
        transaction.amount,
        transaction.netAmount,
        { transactionId: transaction._id, reference: transaction.reference }
      );

      logger.info('[Admin] Deposit approved', {
        adminId: req.user._id,
        transactionId: transaction._id,
        reference: transaction.reference,
      });
    } else if (transaction.type === 'withdraw') {
      // Withdrawal approval: set to 'processing', trigger payment API
      transaction.status = 'processing';
      transaction.processedAt = new Date();
      await transaction.save();

      logger.info('[Admin] Withdrawal approved — triggering payment', {
        adminId: req.user._id,
        transactionId: transaction._id,
        reference: transaction.reference,
        method: transaction.method,
      });

      let paymentResult = null;
      try {
        paymentResult = await paymentService.initiateWithdrawal(
          transaction.method,
          transaction
        );
      } catch (payErr) {
        logger.error('[Admin] Payment initiation failed — rolling back to pending', {
          error: payErr.message,
          transactionId: transaction._id,
          reference: transaction.reference,
        });
        // Roll back to pending so admin can retry
        transaction.status = 'pending';
        transaction.meta = { ...transaction.meta, lastPaymentError: payErr.message };
        await transaction.save();
        return res.status(502).json({
          success: false,
          message: `Payment initiation failed: ${payErr.message}. Transaction returned to pending.`,
        });
      }

      if (paymentResult.success || paymentResult.status === 'pending') {
        // Payment accepted (may still be async/pending on provider side)
        transaction.status = paymentResult.status === 'success' ? 'completed' : 'processing';
        transaction.providerRef = paymentResult.providerRef;
        transaction.meta = {
          ...transaction.meta,
          providerRef: paymentResult.providerRef,
          paymentMessage: paymentResult.message,
        };
        await transaction.save();

        if (transaction.status === 'completed') {
          await ledgerService.confirmWithdrawal(
            transaction.userId,
            transaction.amount,
            { transactionId: transaction._id, reference: transaction.reference }
          );
        }

        logger.info('[Admin] Withdrawal payment initiated', {
          transactionId: transaction._id,
          reference: transaction.reference,
          paymentStatus: paymentResult.status,
          providerRef: paymentResult.providerRef,
        });
      } else {
        // Payment failed — release hold and mark failed
        transaction.status = 'failed';
        transaction.meta = {
          ...transaction.meta,
          providerRef: paymentResult.providerRef,
          paymentFailureReason: paymentResult.message,
        };
        await transaction.save();

        await ledgerService.releaseHold(transaction.userId, transaction.amount);

        logger.warn('[Admin] Withdrawal payment failed', {
          transactionId: transaction._id,
          reference: transaction.reference,
          reason: paymentResult.message,
        });

        await Notification.create({
          userId: transaction.userId,
          title: 'Withdrawal Failed',
          message: `Your withdrawal of ZMW ${transaction.amount.toFixed(2)} could not be processed: ${paymentResult.message}. Funds have been returned to your balance.`,
          type: 'error',
          link: '/wallet/transactions',
        });

        return res.status(200).json({
          success: false,
          message: `Payment failed: ${paymentResult.message}. Funds returned to user balance.`,
          transaction,
        });
      }
    } else {
      transaction.status = 'completed';
      transaction.processedAt = new Date();
      await transaction.save();
    }

    await Notification.create({
      userId: transaction.userId,
      title: 'Transaction Approved',
      message: `Your ${transaction.type.replace(/_/g, ' ')} of ZMW ${(transaction.netAmount || transaction.amount).toFixed(2)} has been approved.`,
      type: 'success',
      link: '/wallet/transactions',
    });

    res.json({ success: true, message: 'Transaction approved', transaction });
  } catch (err) {
    logger.error('[Admin] Approve transaction error', { error: err.message, transactionId: req.params.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/admin/transactions/:id/reject
router.put('/transactions/:id/reject', ...adminAuth, async (req, res) => {
  try {
    const { reason = 'Rejected by admin' } = req.body;
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    if (transaction.status !== 'pending') {
      return res
        .status(400)
        .json({ success: false, message: 'Only pending transactions can be rejected' });
    }

    transaction.status = 'failed';
    transaction.processedAt = new Date();
    transaction.meta = { ...transaction.meta, rejectionReason: reason };
    await transaction.save();

    if (transaction.type === 'deposit') {
      await ledgerService.rejectDeposit(
        transaction.userId,
        transaction.amount,
        { transactionId: transaction._id, reference: transaction.reference, reason }
      );
    } else if (transaction.type === 'withdraw') {
      // Refund frozen balance back to main balance
      await ledgerService.releaseHold(transaction.userId, transaction.amount);
    }

    logger.info('[Admin] Transaction rejected', {
      adminId: req.user._id,
      transactionId: transaction._id,
      reference: transaction.reference,
      reason,
    });

    await Notification.create({
      userId: transaction.userId,
      title: 'Transaction Rejected',
      message: `Your ${transaction.type.replace(/_/g, ' ')} of ZMW ${transaction.amount.toFixed(2)} was rejected. Reason: ${reason}`,
      type: 'error',
      link: '/wallet/transactions',
    });

    res.json({ success: true, message: 'Transaction rejected', transaction });
  } catch (err) {
    logger.error('[Admin] Reject transaction error', { error: err.message, transactionId: req.params.id });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/tasks
router.get('/tasks', ...adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, isActive } = req.query;
    const query = {};
    const safeType = safeEnum(type, TASK_TYPES);
    if (typeof isActive !== 'undefined') {
      query.isActive = isActive === 'true' || isActive === true;
    } else if (status === 'active' || status === 'inactive') {
      // Legacy support: map old status query to new isActive field
      query.isActive = status === 'active';
    }
    if (safeType) query.type = safeType;

    const total = await Task.countDocuments(query);
    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), tasks });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/campaigns
router.get('/campaigns', ...adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = {};
    const safeStatus = safeEnum(status, CAMPAIGN_STATUSES);
    if (safeStatus) query.status = safeStatus;

    const total = await Campaign.countDocuments(query);
    const campaigns = await Campaign.find(query)
      .populate('merchantId', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      campaigns,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/admin/campaigns/:id/status
router.put('/campaigns/:id/status', ...adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const safeStatus = safeEnum(status, CAMPAIGN_STATUSES);
    if (!safeStatus) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { status: safeStatus },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true, campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/admin/notifications/broadcast
router.post(
  '/notifications/broadcast',
  ...adminAuth,
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('message').notEmpty().withMessage('Message is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { title, message, type = 'info', filter = {} } = req.body;

      const userQuery = { isActive: true };
      if (filter.role) userQuery.role = filter.role;
      if (filter.vipTier) userQuery.vipTier = filter.vipTier;
      if (filter.minBalance) userQuery.balance = { $gte: filter.minBalance };

      const users = await User.find(userQuery).select('_id');

      const notifications = users.map((u) => ({
        userId: u._id,
        title,
        message,
        type,
      }));

      await Notification.insertMany(notifications);

      const io = req.app.get('io');
      if (io) {
        users.forEach((u) => {
          io.to(`user:${u._id}`).emit('newNotification', { title, message, type });
        });
      }

      res.json({
        success: true,
        message: `Broadcast sent to ${users.length} users`,
        recipientCount: users.length,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /api/admin/reports/export
router.get('/reports/export', ...adminAuth, async (req, res) => {
  try {
    const { type, startDate, endDate, status } = req.query;
    const query = {};
    const safeType = safeEnum(type, TX_TYPES);
    const safeStatus = safeEnum(status, TX_STATUSES);
    if (safeType) query.type = safeType;
    if (safeStatus) query.status = safeStatus;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(5000);

    const report = transactions.map((t) => ({
      reference: t.reference,
      user: t.userId?.name || 'N/A',
      email: t.userId?.email || '',
      phone: t.userId?.phone || '',
      type: t.type,
      amount: t.amount,
      fee: t.fee,
      netAmount: t.netAmount,
      status: t.status,
      method: t.method || '',
      createdAt: t.createdAt,
      processedAt: t.processedAt || '',
    }));

    res.json({
      success: true,
      exportedAt: new Date(),
      count: report.length,
      data: report,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/fraud-alerts
router.get('/fraud-alerts', ...adminAuth, async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const suspicious = await Transaction.aggregate([
      { $match: { createdAt: { $gte: oneHourAgo } } },
      { $group: { _id: '$userId', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      { $match: { count: { $gte: 10 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          userId: '$_id',
          name: '$user.name',
          email: '$user.email',
          phone: '$user.phone',
          transactionCount: '$count',
          totalAmount: 1,
          isFrozen: '$user.isFrozen',
        },
      },
    ]);

    res.json({
      success: true,
      alertCount: suspicious.length,
      alerts: suspicious,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
