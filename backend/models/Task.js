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
      enum: ['ad_watch', 'survey', 'daily_checkin', 'referral', 'mission'],
      required: [true, 'Task type is required'],
    },
    reward: {
      type: Number,
      required: [true, 'Reward amount is required'],
      min: [0, 'Reward cannot be negative'],
    },
    maxCompletionsPerUser: {
      type: Number,
      default: 1,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    vipOnly: {
      type: Boolean,
      default: false,
    },
    cooldownHours: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

TaskSchema.index({ isActive: 1, type: 1 });
TaskSchema.index({ vipOnly: 1 });

module.exports = mongoose.model('Task', TaskSchema);
