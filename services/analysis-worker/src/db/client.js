/**
 * Postgres connection pool, shared across the worker.
 * Reads connection settings from environment variables.
 * @module db/client
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'security_sentinel',
  user: process.env.PG_USER || 'sentinel',
  password: process.env.PG_PASSWORD || undefined,
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000
});

pool.on('error', (err) => {
  logger.error('Unexpected Postgres pool error', { error: err.message });
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, withTransaction, close };
