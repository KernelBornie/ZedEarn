const mongoose = require('mongoose');
const logger = require('./logger');

let cachedCapability = null;
let lastCheckedAt = 0;
const CACHE_TTL_MS = 30 * 1000;

const detectReplicaSet = async () => {
  const now = Date.now();
  if (cachedCapability !== null && now - lastCheckedAt < CACHE_TTL_MS) {
    return cachedCapability;
  }

  if (!mongoose.connection?.db) {
    cachedCapability = false;
    lastCheckedAt = now;
    return cachedCapability;
  }

  try {
    const admin = mongoose.connection.db.admin();
    const status = await admin.command({ hello: 1 });
    const isReplica =
      Boolean(status.setName) ||
      status.msg === 'isdbgrid' ||
      status.isWritablePrimary === true ||
      status.ismaster === true;
    cachedCapability = Boolean(isReplica);
  } catch (err) {
    logger.warn('[DB] Unable to detect replica set support, falling back to non-transaction mode', {
      error: err.message,
    });
    cachedCapability = false;
  }

  lastCheckedAt = now;
  return cachedCapability;
};

const safeTransaction = async (callback) => {
  const canTransact = await detectReplicaSet();
  if (!canTransact) {
    return callback(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } catch (err) {
    if (String(err.message || '').includes('Transaction numbers are only allowed')) {
      logger.warn('[DB] Transaction unsupported. Falling back to non-transaction flow.');
      return callback(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = {
  safeTransaction,
  detectReplicaSet,
};
