/**
 * Minimal forward-only migration runner.
 * Reads .sql files from src/db/migrations/ in lexicographic order and
 * applies any that aren't already recorded in `schema_migrations`.
 *
 * Run: `npm run migrate`
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const db = require('./client');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename     TEXT PRIMARY KEY,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedSet() {
  const { rows } = await db.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function applyMigration(filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(fullPath, 'utf8');

  await db.withTransaction(async (client) => {
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [filename]
    );
  });

  logger.info('Migration applied', { filename });
}

async function run() {
  await ensureMigrationsTable();
  const applied = await appliedSet();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    logger.info('No pending migrations');
  } else {
    logger.info('Applying migrations', { count: pending.length });
    for (const filename of pending) {
      await applyMigration(filename);
    }
  }

  await db.close();
}

run().catch((err) => {
  logger.error('Migration failed', { error: err.message, stack: err.stack });
  process.exitCode = 1;
});
