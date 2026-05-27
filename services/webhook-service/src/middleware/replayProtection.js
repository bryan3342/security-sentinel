/**
 * GitHub webhook replay protection.
 *
 * Every GitHub webhook carries an `X-GitHub-Delivery` UUID. We record that
 * UUID in Redis with `SET NX EX <ttl>`. If the key already exists, the
 * request is a redelivery (GitHub retries up to 24h on non-2xx) and we
 * short-circuit with a 200 — never re-enqueue the same delivery twice.
 *
 * The queue producer also dedups by `<repo>-<sha>`, which catches duplicate
 * commits across different deliveries. Together: this layer catches HTTP
 * retries of the *same* delivery; the producer's jobId catches *different*
 * deliveries for the same commit.
 *
 * Fail-open: if Redis is unavailable, log and pass through. Webhook
 * ingestion should not be blocked by Redis hiccups; the queue producer
 * provides a second line of defense.
 *
 * @module middleware/replayProtection
 */

const logger = require('../utils/logger');

const KEY_PREFIX = 'webhook:delivery:';

function buildReplayProtection({ redis, ttlSeconds }) {
  return async function replayProtection(req, res, next) {
    const deliveryId = req.headers['x-github-delivery'];

    if (!deliveryId || typeof deliveryId !== 'string') {
      logger.warn('Missing X-GitHub-Delivery header — replay check skipped', {
        correlationId: req.correlationId
      });
      return next();
    }

    const key = KEY_PREFIX + deliveryId;

    try {
      const set = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      if (set === null) {
        logger.info('Duplicate delivery ignored', {
          deliveryId,
          correlationId: req.correlationId
        });
        return res.status(200).json({
          message: 'Duplicate delivery — already processed',
          deliveryId
        });
      }
      return next();
    } catch (err) {
      logger.error('Replay check failed — passing through', {
        error: err.message,
        deliveryId,
        correlationId: req.correlationId
      });
      return next();
    }
  };
}

module.exports = { buildReplayProtection };
