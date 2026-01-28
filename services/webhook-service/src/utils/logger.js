/** Winston Logger
 * This module sets up a Winston logger for the webhook service.
 * It configures different transports for console and file logging,
 * and formats logs in JSON with timestamps.
 * @module utils/logger
 * @requires winston
 * @exports logger
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