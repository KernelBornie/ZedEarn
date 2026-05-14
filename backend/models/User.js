const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    phone: {
      type: String,
      trim: true,
      sparse: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    passwordResetOTP: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetOTPExpiry: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    resetOTPAttempts: {
      type: Number,
      default: 0,
    },
    lastOTPRequest: {
      type: Date,
      default: null,
    },

    role: {
      type: String,
      enum: ['guest', 'user', 'vip', 'agent', 'merchant', 'support', 'admin', 'superadmin'],
      default: 'user',
    },

    vipTier: {
      type: String,
      enum: ['none', 'silver', 'gold', 'platinum', 'diamond'],
      default: 'none',
    },

    vipExpiry: { type: Date, default: null },

    balance: { type: Number, default: 0 },
    commissionBalance: { type: Number, default: 0 },
    rewardBalance: { type: Number, default: 0 },
    frozenBalance: { type: Number, default: 0 },
    pendingBalance: { type: Number, default: 0 },
    lifetimeEarnings: { type: Number, default: 0 },

    referralCode: {
      type: String,
      unique: true,
      index: true,
      default: function () {
        return uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      },
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    kycStatus: {
      type: String,
      enum: ['pending', 'submitted', 'verified', 'rejected'],
      default: 'pending',
    },

    isFrozen: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    xpPoints: { type: Number, default: 0 },
    level: { type: Number, default: 1 },

    streakCount: { type: Number, default: 0 },
    lastCheckIn: { type: Date, default: null },
    lastLogin: { type: Date, default: null },

    deviceTokens: { type: [String], default: [] },
    profilePhoto: { type: String, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// indexes
UserSchema.index({ referralCode: 1 }, { unique: true, sparse: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ lifetimeEarnings: -1 });

// Virtual: full referral URL
UserSchema.virtual('fullReferralLink').get(function () {
  const base = process.env.CLIENT_URL;
  if (!base) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[WARN] CLIENT_URL is not set. Referral links will be empty in production.');
      return null;
    }
    return `http://localhost:5173/register?ref=${this.referralCode}`;
  }
  return `${base}/register?ref=${this.referralCode}`;
});

// PASSWORD HASHING FIXED
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = new Date();
  next();
});

// methods
UserSchema.methods.matchPassword = function (password) {
  return bcrypt.compare(password, this.password);
};

UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

module.exports = mongoose.model('User', UserSchema);
