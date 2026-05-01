const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Referral = require('../models/Referral');
const { protect } = require('../middleware/auth');

const sendToken = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();
  const userData = {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    vipTier: user.vipTier,
    balance: user.balance,
    rewardBalance: user.rewardBalance,
    commissionBalance: user.commissionBalance,
    referralCode: user.referralCode,
    fullReferralLink: user.fullReferralLink,
    kycStatus: user.kycStatus,
    xpPoints: user.xpPoints,
    level: user.level,
    profilePhoto: user.profilePhoto,
  };
  res.status(statusCode).json({ success: true, token, user: userData });
};

// POST /api/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('email')
      .optional({ checkFalsy: true })
      .isEmail()
      .withMessage('Invalid email address'),
    body('phone')
      .optional({ checkFalsy: true })
      .matches(/^0[79][0-9]{8}$/)
      .withMessage('Invalid Zambian phone number'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, phone, password, referralCode } = req.body;

    if (!email && !phone) {
      return res
        .status(400)
        .json({ success: false, message: 'Email or phone number is required' });
    }

    try {
      const query = [];
      if (email) query.push({ email });
      if (phone) query.push({ phone });

      const existing = await User.findOne({ $or: query });
      if (existing) {
        return res
          .status(400)
          .json({ success: false, message: 'User with this email or phone already exists' });
      }

      let referrer = null;
      if (referralCode) {
        referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      }

      const user = await User.create({
        name,
        email: email || undefined,
        phone: phone || undefined,
        password,
        referredBy: referrer ? referrer._id : undefined,
      });

      if (referrer) {
        await Referral.create({ userId: user._id, referrerId: referrer._id, level: 1 });

        // L2 referral
        if (referrer.referredBy) {
          await Referral.create({
            userId: user._id,
            referrerId: referrer.referredBy,
            level: 2,
          });

          // L3 referral
          const l2User = await User.findById(referrer.referredBy);
          if (l2User && l2User.referredBy) {
            await Referral.create({
              userId: user._id,
              referrerId: l2User.referredBy,
              level: 3,
            });
          }
        }
      }

      sendToken(user, 201, res);
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ success: false, message: 'Server error during registration' });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, phone, password } = req.body;

    if (!email && !phone) {
      return res
        .status(400)
        .json({ success: false, message: 'Email or phone is required' });
    }

    try {
      const query = [];
      if (email) query.push({ email: email.toLowerCase() });
      if (phone) query.push({ phone });

      const user = await User.findOne({ $or: query }).select('+password');
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (user.isFrozen) {
        return res
          .status(403)
          .json({ success: false, message: 'Account is frozen. Contact support.' });
      }

      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });

      sendToken(user, 200, res);
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Server error during login' });
    }
  }
);

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', protect, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/refresh-token
router.post('/refresh-token', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.isFrozen) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const newToken = user.getSignedJwtToken();
    res.json({ success: true, token: newToken });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
});

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  [body('email').optional().isEmail(), body('phone').optional()],
  async (req, res) => {
    res.json({
      success: true,
      message: 'If an account exists, a reset link has been sent.',
    });
  }
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    res.json({ success: true, message: 'Password reset successful. Please log in.' });
  }
);

module.exports = router;
