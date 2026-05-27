/**
 * Mechanic subagent: reads repo files and submits a unified diff via the
 * `write_patch` tool. Returns the submitted diff text.
 * @module agents/mechanic
 */

const { runSubagent } = require('./sdk');
const { codeSliceAround } = require('./codeSlice');
const { buildToolHandlers, defs } = require('./tools');

async function mechanic({
  finding,
  dossier,
  workdir,
  budget,
  ctx,
  previousAttempts = [],
  patchSlot
}) {
  const slice = await codeSliceAround(workdir, finding.filePath, finding.line);

  const userMessage = JSON.stringify({
    finding: {
      severity: finding.severity,
      cwe: finding.cwe,
      file_path: finding.filePath,
      line: finding.line,
      rule_message: finding.raw && finding.raw.extra && finding.raw.extra.message
    },
    code_slice: slice,
    dossier_md: dossier.dossier_md,
    previous_attempts: previousAttempts
  });

  const toolHandlers = buildToolHandlers({ workdir, patchSlot });

  await runSubagent({
    name: 'mechanic',
    model: process.env.CLAUDE_MODEL_MECHANIC || 'claude-sonnet-4-6',
    tools: [defs.read_file, defs.write_patch],
    toolHandlers,
    userMessage,
    budget,
    ctx: { ...ctx, subagent: 'mechanic' },
    maxTurns: 12
  });

  return patchSlot.value;
}

module.exports = { mechanic };
