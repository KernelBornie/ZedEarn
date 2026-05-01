const mongoose = require('mongoose');

const VIPPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ['silver', 'gold', 'platinum', 'diamond'],
      required: [true, 'VIP plan name is required'],
      unique: true,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: 0,
    },
    duration: {
      type: Number,
      default: 30,
      min: 1,
    },
    benefits: {
      tasksPerDay: { type: Number, default: 20 },
      earningMultiplier: { type: Number, default: 1.0 },
      withdrawalPriority: { type: Boolean, default: false },
      feeDiscount: { type: Number, default: 0 },
      cashbackRate: { type: Number, default: 0 },
      support: { type: String, default: 'standard' },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VIPPlan', VIPPlanSchema);
