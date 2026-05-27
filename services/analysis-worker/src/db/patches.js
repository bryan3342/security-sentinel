/**
 * Patch attempt persistence.
 * @module db/patches
 */

const db = require('./client');

async function insertPatch({ findingId, attemptN, diff, validatorResult, validatorLog }) {
  await db.query(
    `INSERT INTO patches (finding_id, attempt_n, diff, validator_result, validator_log)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (finding_id, attempt_n) DO NOTHING`,
    [findingId, attemptN, diff, validatorResult, validatorLog]
  );
}

module.exports = { insertPatch };
