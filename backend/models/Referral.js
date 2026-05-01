const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Referrer ID is required'],
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
      max: 3,
    },
    earnings: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

ReferralSchema.index({ referrerId: 1, level: 1 });
ReferralSchema.index({ userId: 1 });

module.exports = mongoose.model('Referral', ReferralSchema);
