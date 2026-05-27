/**
 * Research dossier persistence.
 * @module db/research
 */

const db = require('./client');

async function insertResearch(findingId, dossier) {
  const { rows } = await db.query(
    `INSERT INTO research (finding_id, dossier_md, sources)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [findingId, dossier.dossier_md || '', JSON.stringify(dossier.references || [])]
  );
  return rows[0].id;
}

module.exports = { insertResearch };
