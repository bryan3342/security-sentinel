/**
 * Liveness and readiness endpoints.
 *
 * - `/healthz`: liveness — process is up and the event loop responds.
 *   Always 200; orchestrators use it to decide whether to restart the pod.
 * - `/readyz`: readiness — process can serve traffic (Redis reachable).
 *   Returns 503 if Redis is unreachable so a load balancer can drain.
 *
 * @module routes/health
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { client: redis } = require('../redis/client');
const { getQueueMetrics } = require('../queue/producer');

router.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

router.get('/readyz', async (req, res) => {
  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected Redis ping response: ${pong}`);
    }

    const queue = await getQueueMetrics();
    res.status(200).json({ status: 'ready', redis: 'ok', queue });
  } catch (err) {
    logger.warn('Readiness check failed', { error: err.message });
    res.status(503).json({ status: 'not-ready', error: err.message });
  }
});

module.exports = router;
