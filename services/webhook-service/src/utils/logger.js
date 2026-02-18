/**
 * Structured JSON logger (Winston) shared across the webhook service.
 * Transports: colorized console, `logs/error.log`, `logs/combined.log`.
 * @module utils/logger
 */

const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'webhook-service' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Write errors to file
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    // Write all logs to combined file
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    })
  ]
});

logger.info('Logger initialized');

module.exports = logger;