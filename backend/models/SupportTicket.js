const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: 300,
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
    },
    category: {
      type: String,
      enum: ['payment', 'account', 'task', 'vip', 'other'],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    replies: [
      {
        sender: { type: String, enum: ['user', 'support'], default: 'support' },
        message: String,
        sentAt: { type: Date, default: Date.now },
      },
    ],
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
