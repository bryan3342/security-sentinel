/**
 * BullMQ Worker for the `security-analysis` queue.
 * Wires the job handler, registers lifecycle event logging, and exposes
 * a graceful-shutdown helper used by the entry point.
 * @module consumer
 */

const { Worker } = require('bullmq');
const { connection } = require('./queue/connection');
const { analyzeCommit } = require('./handlers/analyzeCommit');
const logger = require('./utils/logger');

const QUEUE_NAME = 'security-analysis';

function createWorker() {
  const concurrency = Number(process.env.WORKER_CONCURRENCY) || 2;

  const worker = new Worker(QUEUE_NAME, analyzeCommit, {
    connection,
    concurrency
  });

  worker.on('active', (job) => {
    logger.info('Job active', { jobId: job.id, name: job.name });
  });

  worker.on('completed', (job, result) => {
    logger.info('Job completed', { jobId: job.id, result });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', {
      jobId: job ? job.id : null,
      attemptsMade: job ? job.attemptsMade : null,
      error: err.message
    });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { error: err.message });
  });

  logger.info('Worker started', { queue: QUEUE_NAME, concurrency });
  return worker;
}

async function shutdown(worker) {
  logger.info('Shutting down worker');
  await worker.close();
  await connection.quit();
}

module.exports = { createWorker, shutdown, QUEUE_NAME };
