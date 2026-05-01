const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Referral = require('../models/Referral');
const { protect, authorize } = require('../middleware/auth');
const { escapeRegex, safeEnum } = require('../utils/sanitize');

const USER_ROLES = ['guest', 'user', 'vip', 'agent', 'merchant', 'support', 'admin', 'superadmin'];
const VIP_TIERS = ['none', 'silver', 'gold', 'platinum', 'diamond'];

// GET /api/users/ - admin only: list all users
router.get('/', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      role,
      vipTier,
      isFrozen,
    } = req.query;

    const query = {};
    if (search) {
      const safeSearch = escapeRegex(String(search).substring(0, 100));
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
        { referralCode: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    const safeRole = safeEnum(role, USER_ROLES);
    const safeVipTier = safeEnum(vipTier, VIP_TIERS);
    if (safeRole) query.role = safeRole;
    if (safeVipTier) query.vipTier = safeVipTier;
    if (isFrozen !== undefined) query.isFrozen = isFrozen === 'true';

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      users,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/users/leaderboard
router.get('/leaderboard', protect, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const users = await User.find({ isActive: true })
      .select('name profilePhoto lifetimeEarnings level vipTier xpPoints')
      .sort({ lifetimeEarnings: -1 })
      .limit(Number(limit));

    res.json({ success: true, leaderboard: users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/users/referral-stats
router.get('/referral-stats', protect, async (req, res) => {
  try {
    const [l1, l2, l3] = await Promise.all([
      Referral.countDocuments({ referrerId: req.user._id, level: 1 }),
      Referral.countDocuments({ referrerId: req.user._id, level: 2 }),
      Referral.countDocuments({ referrerId: req.user._id, level: 3 }),
    ]);

    const earningsAgg = await Referral.aggregate([
      { $match: { referrerId: req.user._id } },
      { $group: { _id: null, total: { $sum: '$earnings' } } },
    ]);

    const totalEarnings = earningsAgg[0]?.total || 0;

    res.json({
      success: true,
      stats: {
        l1Count: l1,
        l2Count: l2,
        l3Count: l3,
        totalReferrals: l1 + l2 + l3,
        totalEarnings,
        referralCode: req.user.referralCode,
        referralLink: req.user.fullReferralLink,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/users/profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('referredBy', 'name referralCode');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/users/profile
router.put(
  '/profile',
  protect,
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('phone')
      .optional({ checkFalsy: true })
      .matches(/^0[79][0-9]{8}$/)
      .withMessage('Invalid Zambian phone number'),
    body('profilePhoto')
      .optional({ checkFalsy: true })
      .isURL()
      .withMessage('Profile photo must be a valid URL'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { name, phone, profilePhoto } = req.body;
      const updates = {};
      if (name) updates.name = String(name).substring(0, 100);
      if (phone) updates.phone = phone;
      if (profilePhoto) updates.profilePhoto = profilePhoto;

      const user = await User.findByIdAndUpdate(req.user._id, updates, {
        new: true,
        runValidators: true,
      });

      res.json({ success: true, user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /api/users/:id - admin
router.get('/:id', protect, authorize('admin', 'superadmin', 'support'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('referredBy', 'name email phone');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/users/:id/freeze - admin
router.put('/:id/freeze', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isFrozen = !user.isFrozen;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: `Account ${user.isFrozen ? 'frozen' : 'unfrozen'} successfully`,
      isFrozen: user.isFrozen,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/users/:id/role - admin/superadmin
router.put(
  '/:id/role',
  protect,
  authorize('admin', 'superadmin'),
  [body('role').isIn(['guest', 'user', 'vip', 'agent', 'merchant', 'support', 'admin', 'superadmin'])],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { role } = req.body;
      const safeRole = safeEnum(role, USER_ROLES);

      if (!safeRole) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }

      // Only superadmin can assign admin/superadmin roles
      if (['admin', 'superadmin'].includes(safeRole) && req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'Only superadmin can assign admin roles' });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role: safeRole },
        { new: true, runValidators: true }
      );
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      res.json({ success: true, message: 'Role updated', user });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

module.exports = router;
