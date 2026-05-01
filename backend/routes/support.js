const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const SupportTicket = require('../models/SupportTicket');
const { protect, authorize } = require('../middleware/auth');
const { safeEnum } = require('../utils/sanitize');

const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

// POST /api/support/ticket
router.post(
  '/ticket',
  protect,
  [
    body('subject').trim().notEmpty().withMessage('Subject is required'),
    body('message').trim().notEmpty().withMessage('Message is required'),
    body('category')
      .optional()
      .isIn(['payment', 'account', 'task', 'vip', 'other']),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { subject, message, category = 'other', priority = 'medium' } = req.body;

      const ticket = await SupportTicket.create({
        userId: req.user._id,
        subject,
        message,
        category,
        priority,
      });

      res.status(201).json({
        success: true,
        message: 'Support ticket submitted. We will respond within 24 hours.',
        ticket,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /api/support/ticket - user's tickets
router.get('/ticket', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { userId: req.user._id };
    const safeStatus = safeEnum(status, TICKET_STATUSES);
    if (safeStatus) query.status = safeStatus;

    const total = await SupportTicket.countDocuments(query);
    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      tickets,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/support/tickets - support/admin view
router.get('/tickets', protect, authorize('support', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority } = req.query;
    const query = {};
    const safeStatus = safeEnum(status, TICKET_STATUSES);
    const safePriority = safeEnum(priority, TICKET_PRIORITIES);
    if (safeStatus) query.status = safeStatus;
    if (safePriority) query.priority = safePriority;

    const total = await SupportTicket.countDocuments(query);
    const tickets = await SupportTicket.find(query)
      .populate('userId', 'name email phone vipTier')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      tickets,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/support/tickets/:id/reply - support/admin reply
router.put(
  '/tickets/:id/reply',
  protect,
  authorize('support', 'admin', 'superadmin'),
  [body('message').notEmpty().withMessage('Reply message is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { message, status } = req.body;
      const ticket = await SupportTicket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

      ticket.replies.push({ sender: 'support', message });
      if (status) ticket.status = status;
      if (status === 'resolved') ticket.resolvedAt = new Date();
      await ticket.save();

      res.json({ success: true, ticket });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /api/support/faq
router.get('/faq', (req, res) => {
  const faqs = [
    {
      id: 1,
      category: 'Account',
      question: 'How do I create a ZedEarn account?',
      answer:
        'Download the ZedEarn app, click "Register", enter your name, Zambian phone number or email, and set a password. You can also use a referral code from a friend to get bonus rewards.',
    },
    {
      id: 2,
      category: 'Earning',
      question: 'How do I earn money on ZedEarn?',
      answer:
        'You can earn by completing tasks (watching ads, filling surveys, reviewing products), referring friends, purchasing a VIP plan for higher earning rates, and selling on the marketplace.',
    },
    {
      id: 3,
      category: 'Withdrawal',
      question: 'How do I withdraw my earnings?',
      answer:
        'Go to Wallet > Withdraw. Enter your amount (minimum ZMW 20), select your mobile money provider (Airtel Money, MTN Money, or Zamtel Kwacha) or bank account. Standard fee is 5% (2% for VIP members). Processing takes 1-24 hours.',
    },
    {
      id: 4,
      category: 'VIP',
      question: 'What are the benefits of VIP membership?',
      answer:
        'VIP members enjoy higher earning multipliers (up to 2x for Diamond), reduced withdrawal fees (2% vs 5%), more daily tasks, priority support, and exclusive high-reward tasks. Plans start from ZMW 99 for Silver.',
    },
    {
      id: 5,
      category: 'Referral',
      question: 'How does the referral program work?',
      answer:
        "Share your unique referral link. When someone registers using your link, they become your Level 1 referral. You earn bonuses from their activity. ZedEarn supports up to 3 levels of referral commissions.",
    },
    {
      id: 6,
      category: 'Payment',
      question: 'What payment methods are supported?',
      answer:
        'ZedEarn supports Airtel Money, MTN Mobile Money, Zamtel Kwacha, bank transfer (Zanaco, Stanbic, FNB, etc.), and debit/credit cards for deposits. Withdrawals are via mobile money or bank transfer.',
    },
    {
      id: 7,
      category: 'Security',
      question: 'Is my money safe on ZedEarn?',
      answer:
        'Yes. ZedEarn uses bank-grade encryption, two-factor authentication, and is registered with the Bank of Zambia. Your funds are held in a secure escrow account. Never share your password or OTP with anyone.',
    },
    {
      id: 8,
      category: 'Tasks',
      question: 'Why was my task reward rejected?',
      answer:
        'Task rewards can be rejected if the completion was detected as fraudulent (using bots or multiple accounts), the task requirements were not fully met, or you exceeded the daily limit. Contact support if you believe this was an error.',
    },
  ];

  res.json({ success: true, count: faqs.length, faqs });
});

module.exports = router;
