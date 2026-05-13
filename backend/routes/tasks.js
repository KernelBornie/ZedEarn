const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const ledgerService = require('../services/ledgerService');

const router = express.Router();

const TASK_TYPES = ['ad_watch', 'survey', 'daily_checkin', 'referral', 'mission'];

const createError = (statusCode, message, extra = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
};

const isVipActive = (user) => {
  if (!user) return false;
  if (!user.vipTier || user.vipTier === 'none') return false;
  if (!user.vipExpiry) return true;
  return user.vipExpiry > new Date();
};

// GET /api/tasks - list active tasks with user status
router.get('/', protect, async (req, res) => {
  try {
    const { type } = req.query;
    const query = { isActive: true };
    const safeType = typeof type === 'string' && TASK_TYPES.includes(type) ? type : null;
    if (safeType) query.type = safeType;

    const tasks = await Task.find(query).sort({ reward: -1, createdAt: -1 });
    const taskIds = tasks.map((task) => task._id);

    const completionStats = await TaskCompletion.aggregate([
      { $match: { userId: req.user._id, taskId: { $in: taskIds } } },
      {
        $group: {
          _id: '$taskId',
          count: { $sum: 1 },
          lastCompletedAt: { $max: '$completedAt' },
        },
      },
    ]);

    const statsByTaskId = new Map(
      completionStats.map((stat) => [
        String(stat._id),
        { count: stat.count, lastCompletedAt: stat.lastCompletedAt },
      ])
    );

    const now = new Date();
    const vipActive = isVipActive(req.user);

    const tasksWithStatus = tasks.map((task) => {
      const stats = statsByTaskId.get(String(task._id)) || { count: 0, lastCompletedAt: null };
      const maxCompletions = task.maxCompletionsPerUser ?? 1;
      const remainingAvailability =
        maxCompletions > 0 ? Math.max(0, maxCompletions - stats.count) : null;

      let nextAvailableAt = null;
      if (task.cooldownHours > 0 && stats.lastCompletedAt) {
        const next = new Date(stats.lastCompletedAt.getTime() + task.cooldownHours * 60 * 60 * 1000);
        if (next > now) {
          nextAvailableAt = next;
        }
      }

      const isCompleted = maxCompletions > 0 && stats.count >= maxCompletions;
      const vipBlocked = task.vipOnly && !vipActive;
      const cooldownActive = Boolean(nextAvailableAt);
      const canComplete = !vipBlocked && !isCompleted && !cooldownActive;

      return {
        ...task.toObject(),
        userStatus: {
          completionCount: stats.count,
          remainingAvailability,
          lastCompletedAt: stats.lastCompletedAt,
          nextAvailableAt,
          isCompleted,
          vipBlocked,
          cooldownActive,
          canComplete,
        },
      };
    });

    res.json({
      success: true,
      total: tasksWithStatus.length,
      tasks: tasksWithStatus,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/tasks/:id
router.get('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    const taskId = new mongoose.Types.ObjectId(req.params.id);
    const task = await Task.findById(taskId);
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
    body('type').isIn(TASK_TYPES).withMessage('Invalid task type'),
    body('maxCompletionsPerUser')
      .optional()
      .isInt({ min: 0 })
      .withMessage('maxCompletionsPerUser must be a non-negative integer'),
    body('vipOnly').optional().isBoolean().withMessage('vipOnly must be a boolean'),
    body('cooldownHours')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('cooldownHours must be a non-negative number'),
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    const taskId = new mongoose.Types.ObjectId(req.params.id);
    const { title, description, type, reward, maxCompletionsPerUser, isActive, vipOnly, cooldownHours } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (reward !== undefined) updates.reward = reward;
    if (maxCompletionsPerUser !== undefined) updates.maxCompletionsPerUser = maxCompletionsPerUser;
    if (isActive !== undefined) updates.isActive = isActive;
    if (vipOnly !== undefined) updates.vipOnly = vipOnly;
    if (cooldownHours !== undefined) updates.cooldownHours = cooldownHours;

    const task = await Task.findByIdAndUpdate(taskId, updates, {
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    const taskId = new mongoose.Types.ObjectId(req.params.id);
    const task = await Task.findByIdAndDelete(taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const completeTaskHandler = async (req, res, taskId) => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  const taskObjectId = new mongoose.Types.ObjectId(taskId);
  const session = await mongoose.startSession();
  try {
    let task;
    let completion;
    let transaction;
    let wallet;

    await session.withTransaction(async () => {
      task = await Task.findById(taskObjectId).session(session);
      if (!task) throw createError(404, 'Task not found');
      if (!task.isActive) throw createError(400, 'Task is not active');

      const vipActive = isVipActive(req.user);
      if (task.vipOnly && !vipActive) {
        throw createError(403, 'This task is available to VIP members only');
      }

      const completionCount = await TaskCompletion.countDocuments({
        userId: req.user._id,
        taskId: task._id,
      }).session(session);

      if (task.maxCompletionsPerUser > 0 && completionCount >= task.maxCompletionsPerUser) {
        throw createError(429, 'Task completion limit reached');
      }

      if (task.cooldownHours > 0) {
        const recentCompletion = await TaskCompletion.findOne({
          userId: req.user._id,
          taskId: task._id,
        })
          .sort({ completedAt: -1 })
          .session(session);

        if (recentCompletion) {
          const nextAvailableAt = new Date(
            recentCompletion.completedAt.getTime() + task.cooldownHours * 60 * 60 * 1000
          );
          if (nextAvailableAt > new Date()) {
            throw createError(429, `Cooldown active. Next available at ${nextAvailableAt.toISOString()}`, {
              nextAvailableAt,
            });
          }
        }
      }

      const rewardAmount = task.reward;

      [completion] = await TaskCompletion.create(
        [
          {
            userId: req.user._id,
            taskId: task._id,
            reward: rewardAmount,
            status: 'approved',
          },
        ],
        { session }
      );

      [transaction] = await Transaction.create(
        [
          {
            userId: req.user._id,
            type: 'task_reward',
            amount: rewardAmount,
            fee: 0,
            status: 'completed',
            description: `Reward for completing task: ${task.title}`,
            meta: { taskId: task._id, completionId: completion._id },
            processedAt: new Date(),
          },
        ],
        { session }
      );

      await ledgerService.credit(req.user._id, rewardAmount, 'TASK', {
        taskId: task._id,
        completionId: completion._id,
        transactionRef: transaction.reference,
      }, session);

      await User.findByIdAndUpdate(
        req.user._id,
        { $inc: { xpPoints: Math.ceil(rewardAmount) } },
        { session }
      );

      const updatedUser = await User.findById(req.user._id).session(session);
      wallet = {
        balance: updatedUser.balance,
        rewardBalance: updatedUser.rewardBalance,
        commissionBalance: updatedUser.commissionBalance,
        frozenBalance: updatedUser.frozenBalance,
        pendingBalance: updatedUser.pendingBalance,
        lifetimeEarnings: updatedUser.lifetimeEarnings,
      };

      await Notification.create(
        [
          {
            userId: req.user._id,
            title: 'Task Reward Earned!',
            message: `You earned ZMW ${rewardAmount.toFixed(2)} for completing "${task.title}"`,
            type: 'reward',
            link: '/wallet',
          },
        ],
        { session }
      );
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('taskCompleted', {
        task: { _id: task._id, title: task.title },
        reward: task.reward,
      });
      io.to(`user:${req.user._id}`).emit('balanceUpdate', {
        balance: wallet.balance,
        rewardBalance: wallet.rewardBalance,
      });
    }

    res.json({
      success: true,
      message: `Task completed! You earned ZMW ${task.reward.toFixed(2)}`,
      reward: task.reward,
      transaction: transaction.reference,
      wallet,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      message: err.message || 'Server error',
      ...(err.nextAvailableAt && { nextAvailableAt: err.nextAvailableAt }),
    });
  } finally {
    session.endSession();
  }
};

// POST /api/tasks/complete/:taskId - user completes a task
router.post('/complete/:taskId', protect, (req, res) => completeTaskHandler(req, res, req.params.taskId));

// Legacy endpoint support
router.post('/:id/complete', protect, (req, res) => completeTaskHandler(req, res, req.params.id));

module.exports = router;
