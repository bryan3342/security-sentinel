/**
 * Semgrep wrapper. Runs Semgrep against a checked-out repo and returns a
 * normalized list of findings ready for persistence.
 *
 * Semgrep is invoked as a subprocess; the binary must be on the worker's
 * PATH (install via `pip install semgrep` or use the bundled Docker image
 * landing in M3). Exit code 0 means no findings, 1 means findings were
 * present — both are success. Anything else surfaces as an error.
 *
 * @module scan/semgrep
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');

function semgrepConfig() {
  return process.env.SEMGREP_CONFIG || 'auto';
}

/**
 * Run Semgrep on `workdir` and return parsed findings.
 * @returns {Promise<Array<{severity, cwe, filePath, line, raw}>>}
 */
async function runSemgrep(workdir) {
  const args = [
    'scan',
    '--json',
    '--quiet',
    '--metrics=off',
    '--config', semgrepConfig(),
    workdir
  ];

  logger.info('Running Semgrep', { workdir, config: semgrepConfig() });

  const { stdout, exitCode } = await new Promise((resolve, reject) => {
    const child = spawn('semgrep', args);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        return reject(new Error('Semgrep binary not found on PATH. Install with `pip install semgrep`.'));
      }
      reject(err);
    });

    child.on('close', (code) => {
      // 0 = no findings; 1 = findings present. Both are success.
      if (code === 0 || code === 1) {
        return resolve({ stdout, exitCode: code });
      }
      reject(new Error(`semgrep exited ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Failed to parse Semgrep JSON output: ${err.message}`);
  }

  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const findings = results.map((r) => normalizeFinding(r, workdir));

  logger.info('Semgrep scan complete', { workdir, exitCode, findings: findings.length });
  return findings;
}

function normalizeFinding(raw, workdir) {
  const extra = raw.extra || {};
  const metadata = extra.metadata || {};
  const cweField = metadata.cwe;
  const cwe = Array.isArray(cweField) ? cweField[0] : (cweField || null);

  return {
    severity: extra.severity || 'UNKNOWN',
    cwe,
    filePath: path.relative(workdir, raw.path || ''),
    line: raw.start && raw.start.line ? raw.start.line : null,
    raw
  };
}

module.exports = { runSemgrep };
