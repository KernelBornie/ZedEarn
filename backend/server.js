require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');

const connectDB = require('./config/db');
const redis = require('./config/redis');

// Route imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const walletRoutes = require('./routes/wallet');
const referralRoutes = require('./routes/referrals');
const vipRoutes = require('./routes/vip');
const marketplaceRoutes = require('./routes/marketplace');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const supportRoutes = require('./routes/support');

// Connect to databases
connectDB();

const app = express();
const server = http.createServer(app);

// ─── Socket.IO Setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  if (userId) {
    socket.join(`user:${userId}`);
    console.log(`Socket connected: user ${userId}`);
  }

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: user ${userId}`);
  });

  socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));
});

// Make io available to routes
app.set('io', io);

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Please wait 15 minutes.' },
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ─── General Middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    app: 'ZedEarn Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/vip', vipRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/support', supportRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res
      .status(400)
      .json({ success: false, message: `${field} already exists` });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Cron Jobs ────────────────────────────────────────────────────────────────
const TaskCompletion = require('./models/TaskCompletion');
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Notification = require('./models/Notification');

// Daily midnight: reset daily task completion counts (soft reset by flagging old records)
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('[CRON] Running daily task reset...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    // Old completions are already filtered by date in task route; no destructive action needed
    console.log('[CRON] Daily reset check complete');
  } catch (err) {
    console.error('[CRON] Daily reset error:', err.message);
  }
});

// Every hour: expire VIP memberships
cron.schedule('0 * * * *', async () => {
  try {
    console.log('[CRON] Checking VIP expirations...');
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
      console.log(`[CRON] Expired VIP for ${result.modifiedCount} users`);
    }
  } catch (err) {
    console.error('[CRON] VIP expiry error:', err.message);
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

      await User.findByIdAndUpdate(tx.userId, {
        $inc: { pendingBalance: -tx.amount },
      });

      await Notification.create({
        userId: tx.userId,
        title: 'Deposit Not Confirmed',
        message: `Your deposit of ZMW ${tx.amount.toFixed(2)} (Ref: ${tx.reference}) was not confirmed within 24 hours. Please contact support if you believe this is an error.`,
        type: 'warning',
      });
    }

    if (stale.length > 0) {
      console.log(`[CRON] Flagged ${stale.length} stale pending transactions`);
    }
  } catch (err) {
    console.error('[CRON] Pending transactions cron error:', err.message);
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`\n🚀 ZedEarn Backend running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   API Base    : http://localhost:${PORT}/api`);
  console.log(`   Health      : http://localhost:${PORT}/health\n`);
});

// Graceful shutdown
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err.message);
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

module.exports = { app, server, io };
