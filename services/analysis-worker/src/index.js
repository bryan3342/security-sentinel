/**
 * Analysis worker entry point.
 * Loads env, starts the BullMQ consumer, and wires graceful shutdown.
 */

require('dotenv').config();

const { createWorker, shutdown } = require('./consumer');
const db = require('./db/client');
const logger = require('./utils/logger');

const worker = createWorker();

let shuttingDown = false;
async function handleSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Received shutdown signal', { signal });
  try {
    await shutdown(worker);
    await db.close();
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  handleSignal('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});
