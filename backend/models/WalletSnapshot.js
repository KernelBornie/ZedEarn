const mongoose = require('mongoose');

const WalletSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    availableBalance: {
      type: Number,
      default: 0,
    },

    pendingBalance: {
      type: Number,
      default: 0,
    },

    frozenBalance: {
      type: Number,
      default: 0,
    },

    lifetimeEarnings: {
      type: Number,
      default: 0,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // No automatic timestamps — we manage updatedAt manually so we can
    // always reflect the exact moment of the last ledger sync.
    timestamps: false,
  }
);

module.exports = mongoose.model('WalletSnapshot', WalletSnapshotSchema);
