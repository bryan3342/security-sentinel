/**
 * Job-row persistence helpers. The job ID is the same string used by
 * BullMQ (`<repo>-<sha>`), keeping queue and DB rows trivially joinable.
 * @module db/jobs
 */

const db = require('./client');

async function insertPending({ id, repository, commitSha, priority, correlationId, payload }) {
  // Idempotent: on replay of the same (repo, sha) we don't double-insert.
  // Producer-side dedup already prevents duplicate enqueues, but the
  // worker should be safe under manual replays too.
  await db.query(
    `INSERT INTO jobs (id, repository, commit_sha, status, priority, correlation_id, payload)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [id, repository, commitSha, priority || 5, correlationId || null, payload]
  );
}

async function markRunning(id) {
  await db.query(
    `UPDATE jobs SET status = 'running', started_at = now() WHERE id = $1`,
    [id]
  );
}

async function markCompleted(id) {
  await db.query(
    `UPDATE jobs SET status = 'completed', completed_at = now() WHERE id = $1`,
    [id]
  );
}

async function markFailed(id, errorMessage) {
  await db.query(
    `UPDATE jobs SET status = 'failed', completed_at = now(), error = $2 WHERE id = $1`,
    [id, errorMessage]
  );
}

async function setCostUsd(id, costUsd) {
  await db.query(
    `UPDATE jobs SET cost_usd = $2 WHERE id = $1`,
    [id, costUsd]
  );
}

module.exports = {
  insertPending,
  markRunning,
  markCompleted,
  markFailed,
  setCostUsd
};
