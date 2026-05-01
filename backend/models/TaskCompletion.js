const mongoose = require('mongoose');

const TaskCompletionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Task ID is required'],
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
    reward: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
  },
  { timestamps: true }
);

TaskCompletionSchema.index({ userId: 1, taskId: 1 });
TaskCompletionSchema.index({ userId: 1, taskId: 1, completedAt: -1 });

module.exports = mongoose.model('TaskCompletion', TaskCompletionSchema);
