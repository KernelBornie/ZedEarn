const path = require('path');

const dotenvResult = require('dotenv').config({
  path: path.resolve(__dirname, '.env'),
});

if (dotenvResult.error) {
  console.warn(
    '⚠️  dotenv could not load backend/.env; falling back to process env:',
    dotenvResult.error.message
  );
}

console.log("🔧 ZedEarn ENV CHECK");
console.log("MONGO_URI:", process.env.MONGO_URI);
console.log("REDIS_URL:", process.env.REDIS_URL);
console.log("PORT:", process.env.PORT);

const hasPlaceholderSyntax = (value) => {
  if (!value) {
    return false;
  }

  return /<[^>]+>/.test(value);
};

const validateEnv = () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ Missing MONGO_URI in backend/.env');
    return false;
  }

  if (hasPlaceholderSyntax(process.env.MONGO_URI)) {
    console.error(
      '❌ MONGO_URI contains placeholder values (e.g., <user>, <password>, <cluster-id>). Update backend/.env with real credentials.'
    );
    return false;
  }

  if (!process.env.JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET is not defined in .env');
    return false;
  }

  return true;
};

if (!validateEnv()) {
  process.exit(1);
}

const cron = require('node-cron');

const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { app, server, io } = require('./app');

// ─── Cron Jobs ────────────────────────────────────────────────────────────────
const TaskCompletion = require('./models/TaskCompletion');
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Notification = require('./models/Notification');
const ledgerService = require('./services/ledgerService');

// Daily midnight: reset daily task completion counts (soft reset by flagging old records)
cron.schedule('0 0 * * *', async () => {
  try {
    logger.info('[CRON] Running daily task reset...');
    // Old completions are already filtered by date in task route; no destructive action needed
    logger.info('[CRON] Daily reset check complete');
  } catch (err) {
    logger.error('[CRON] Daily reset error', { error: err.message });
  }
});

// Every hour: expire VIP memberships
cron.schedule('0 * * * *', async () => {
  try {
    logger.info('[CRON] Checking VIP expirations...');
    const result = await User.updateMany(
      {
        vipTier: { $ne: 'none' },
        vipExpiry: { $lt: new Date() },
      },
      {
        $set: { vipTier: 'none', vipExpiry: null },
      }
    );
    if (result.modifiedCount > 0) {
      logger.info(`[CRON] Expired VIP for ${result.modifiedCount} users`);
    }
  } catch (err) {
    logger.error('[CRON] VIP expiry error', { error: err.message });
  }
});

// Every 30 minutes: auto-process long-pending transactions (flag as stale)
cron.schedule('*/30 * * * *', async () => {
  try {
    const staleTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await Transaction.find({
      status: 'pending',
      type: 'deposit',
      createdAt: { $lt: staleTime },
    });

    for (const tx of stale) {
      tx.status = 'failed';
      tx.meta = { ...tx.meta, staleFlagged: true, flaggedAt: new Date() };
      await tx.save();

      await ledgerService.rejectDeposit(tx.userId, tx.amount, {
        reason: 'stale_deposit',
        flaggedAt: new Date(),
        reference: tx.reference,
      });

      await Notification.create({
        userId: tx.userId,
        title: 'Deposit Not Confirmed',
        message: `Your deposit of ZMW ${tx.amount.toFixed(2)} (Ref: ${tx.reference}) was not confirmed within 24 hours. Please contact support if you believe this is an error.`,
        type: 'warning',
      });
    }

    if (stale.length > 0) {
      logger.info(`[CRON] Flagged ${stale.length} stale pending transactions`);
    }
  } catch (err) {
    logger.error('[CRON] Pending transactions cron error', { error: err.message });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;

const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    logger.info(`\n🚀 ZedEarn Backend running on port ${PORT}`);
    logger.info(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    logger.info(`   API Base    : http://localhost:${PORT}/api`);
    logger.info(`   Health      : http://localhost:${PORT}/health\n`);
  });
};

startServer();

// Graceful shutdown
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection', { error: err.message });
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

module.exports = { app, server, io };
