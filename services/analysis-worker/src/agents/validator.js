/**
 * Validator subagent: M4 static validation of a candidate patch.
 * Calls `apply_patch_check` and `syntax_check`. Runs in <=4 turns.
 * @module agents/validator
 */

const { runSubagent, parseJsonResponse } = require('./sdk');
const { buildToolHandlers, defs } = require('./tools');

async function validate({ finding, diff, workdir, budget, ctx, patchSlot }) {
  // The validator's syntax_check tool needs access to the same diff;
  // we pin patchSlot.value to the diff being validated.
  patchSlot.value = diff;

  const userMessage = JSON.stringify({
    finding: {
      severity: finding.severity,
      cwe: finding.cwe,
      file_path: finding.filePath,
      line: finding.line
    },
    diff
  });

  const toolHandlers = buildToolHandlers({ workdir, patchSlot, ctx });

  const { response } = await runSubagent({
    name: 'validator',
    model: process.env.CLAUDE_MODEL_VALIDATOR || 'claude-haiku-4-5-20251001',
    tools: [defs.apply_patch_check, defs.syntax_check, defs.run_tests],
    toolHandlers,
    userMessage,
    budget,
    ctx: { ...ctx, subagent: 'validator' },
    maxTurns: 6
  });

  return parseJsonResponse(response);
}

module.exports = { validate };
