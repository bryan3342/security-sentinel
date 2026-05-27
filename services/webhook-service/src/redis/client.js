/**
 * General-purpose Redis client (separate from the BullMQ queue connection,
 * which requires `maxRetriesPerRequest: null`). Used by replay protection
 * and readiness checks.
 * @module redis/client
 */

const Redis = require('ioredis');

const client = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: false,
  // Bounded retries so we surface Redis outages instead of hanging forever.
  maxRetriesPerRequest: 3
});

module.exports = { client };
