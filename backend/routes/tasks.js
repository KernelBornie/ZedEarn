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
const { safeTransaction } = require('../utils/dbTransaction');

const router = express.Router();

const TASK_TYPES = ['ad_watch', 'survey', 'daily_checkin', 'referral', 'mission'];
const TASK_LIMIT_WINDOWS = {
  daily_checkin: 24,
  survey: 24,
  ad_watch: 24,
  mission: 168,
};
const SPAM_WINDOW_MS = 30 * 1000;

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

const getLimitWindowHours = (task) => {
  if (!task || !task.maxCompletionsPerUser || task.maxCompletionsPerUser <= 0) return null;
  return TASK_LIMIT_WINDOWS[task.type] || (task.cooldownHours > 0 ? task.cooldownHours : null);
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
          totalCount: { $sum: 1 },
          lastCompletedAt: { $max: '$completedAt' },
        },
      },
    ]);

    const statsByTaskId = new Map(
      completionStats.map((stat) => [
        String(stat._id),
        { totalCount: stat.totalCount, lastCompletedAt: stat.lastCompletedAt },
      ])
    );

    const now = new Date();
    const windowGroups = new Map();

    tasks.forEach((task) => {
      const windowHours = getLimitWindowHours(task);
      if (!windowHours) return;
      const key = String(windowHours);
      if (!windowGroups.has(key)) {
        windowGroups.set(key, { windowHours, taskIds: [] });
      }
      windowGroups.get(key).taskIds.push(task._id);
    });

    const windowCountsByTaskId = new Map();
    await Promise.all(
      [...windowGroups.values()].map(async ({ windowHours, taskIds }) => {
        if (!taskIds.length) return;
        const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
        const counts = await TaskCompletion.aggregate([
          { $match: { userId: req.user._id, taskId: { $in: taskIds }, completedAt: { $gte: windowStart } } },
          { $group: { _id: '$taskId', count: { $sum: 1 } } },
        ]);
        counts.forEach((stat) => windowCountsByTaskId.set(String(stat._id), stat.count));
      })
    );

    const vipActive = isVipActive(req.user);

    const tasksWithStatus = tasks.map((task) => {
      const stats = statsByTaskId.get(String(task._id)) || { totalCount: 0, lastCompletedAt: null };
      const windowHours = getLimitWindowHours(task);
      let count = stats.totalCount;
      if (windowHours) {
        count = windowCountsByTaskId.get(String(task._id)) || 0;
      }
      const maxCompletions = task.maxCompletionsPerUser ?? 1;
      const remainingAvailability =
        maxCompletions > 0 ? Math.max(0, maxCompletions - count) : null;

      let nextAvailableAt = null;
      if (task.cooldownHours > 0 && stats.lastCompletedAt) {
        const next = new Date(stats.lastCompletedAt.getTime() + task.cooldownHours * 60 * 60 * 1000);
        if (next > now) {
          nextAvailableAt = next;
        }
      }

      const isCompleted = maxCompletions > 0 && count >= maxCompletions;
      const vipBlocked = task.vipOnly && !vipActive;
      const cooldownActive = Boolean(nextAvailableAt);
      const canComplete = !vipBlocked && !isCompleted && !cooldownActive;

      return {
        ...task.toObject(),
        userStatus: {
          completionCount: count,
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
  const now = new Date();

  try {
    const result = await safeTransaction(async (session) => {
      const sessionOpts = session ? { session } : {};
      const taskQuery = Task.findById(taskObjectId);
      if (session) taskQuery.session(session);
      const task = await taskQuery;
      if (!task) throw createError(404, 'Task not found');
      if (!task.isActive) throw createError(400, 'Task is not active');

      const vipActive = isVipActive(req.user);
      if (task.vipOnly && !vipActive) {
        throw createError(403, 'This task is available to VIP members only');
      }

      const maxCompletions = task.maxCompletionsPerUser ?? 1;
      const limitWindowHours = getLimitWindowHours(task);
      const windowStart = limitWindowHours
        ? new Date(now.getTime() - limitWindowHours * 60 * 60 * 1000)
        : null;

      let completionCount = 0;
      if (maxCompletions > 0) {
        const countQuery = TaskCompletion.countDocuments({
          userId: req.user._id,
          taskId: task._id,
          ...(windowStart ? { completedAt: { $gte: windowStart } } : {}),
        });
        if (session) countQuery.session(session);
        completionCount = await countQuery;

        if (completionCount >= maxCompletions) {
          const message = maxCompletions === 1 ? 'Task already completed' : 'Task completion limit reached';
          const statusCode = maxCompletions === 1 ? 409 : 429;
          throw createError(statusCode, message);
        }
      }

      if (task.cooldownHours > 0) {
        const recentQuery = TaskCompletion.findOne({
          userId: req.user._id,
          taskId: task._id,
        }).sort({ completedAt: -1 });
        if (session) recentQuery.session(session);
        const recentCompletion = await recentQuery;

        if (recentCompletion) {
          const nextAvailableAt = new Date(
            recentCompletion.completedAt.getTime() + task.cooldownHours * 60 * 60 * 1000
          );
          if (nextAvailableAt > now) {
            const remainingMs = nextAvailableAt.getTime() - now.getTime();
            throw createError(429, `Cooldown active. Try again in ${Math.ceil(remainingMs / 60000)} minutes`, {
              nextAvailableAt,
              remainingMs,
            });
          }
        }
      }

      const rewardAmount = Number(task.reward || 0);
      if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
        throw createError(400, 'Invalid task reward');
      }

      const windowKey = windowStart ? windowStart.toISOString() : 'lifetime';
      const completionIndex = maxCompletions > 0 ? completionCount + 1 : null;
      const spamBucket = Math.floor(now.getTime() / SPAM_WINDOW_MS);
      const idempotencyKey = maxCompletions > 0
        ? `task:${task._id}:user:${req.user._id}:window:${windowKey}:index:${completionIndex}`
        : `task:${task._id}:user:${req.user._id}:bucket:${spamBucket}`;

      const existingQuery = TaskCompletion.findOne({ idempotencyKey });
      if (session) existingQuery.session(session);
      const existingCompletion = await existingQuery;
      if (existingCompletion) {
        throw createError(409, 'Task already completed');
      }

      let transaction;
      try {
        [transaction] = await Transaction.create(
          [
            {
              userId: req.user._id,
              type: 'task_reward',
              amount: rewardAmount,
              fee: 0,
              status: 'completed',
              idempotencyKey,
              description: `Reward for completing task: ${task.title}`,
              meta: {
                taskId: task._id,
                completionIndex,
                windowStart,
              },
              processedAt: new Date(),
            },
          ],
          sessionOpts
        );
      } catch (err) {
        if (err.code === 11000 && (err.keyPattern?.idempotencyKey || String(err.message).includes('idempotencyKey'))) {
          throw createError(409, 'Task already completed');
        }
        throw err;
      }

      let completion;
      try {
        [completion] = await TaskCompletion.create(
          [
            {
              userId: req.user._id,
              taskId: task._id,
              reward: rewardAmount,
              status: 'approved',
              completedAt: now,
              idempotencyKey,
            },
          ],
          sessionOpts
        );
      } catch (err) {
        await Transaction.findByIdAndUpdate(
          transaction._id,
          { status: 'failed', meta: { ...transaction.meta, failureReason: err.message } },
          sessionOpts
        );
        if (err.code === 11000 && (err.keyPattern?.idempotencyKey || String(err.message).includes('idempotencyKey'))) {
          throw createError(409, 'Task already completed');
        }
        throw err;
      }

      await Transaction.findByIdAndUpdate(
        transaction._id,
        { $set: { 'meta.completionId': completion._id } },
        sessionOpts
      );

      try {
        await ledgerService.credit(
          req.user._id,
          rewardAmount,
          'TASK',
          {
            taskId: task._id,
            completionId: completion._id,
            transactionRef: transaction.reference,
          },
          session
        );
      } catch (err) {
        await Transaction.findByIdAndUpdate(
          transaction._id,
          { status: 'failed', meta: { ...transaction.meta, failureReason: err.message } },
          sessionOpts
        );
        await TaskCompletion.findByIdAndUpdate(
          completion._id,
          { status: 'rejected' },
          sessionOpts
        );
        throw err;
      }

      await User.findByIdAndUpdate(
        req.user._id,
        { $inc: { xpPoints: Math.ceil(rewardAmount) } },
        sessionOpts
      );

      const updatedUserQuery = User.findById(req.user._id);
      if (session) updatedUserQuery.session(session);
      const updatedUser = await updatedUserQuery;
      if (!updatedUser) {
        throw createError(404, 'User not found');
      }
      const wallet = {
        balance: updatedUser.balance,
        rewardBalance: updatedUser.rewardBalance,
        commissionBalance: updatedUser.commissionBalance,
        frozenBalance: updatedUser.frozenBalance,
        pendingBalance: updatedUser.pendingBalance,
        lifetimeEarnings: updatedUser.lifetimeEarnings,
      };

      try {
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
          sessionOpts
        );
      } catch (err) {
        console.error('Task completion notification failed', err.message);
      }

      return { task, transaction, completion, wallet, rewardAmount };
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('taskCompleted', {
        task: { _id: result.task._id, title: result.task.title },
        reward: result.rewardAmount,
      });
      io.to(`user:${req.user._id}`).emit('balanceUpdate', {
        balance: result.wallet.balance,
        rewardBalance: result.wallet.rewardBalance,
      });
    }

    res.json({
      success: true,
      message: `Task completed! You earned ZMW ${result.rewardAmount.toFixed(2)}`,
      reward: result.rewardAmount,
      transaction: result.transaction.reference,
      wallet: result.wallet,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      message: err.message || 'Server error',
      ...(err.nextAvailableAt && { nextAvailableAt: err.nextAvailableAt }),
      ...(err.remainingMs !== undefined && { cooldownRemainingMs: err.remainingMs }),
    });
  }
};

// POST /api/tasks/complete/:taskId - user completes a task
router.post('/complete/:taskId', protect, (req, res) => completeTaskHandler(req, res, req.params.taskId));

// Legacy endpoint support
router.post('/:id/complete', protect, (req, res) => completeTaskHandler(req, res, req.params.id));

module.exports = router;
