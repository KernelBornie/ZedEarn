const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    type: {
      type: String,
      enum: [
        'product',
        'survey',
        'adwatch',
        'sponsored',
        'daily_checkin',
        'weekly_mission',
        'referral',
        'team',
      ],
      default: 'product',
    },
    reward: {
      type: Number,
      required: [true, 'Reward amount is required'],
      min: [0, 'Reward cannot be negative'],
    },
    currency: {
      type: String,
      default: 'ZMW',
    },
    image: {
      type: String,
      default: null,
    },
    vipRequired: {
      type: String,
      enum: ['none', 'silver', 'gold', 'platinum', 'diamond'],
      default: 'none',
    },
    dailyLimit: {
      type: Number,
      default: 10,
      min: 1,
    },
    cooldownMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired'],
      default: 'active',
    },
    sponsorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    totalCompleted: {
      type: Number,
      default: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

TaskSchema.index({ status: 1, type: 1 });
TaskSchema.index({ vipRequired: 1 });
TaskSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

module.exports = mongoose.model('Task', TaskSchema);
