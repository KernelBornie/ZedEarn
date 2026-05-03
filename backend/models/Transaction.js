const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const TransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    type: {
      type: String,
      enum: [
        'deposit',
        'withdraw',
        'task_reward',
        'referral_bonus',
        'cashback',
        'vip_purchase',
        'marketplace_sale',
        'adjustment',
        'transfer',
      ],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    fee: {
      type: Number,
      default: 0,
    },

    netAmount: {
      type: Number,
    },

    method: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'reversed'],
      default: 'pending',
    },

    idempotencyKey: {
      type: String,
      sparse: true,
      index: true,
    },

    providerRef: {
      type: String,
      default: null,
    },

    reference: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    description: {
      type: String,
      trim: true,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

//
// 🔥 SAFE INDEXES
//
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ type: 1 });
TransactionSchema.index(
  { reference: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { reference: { $exists: true, $ne: null } }
  }
);
TransactionSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { idempotencyKey: { $exists: true, $ne: null } }
  }
);

//
// 🔥 AUTO REFERENCE GENERATOR
//
TransactionSchema.pre('save', function (next) {
  if (!this.reference) {
    this.reference =
      'ZE-' + uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase();
  }

  this.netAmount = this.amount - this.fee;
  next();
});

module.exports = mongoose.model('Transaction', TransactionSchema);