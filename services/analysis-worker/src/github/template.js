/**
 * PR title + body rendering with prompt-injection hardening.
 *
 * - **Title** is fully templated from structured fields (severity, CWE,
 *   file:line). Never contains agent-generated free text.
 * - **Body** has fixed sections; any agent-produced text (dossier,
 *   validator details) is embedded inside fenced code blocks with
 *   backticks neutralized so the agent cannot inject markdown that escapes
 *   its container.
 * - Labels are picked from a known set derived from severity.
 *
 * @module github/template
 */

// Replace backticks so a single ``` inside agent text can't terminate the
// surrounding fenced block. Also strip lone CR characters.
function neutralizeFences(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/`/g, "'").replace(/\r/g, '');
}

function severityLabel(severity) {
  const s = String(severity || '').toUpperCase();
  if (s === 'ERROR' || s === 'CRITICAL' || s === 'HIGH') return 'sev-high';
  if (s === 'WARNING' || s === 'MEDIUM') return 'sev-medium';
  return 'sev-low';
}

function buildPrTitle({ severity, cwe, filePath, line }) {
  const sevTag = severityLabel(severity).replace('sev-', '').toUpperCase();
  const cweTag = cwe ? cwe.split(':')[0].trim() : 'security-finding';
  const location = `${filePath}${typeof line === 'number' ? `:${line}` : ''}`;
  return `[Sentinel] [${sevTag}] Fix ${cweTag} in ${location}`;
}

function buildPrBody({ finding, dossier, validator, attempts, correlationId }) {
  const findingSummary = [
    `- **Severity:** ${finding.severity}`,
    finding.cwe ? `- **CWE:** ${finding.cwe}` : null,
    `- **Location:** \`${finding.filePath}\`${typeof finding.line === 'number' ? `:${finding.line}` : ''}`,
    correlationId ? `- **Correlation ID:** \`${correlationId}\`` : null
  ]
    .filter(Boolean)
    .join('\n');

  const dossierMd = dossier && dossier.dossier_md
    ? `\n\n## Research dossier\n\n\`\`\`markdown\n${neutralizeFences(dossier.dossier_md)}\n\`\`\``
    : '';

  const validatorBlock = validator
    ? `\n\n## Validator\n\n\`\`\`\n${neutralizeFences(validator.details || '(no details)')}\n\`\`\``
    : '';

  const attemptsLine = typeof attempts === 'number'
    ? `\n\n_Patch took ${attempts} attempt${attempts === 1 ? '' : 's'}._`
    : '';

  return `## Vulnerability finding

${findingSummary}${dossierMd}${validatorBlock}${attemptsLine}

---

_Opened by [Security Sentinel](https://github.com/) — please review the diff carefully before merging. Static checks and (when detected) the project's test suite passed inside the sandbox, but this PR has not been reviewed by a human._
`;
}

function buildLabels({ finding }) {
  return ['security-sentinel', severityLabel(finding.severity)];
}

function buildCommitMessage({ finding }) {
  // Commit messages are also user-visible; same neutralization rule.
  const cwe = finding.cwe ? finding.cwe.split(':')[0].trim() : 'security-finding';
  return `[Sentinel] Fix ${cwe} in ${finding.filePath}${typeof finding.line === 'number' ? `:${finding.line}` : ''}`;
}

module.exports = {
  buildPrTitle,
  buildPrBody,
  buildLabels,
  buildCommitMessage,
  severityLabel
};
