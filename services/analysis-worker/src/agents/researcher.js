/**
 * Researcher subagent: produces a remediation dossier for a confirmed
 * finding. M4 uses model training knowledge only (no web tools yet).
 * @module agents/researcher
 */

const { runSubagent, parseJsonResponse } = require('./sdk');
const { codeSliceAround } = require('./codeSlice');

async function research({ finding, triageVerdict, workdir, budget, ctx }) {
  const slice = await codeSliceAround(workdir, finding.filePath, finding.line);

  const userMessage = JSON.stringify({
    severity: finding.severity,
    cwe: finding.cwe,
    file_path: finding.filePath,
    line: finding.line,
    rule_message: finding.raw && finding.raw.extra && finding.raw.extra.message,
    code_slice: slice,
    triager_reasoning: triageVerdict.reasoning
  });

  const { response } = await runSubagent({
    name: 'researcher',
    model: process.env.CLAUDE_MODEL_RESEARCHER || 'claude-sonnet-4-6',
    tools: [],
    toolHandlers: {},
    userMessage,
    budget,
    ctx: { ...ctx, subagent: 'researcher' },
    maxTurns: 1
  });

  return parseJsonResponse(response);
}

module.exports = { research };
