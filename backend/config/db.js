const mongoose = require('mongoose');
const logger = require('../utils/logger');

const DEFAULT_URI = 'mongodb://localhost:27017/zedearn';
const MAX_DELAY_MS = 30000;

const getMongoUri = () => {
  if (process.env.MONGO_URI) return process.env.MONGO_URI;
  if (process.env.NODE_ENV !== 'production') {
    logger.warn('[DB] MONGO_URI not set. Falling back to local development database.');
    return DEFAULT_URI;
  }
  logger.error('[DB] MONGO_URI not set. Waiting for environment configuration.');
  return null;
};

const connectDB = async () => {
  let delay = 1000;
  let attempt = 0;

  while (true) {
    const uri = getMongoUri();
    if (!uri) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, MAX_DELAY_MS);
      continue;
    }

    try {
      attempt += 1;
      logger.info(`[DB] Connecting to MongoDB (attempt ${attempt})...`);
      const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      logger.info(`[DB] MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (err) {
      const safeUri = uri.replace(/:\/\/[^@]+@/, '://***@');
      logger.error('[DB] MongoDB connection error', {
        error: err.message,
        uri: safeUri,
      });
      logger.info(`[DB] Retrying in ${Math.round(delay / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    }
  }
};

module.exports = connectDB;
