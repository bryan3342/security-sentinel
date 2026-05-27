/**
 * Findings persistence. One bulk insert per scan.
 * @module db/findings
 */

const db = require('./client');

const COLUMNS_PER_ROW = 6;

async function insertFindings(jobId, findings) {
  if (!findings.length) return [];

  const placeholders = findings.map((_, i) => {
    const b = i * COLUMNS_PER_ROW;
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
  });

  const values = [];
  for (const f of findings) {
    values.push(
      jobId,
      f.severity,
      f.cwe,
      f.filePath,
      f.line,
      JSON.stringify(f.raw)
    );
  }

  const sql = `
    INSERT INTO findings (job_id, severity, cwe, file_path, line, raw_semgrep)
    VALUES ${placeholders.join(', ')}
    RETURNING id
  `;

  const result = await db.query(sql, values);
  return result.rows.map((r, i) => ({ id: r.id, finding: findings[i] }));
}

module.exports = { insertFindings };
