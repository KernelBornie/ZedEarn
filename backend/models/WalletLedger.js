const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const LEDGER_TYPES = ['CREDIT', 'DEBIT'];
const LEDGER_CATEGORIES = [
  'TASK',
  'VIP',
  'WITHDRAWAL',
  'DEPOSIT',
  'REFERRAL',
  'ADMIN',
  'MARKETPLACE',
  'SYSTEM',
];
const LEDGER_STATUSES = ['PENDING', 'POSTED', 'REVERSED'];

const WalletLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: LEDGER_TYPES,
      required: true,
    },

    category: {
      type: String,
      enum: LEDGER_CATEGORIES,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount must be non-negative'],
    },

    status: {
      type: String,
      enum: LEDGER_STATUSES,
      default: 'POSTED',
    },

    reference: {
      type: String,
      unique: true,
      index: true,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// ─── Compound index for fast wallet history queries ────────────────────────────
WalletLedgerSchema.index({ userId: 1, createdAt: -1 });
WalletLedgerSchema.index({ userId: 1, status: 1 });

// ─── Auto-generate unique reference ───────────────────────────────────────────
WalletLedgerSchema.pre('save', function (next) {
  if (!this.reference) {
    this.reference =
      'WL-' + uuidv4().replace(/-/g, '').substring(0, 14).toUpperCase();
  }
  next();
});

// ─── Enforce immutability for POSTED entries ───────────────────────────────────
WalletLedgerSchema.pre('save', function (next) {
  if (!this.isNew && this._originalStatus === 'POSTED') {
    // Only allow status change from POSTED → REVERSED, nothing else
    const allowedChange =
      this.isModified('status') &&
      this.status === 'REVERSED' &&
      Object.keys(this.modifiedPaths()).every(
        (p) => p === 'status' || p.startsWith('meta')
      );
    if (!allowedChange) {
      return next(new Error('POSTED ledger entries are immutable'));
    }
  }
  next();
});

WalletLedgerSchema.post('init', function () {
  this._originalStatus = this.status;
});

module.exports = mongoose.model('WalletLedger', WalletLedgerSchema);
