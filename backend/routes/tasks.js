const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { safeEnum } = require('../utils/sanitize');

const TASK_TYPES = ['product', 'survey', 'adwatch', 'sponsored', 'daily_checkin', 'weekly_mission', 'referral', 'team'];
const VIP_TIERS = ['none', 'silver', 'gold', 'platinum', 'diamond'];

const hasRequiredVip = (userTier, requiredTier) => {
  if (requiredTier === 'none') return true;
  return VIP_TIERS.indexOf(userTier) >= VIP_TIERS.indexOf(requiredTier);
};

// GET /api/tasks - list active tasks
router.get('/', protect, async (req, res) => {
  try {
    const { type, vipRequired, page = 1, limit = 20 } = req.query;
    const query = { status: 'active' };

    const safeType = safeEnum(type, TASK_TYPES);
    if (safeType) query.type = safeType;

    // Filter by user's VIP tier (only show tasks user can access)
    const accessibleTiers = VIP_TIERS.slice(0, VIP_TIERS.indexOf(req.user.vipTier) + 1);
    query.vipRequired = { $in: accessibleTiers };

    const total = await Task.countDocuments(query);
    const tasks = await Task.find(query)
      .sort({ reward: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      tasks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/tasks/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/tasks - admin create task
router.post(
  '/',
  protect,
  authorize('admin', 'superadmin', 'merchant'),
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('reward').isNumeric().withMessage('Reward must be a number'),
    body('type')
      .optional()
      .isIn(['product', 'survey', 'adwatch', 'sponsored', 'daily_checkin', 'weekly_mission', 'referral', 'team']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const task = await Task.create(req.body);
      res.status(201).json({ success: true, task });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// PUT /api/tasks/:id - admin update
router.put('/:id', protect, authorize('admin', 'superadmin', 'merchant'), async (req, res) => {
  try {
    const { title, description, type, reward, vipRequired, dailyLimit, cooldownMinutes, status, tags, expiresAt, image } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (reward !== undefined) updates.reward = reward;
    if (vipRequired !== undefined) updates.vipRequired = vipRequired;
    if (dailyLimit !== undefined) updates.dailyLimit = dailyLimit;
    if (cooldownMinutes !== undefined) updates.cooldownMinutes = cooldownMinutes;
    if (status !== undefined) updates.status = status;
    if (tags !== undefined) updates.tags = tags;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt;
    if (image !== undefined) updates.image = image;

    const task = await Task.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/tasks/:id - admin
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/tasks/:id/complete - user completes a task
router.post('/:id/complete', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (task.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Task is not active' });
    }

    // Check VIP requirement
    if (!hasRequiredVip(req.user.vipTier, task.vipRequired)) {
      return res.status(403).json({
        success: false,
        message: `This task requires ${task.vipRequired.toUpperCase()} VIP tier`,
      });
    }

    // Check expiry
    if (task.expiresAt && task.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'Task has expired' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check daily limit
    const todayCount = await TaskCompletion.countDocuments({
      userId: req.user._id,
      taskId: task._id,
      completedAt: { $gte: today, $lt: tomorrow },
    });

    if (todayCount >= task.dailyLimit) {
      return res.status(429).json({
        success: false,
        message: `Daily limit of ${task.dailyLimit} reached for this task`,
      });
    }

    // Check cooldown
    if (task.cooldownMinutes > 0) {
      const cooldownFrom = new Date(Date.now() - task.cooldownMinutes * 60 * 1000);
      const recentCompletion = await TaskCompletion.findOne({
        userId: req.user._id,
        taskId: task._id,
        completedAt: { $gte: cooldownFrom },
      });
      if (recentCompletion) {
        const nextAvailable = new Date(
          recentCompletion.completedAt.getTime() + task.cooldownMinutes * 60 * 1000
        );
        return res.status(429).json({
          success: false,
          message: `Cooldown active. Next available at ${nextAvailable.toISOString()}`,
        });
      }
    }

    // Calculate reward (VIP multiplier)
    let rewardAmount = task.reward;
    const vipMultipliers = { none: 1, silver: 1.1, gold: 1.25, platinum: 1.5, diamond: 2.0 };
    rewardAmount = parseFloat(
      (rewardAmount * (vipMultipliers[req.user.vipTier] || 1)).toFixed(2)
    );

    // Create completion record
    const completion = await TaskCompletion.create({
      userId: req.user._id,
      taskId: task._id,
      reward: rewardAmount,
      status: 'approved',
    });

    // Create transaction
    const transaction = await Transaction.create({
      userId: req.user._id,
      type: 'task_reward',
      amount: rewardAmount,
      fee: 0,
      status: 'completed',
      description: `Reward for completing task: ${task.title}`,
      meta: { taskId: task._id, completionId: completion._id },
      processedAt: new Date(),
    });

    // Update user balances
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $inc: {
          rewardBalance: rewardAmount,
          balance: rewardAmount,
          lifetimeEarnings: rewardAmount,
          xpPoints: Math.ceil(rewardAmount),
        },
      },
      { new: true }
    );

    // Update task counter
    await Task.findByIdAndUpdate(task._id, { $inc: { totalCompleted: 1 } });

    // Create notification
    await Notification.create({
      userId: req.user._id,
      title: 'Task Reward Earned!',
      message: `You earned ZMW ${rewardAmount.toFixed(2)} for completing "${task.title}"`,
      type: 'reward',
      link: '/wallet',
    });

    // Emit socket event if io available
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('taskCompleted', {
        task: { _id: task._id, title: task.title },
        reward: rewardAmount,
      });
      io.to(`user:${req.user._id}`).emit('balanceUpdate', {
        balance: user.balance,
        rewardBalance: user.rewardBalance,
      });
    }

    res.json({
      success: true,
      message: `Task completed! You earned ZMW ${rewardAmount.toFixed(2)}`,
      reward: rewardAmount,
      transaction: transaction.reference,
      newBalance: user.balance,
      newRewardBalance: user.rewardBalance,
    });
  } catch (err) {
    console.error('Task complete error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
