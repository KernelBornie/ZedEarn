const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const VIPPlan = require('../models/VIPPlan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { safeEnum } = require('../utils/sanitize');

const VALID_PLANS = ['silver', 'gold', 'platinum', 'diamond'];

// GET /api/vip/plans
router.get('/plans', protect, async (req, res) => {
  try {
    const plans = await VIPPlan.find({ isActive: true }).sort({ price: 1 });
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/vip/my-plan
router.get('/my-plan', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const isActive =
      user.vipTier !== 'none' && user.vipExpiry && user.vipExpiry > new Date();

    let plan = null;
    if (isActive) {
      plan = await VIPPlan.findOne({ name: user.vipTier });
    }

    res.json({
      success: true,
      vip: {
        tier: user.vipTier,
        expiry: user.vipExpiry,
        isActive,
        daysRemaining: isActive
          ? Math.ceil((user.vipExpiry - new Date()) / (1000 * 60 * 60 * 24))
          : 0,
        benefits: plan ? plan.benefits : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/vip/purchase
router.post(
  '/purchase',
  protect,
  [
    body('planName')
      .isIn(['silver', 'gold', 'platinum', 'diamond'])
      .withMessage('Invalid VIP plan'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { planName } = req.body;
      const safePlanName = safeEnum(planName, VALID_PLANS);
      if (!safePlanName) {
        return res.status(400).json({ success: false, message: 'Invalid VIP plan name' });
      }

      const plan = await VIPPlan.findOne({ name: safePlanName, isActive: true });
      if (!plan) {
        return res.status(404).json({ success: false, message: 'VIP plan not found' });
      }

      const user = await User.findById(req.user._id);

      if (user.balance < plan.price) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. You need ZMW ${plan.price} but have ZMW ${user.balance.toFixed(2)}`,
        });
      }

      // Calculate new expiry (extend if already VIP)
      const currentExpiry =
        user.vipExpiry && user.vipExpiry > new Date() ? user.vipExpiry : new Date();
      const newExpiry = new Date(currentExpiry);
      newExpiry.setDate(newExpiry.getDate() + plan.duration);

      // Determine new tier (use highest)
      const VIP_TIERS = ['none', 'silver', 'gold', 'platinum', 'diamond'];
      const currentTierIdx = VIP_TIERS.indexOf(user.vipTier);
      const newTierIdx = VIP_TIERS.indexOf(safePlanName);
      const finalTier = VIP_TIERS[Math.max(currentTierIdx, newTierIdx)];

      // Deduct balance
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { balance: -plan.price },
        vipTier: finalTier,
        vipExpiry: newExpiry,
        role: finalTier !== 'none' ? 'vip' : user.role,
      });

      const transaction = await Transaction.create({
        userId: req.user._id,
        type: 'vip_purchase',
        amount: plan.price,
        fee: 0,
        status: 'completed',
        description: `VIP ${safePlanName.toUpperCase()} plan purchase`,
        meta: { planName: safePlanName, duration: plan.duration, expiry: newExpiry },
        processedAt: new Date(),
      });

      await Notification.create({
        userId: req.user._id,
        title: `VIP ${safePlanName.toUpperCase()} Activated!`,
        message: `Congratulations! Your ${safePlanName.toUpperCase()} VIP plan is active until ${newExpiry.toDateString()}. Enjoy your premium benefits!`,
        type: 'success',
        link: '/vip',
      });

      const io = req.app.get('io');
      if (io) {
        const updatedUser = await User.findById(req.user._id);
        io.to(`user:${req.user._id}`).emit('balanceUpdate', { balance: updatedUser.balance });
      }

      res.json({
        success: true,
        message: `VIP ${safePlanName.toUpperCase()} plan activated!`,
        vipTier: finalTier,
        vipExpiry: newExpiry,
        transaction: transaction.reference,
        benefits: plan.benefits,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

module.exports = router;
