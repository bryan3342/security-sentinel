/**
 * Shared Redis connection for BullMQ Worker.
 * Settings mirror the producer in services/webhook-service/src/queue/producer.js.
 * @module queue/connection
 */

const Redis = require('ioredis');

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  // Required by BullMQ — prevents ioredis from throwing on long-running commands
  maxRetriesPerRequest: null
});

module.exports = { connection };
