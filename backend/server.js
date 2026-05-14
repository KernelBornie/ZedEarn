const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  console.warn('Missing backend/.env file — falling back to system environment variables');
  require('dotenv').config();
}

const applyEnvDefaults = () => {
  if (!process.env.MONGO_URI && process.env.NODE_ENV !== 'production') {
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/zedearn';
  }
  if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'production') {
    process.env.JWT_SECRET = 'zedearn_secure_dev_secret';
  }
  if (!process.env.CLIENT_URL && process.env.NODE_ENV !== 'production') {
    process.env.CLIENT_URL = 'http://localhost:5173';
  }
  if (!process.env.PORT) {
    process.env.PORT = '5001';
  }
};

applyEnvDefaults();

const safeLog = (label, value) => {
  if (!value) return console.log(`${label}: <missing>`);
  if (label === 'MONGO_URI') {
    return console.log(`${label}: ${value.replace(/:\/\/[^@]+@/, '://***@')}`);
  }
  return console.log(`${label}: ${value}`);
};

console.log('🔧 ZedEarn ENV CHECK');
safeLog('MONGO_URI', process.env.MONGO_URI);
safeLog('REDIS_URL', process.env.REDIS_URL);
safeLog('PORT', process.env.PORT);

const validateEnv = () => {
  let valid = true;
  if (!process.env.MONGO_URI) {
    console.error('❌ Missing MONGO_URI. The server will keep retrying until it is set.');
    valid = false;
  }
  if (process.env.MONGO_URI && /<[^>]+>/.test(process.env.MONGO_URI)) {
    console.error(
      '❌ MONGO_URI contains placeholder values (e.g., <user>, <password>, <cluster-id>). Update backend/.env with real credentials.'
    );
    valid = false;
  }
  if (!process.env.JWT_SECRET) {
    console.error('❌ Missing JWT_SECRET. Authentication tokens may fail until it is set.');
    valid = false;
  }
  if (!process.env.CLIENT_URL) {
    console.warn('⚠️  Missing CLIENT_URL. Falling back to http://localhost:5173.');
  }
  return valid;
};

validateEnv();

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

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message });
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
