/**
 * Triager subagent: decides whether a Semgrep finding is a real risk,
 * a false positive, or needs more info.
 * @module agents/triager
 */

const { runSubagent, parseJsonResponse } = require('./sdk');
const { codeSliceAround } = require('./codeSlice');

async function triage({ finding, workdir, budget, ctx }) {
  const slice = await codeSliceAround(workdir, finding.filePath, finding.line);

  const userMessage = JSON.stringify({
    severity: finding.severity,
    cwe: finding.cwe,
    file_path: finding.filePath,
    line: finding.line,
    rule_message: finding.raw && finding.raw.extra && finding.raw.extra.message,
    code_slice: slice
  });

  const { response } = await runSubagent({
    name: 'triager',
    model: process.env.CLAUDE_MODEL_TRIAGER || 'claude-haiku-4-5-20251001',
    tools: [],
    toolHandlers: {},
    userMessage,
    budget,
    ctx: { ...ctx, subagent: 'triager' },
    maxTurns: 1
  });

  return parseJsonResponse(response);
}

module.exports = { triage };
