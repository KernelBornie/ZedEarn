/**
 * logger.js
 *
 * Structured logger for ZedEarn using Winston.
 * Outputs JSON in production, colorized text in development.
 *
 * Usage:
 *   const logger = require('../utils/logger');
 *   logger.info('Event', { userId, reference });
 *   logger.error('Payment failed', { error: err.message, reference });
 */

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, json, colorize, printf, errors } = format;

const isProduction = process.env.NODE_ENV === 'production';

const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]: ${message}${metaStr}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  defaultMeta: { service: 'zedearn-backend' },
  format: isProduction
    ? combine(timestamp(), errors({ stack: true }), json())
    : combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        errors({ stack: true }),
        devFormat
      ),
  transports: [new transports.Console()],
  exitOnError: false,
});

module.exports = logger;
