const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Referral = require('../models/Referral');
const { protect } = require('../middleware/auth');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const router = express.Router();

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const PASSWORD_REQUIREMENTS =
  'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.';
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const isStrongPassword = (password) => PASSWORD_REGEX.test(String(password || ''));
const normalizeEmail = (email) => (email ? String(email).trim().toLowerCase() : undefined);

const otpRequestLimiter = rateLimit({
  windowMs: OTP_REQUEST_WINDOW_MS,
  max: 5,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const sendToken = (user, statusCode, res, message) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ success: false, message: 'JWT_SECRET is not configured.' });
  }
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
  res.status(statusCode).json({ success: true, token, user: userData, ...(message ? { message } : {}) });
};

// POST /api/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('password')
      .custom((value) => {
        if (!isStrongPassword(value)) {
          throw new Error(PASSWORD_REQUIREMENTS);
        }
        return true;
      }),
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
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = phone ? String(phone).trim() : undefined;

    if (!normalizedEmail && !normalizedPhone) {
      return res
        .status(400)
        .json({ success: false, message: 'Email or phone number is required' });
    }

    try {
      const query = [];
      if (normalizedEmail) query.push({ email: normalizedEmail });
      if (normalizedPhone) query.push({ phone: normalizedPhone });

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
        email: normalizedEmail || undefined,
        phone: normalizedPhone || undefined,
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

      sendToken(user, 201, res, 'Registration successful');
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
    body('email')
      .optional({ checkFalsy: true })
      .isEmail()
      .withMessage('Invalid email address'),
    body('phone')
      .optional({ checkFalsy: true })
      .matches(/^0[79][0-9]{8}$/)
      .withMessage('Invalid Zambian phone number'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, phone, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = phone ? String(phone).trim() : undefined;

    if (!normalizedEmail && !normalizedPhone) {
      return res
        .status(400)
        .json({ success: false, message: 'Email or phone is required' });
    }

    try {
      const query = [];
      if (normalizedEmail) query.push({ email: normalizedEmail });
      if (normalizedPhone) query.push({ phone: normalizedPhone });

      let userQuery = User.findOne({ $or: query });
      if (userQuery && typeof userQuery.select === 'function') {
        userQuery = userQuery.select('+password');
      }
      const user = await userQuery;
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
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
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
    if (user.passwordChangedAt && decoded.iat) {
      const changedAt = new Date(user.passwordChangedAt).getTime();
      if (changedAt > decoded.iat * 1000) {
        return res.status(401).json({ success: false, message: 'Token expired. Please log in again.' });
      }
    }

    const newToken = user.getSignedJwtToken();
    res.json({ success: true, token: newToken });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
});

// POST /api/auth/change-password
router.post(
  '/change-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .custom((value) => {
        if (!isStrongPassword(value)) {
          throw new Error(PASSWORD_REQUIREMENTS);
        }
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const user = await User.findById(req.user._id).select('+password');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const matches = await user.matchPassword(currentPassword);
      if (!matches) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }

      const reuse = await user.matchPassword(newPassword);
      if (reuse) {
        return res.status(400).json({ success: false, message: 'New password must be different from the old password' });
      }

      user.password = newPassword;
      user.passwordResetOTP = null;
      user.passwordResetOTPExpiry = null;
      user.resetOTPAttempts = 0;
      user.lastOTPRequest = null;
      await user.save();

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
      logger.error('Change password error', { error: err.message });
      res.status(500).json({ success: false, message: 'Server error during password update' });
    }
  }
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  otpRequestLimiter,
  [body('email').isEmail().withMessage('Valid email is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const email = normalizeEmail(req.body.email);
    const responsePayload = {
      success: true,
      message: 'If an account exists, an OTP has been sent.',
    };

    try {
      const user = await User.findOne({ email }).select('+passwordResetOTP');
      if (!user) {
        return res.json(responsePayload);
      }

      const otp = crypto.randomInt(100000, 999999).toString();
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

      user.passwordResetOTP = otpHash;
      user.passwordResetOTPExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
      user.resetOTPAttempts = 0;
      user.lastOTPRequest = new Date();
      await user.save({ validateBeforeSave: false });

      await emailService.sendPasswordResetOTP({
        to: user.email,
        name: user.name,
        otp,
      });

      return res.json(responsePayload);
    } catch (err) {
      logger.error('Forgot password error', { error: err.message });
      return res.json(responsePayload);
    }
  }
);

// POST /api/auth/verify-reset-otp
router.post(
  '/verify-reset-otp',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').matches(/^[0-9]{6}$/).withMessage('OTP must be 6 digits'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp).trim();

    try {
      const user = await User.findOne({ email }).select('+passwordResetOTP +passwordResetOTPExpiry');
      if (!user || !user.passwordResetOTP || !user.passwordResetOTPExpiry) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
      }

      if (user.passwordResetOTPExpiry < new Date()) {
        user.passwordResetOTP = null;
        user.passwordResetOTPExpiry = null;
        user.resetOTPAttempts = 0;
        await user.save({ validateBeforeSave: false });
        return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
      }

      if (user.resetOTPAttempts >= OTP_MAX_ATTEMPTS) {
        return res.status(429).json({ success: false, message: 'Too many OTP attempts. Request a new OTP.' });
      }

      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      if (otpHash !== user.passwordResetOTP) {
        user.resetOTPAttempts += 1;
        await user.save({ validateBeforeSave: false });
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
      }

      if (!process.env.JWT_SECRET) {
        return res.status(500).json({ success: false, message: 'JWT_SECRET is not configured.' });
      }

      user.passwordResetOTP = null;
      user.passwordResetOTPExpiry = null;
      user.resetOTPAttempts = 0;
      await user.save({ validateBeforeSave: false });

      const resetToken = jwt.sign(
        { id: user._id, type: 'password_reset' },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      return res.json({ success: true, resetToken });
    } catch (err) {
      logger.error('Verify OTP error', { error: err.message });
      return res.status(500).json({ success: false, message: 'Server error during OTP verification' });
    }
  }
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  [
    body('newPassword')
      .custom((value) => {
        if (!isStrongPassword(value)) {
          throw new Error(PASSWORD_REQUIREMENTS);
        }
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Reset token is required' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: 'JWT_SECRET is not configured.' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.type !== 'password_reset') {
        return res.status(401).json({ success: false, message: 'Invalid reset token' });
      }

      const user = await User.findById(decoded.id).select('+password');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (user.passwordChangedAt && decoded.iat) {
        const changedAt = new Date(user.passwordChangedAt).getTime();
        if (changedAt > decoded.iat * 1000) {
          return res.status(401).json({ success: false, message: 'Reset token expired' });
        }
      }

      const reuse = await user.matchPassword(req.body.newPassword);
      if (reuse) {
        return res.status(400).json({ success: false, message: 'New password must be different from the old password' });
      }

      user.password = req.body.newPassword;
      user.passwordResetOTP = null;
      user.passwordResetOTPExpiry = null;
      user.resetOTPAttempts = 0;
      user.lastOTPRequest = null;
      await user.save();

      return res.json({ success: true, message: 'Password reset successful' });
    } catch (err) {
      logger.error('Reset password error', { error: err.message });
      return res.status(401).json({ success: false, message: 'Reset token invalid or expired' });
    }
  }
);

module.exports = router;
