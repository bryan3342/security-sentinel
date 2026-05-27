/**
 * PR row persistence. The `(finding_id, github_pr_number)` unique
 * constraint makes inserts idempotent across replays.
 * @module db/prs
 */

const db = require('./client');

async function findByFinding(findingId) {
  const { rows } = await db.query(
    `SELECT id, github_pr_number, status FROM prs WHERE finding_id = $1 AND status = 'open' LIMIT 1`,
    [findingId]
  );
  return rows[0] || null;
}

async function insertPr({ findingId, githubPrNumber }) {
  await db.query(
    `INSERT INTO prs (finding_id, github_pr_number, status)
     VALUES ($1, $2, 'open')
     ON CONFLICT (finding_id, github_pr_number) DO NOTHING`,
    [findingId, githubPrNumber]
  );
}

module.exports = { findByFinding, insertPr };
