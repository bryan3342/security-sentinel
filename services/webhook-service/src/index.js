/**
 * Webhook service entry point.
 *
 * Wires the Express app, mounts middleware (helmet, correlation ID, JSON
 * body parsing with raw-body capture for HMAC, rate limiter on /webhook,
 * GitHub-delivery replay protection), mounts routes, and handles graceful
 * shutdown.
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { client: redis } = require('./redis/client');
const { correlationId } = require('./middleware/correlationId');
const { buildReplayProtection } = require('./middleware/replayProtection');
const webhookRouter = require('./routes/webhook');
const healthRouter = require('./routes/health');
const { queue } = require('./queue/producer');

const PORT = Number(process.env.PORT) || 3000;

// Rate-limit env knobs (defaults: 60 req/min/IP for /webhook)
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 60;

// Replay TTL (default 24h, matching GitHub's redelivery window)
const REPLAY_TTL_SECONDS = Number(process.env.REPLAY_TTL_SECONDS) || 86_400;

const app = express();

// Trust X-Forwarded-For one hop (typical LB setup). Adjust per deployment.
app.set('trust proxy', 1);

app.use(helmet());
app.use(correlationId);

// Capture the raw body during JSON parsing so HMAC verification can hash
// the exact bytes GitHub signed — JSON.stringify(req.body) reorders keys
// and would break signature verification.
app.use(
  express.json({
    limit: '5mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

app.use('/', healthRouter);

const webhookLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests, slow down.' }
});

const replayProtection = buildReplayProtection({
  redis,
  ttlSeconds: REPLAY_TTL_SECONDS
});

app.use('/webhook', webhookLimiter, replayProtection, webhookRouter);

// Catch-all error handler — last defense, logs and 200s so GitHub doesn't retry.
app.use((err, req, res, _next) => {
  logger.error('Unhandled middleware error', {
    error: err.message,
    stack: err.stack,
    correlationId: req.correlationId
  });
  res.status(200).json({
    message: 'Request failed but acked to prevent retry storm',
    correlationId: req.correlationId
  });
});

const server = app.listen(PORT, () => {
  logger.info('Webhook service listening', { port: PORT });
});

// --- Graceful shutdown ---------------------------------------------------

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutdown signal received', { signal });

  // Stop accepting new connections, wait for in-flight to drain.
  await new Promise((resolve) => server.close(resolve));

  try {
    await queue.close();
  } catch (err) {
    logger.error('Queue close failed', { error: err.message });
  }

  try {
    await redis.quit();
  } catch (err) {
    logger.error('Redis quit failed', { error: err.message });
  }

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

module.exports = { app, server };
