const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    retryStrategy: (times) => (times > 3 ? null : times * 200),
  });
  redis.on('connect', () => logger.info('[Redis] Connected'));
  redis.on('error', (err) => logger.error('[Redis] Error', { error: err.message }));
} else {
  logger.warn('[Redis] REDIS_URL not set. Redis features disabled.');
  redis = {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 1,
    expire: async () => 1,
    setex: async () => 'OK',
    status: 'disabled',
  };
}

module.exports = redis;
