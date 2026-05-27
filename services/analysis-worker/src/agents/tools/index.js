/**
 * Tool definitions for the Claude Agent SDK and their handler bindings.
 * Tools are workdir-scoped — every handler closes over a specific job's
 * working directory so models cannot wander outside it.
 * @module agents/tools
 */

const { readFile } = require('./readFile');
const { applyPatchCheck, syntaxCheckWithDiff } = require('./patchOps');
const { runTestsAgainstPatch } = require('../../sandbox/runner');

const READ_FILE_DEF = {
  name: 'read_file',
  description: 'Read a file from the repository workdir. Paths are relative to repo root. Optional line range.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repo-relative file path' },
      start_line: { type: 'integer', description: '1-indexed inclusive' },
      end_line: { type: 'integer', description: '1-indexed inclusive' }
    },
    required: ['path']
  }
};

const WRITE_PATCH_DEF = {
  name: 'write_patch',
  description: 'Submit a unified diff patch that fixes the vulnerability. Submit exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      diff: { type: 'string', description: 'Full unified diff text. Use "" to indicate no fixable patch.' }
    },
    required: ['diff']
  }
};

const APPLY_PATCH_CHECK_DEF = {
  name: 'apply_patch_check',
  description: 'Runs `git apply --check` on the supplied diff against the repo workdir. Returns { ok, stderr }.',
  input_schema: {
    type: 'object',
    properties: { diff: { type: 'string' } },
    required: ['diff']
  }
};

const SYNTAX_CHECK_DEF = {
  name: 'syntax_check',
  description: 'After applying the mechanic\'s diff to a scratch copy of the workdir, runs a language-appropriate syntax check on the listed paths. Returns { ok, failures }.',
  input_schema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Repo-relative file paths touched by the patch'
      }
    },
    required: ['paths']
  }
};

const RUN_TESTS_DEF = {
  name: 'run_tests',
  description: 'Apply the mechanic\'s diff to a scratch copy of the workdir, launch the hardened sandbox container, detect the project\'s test runner (npm/pytest/go), and execute it. Returns { ok, runner, exitCode, timedOut, stdout, stderr } — or { ok: true, skipped: true, runner: "none" } if no runner is detectable.',
  input_schema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
};

/**
 * Build tool handler bindings for a specific job's workdir.
 * `patchSlot` is a `{ value: string }` ref so the orchestrator can retrieve
 * the diff the mechanic submitted, and the validator can read it back.
 */
function buildToolHandlers({ workdir, patchSlot, ctx = {} }) {
  return {
    read_file: async (input) => readFile(workdir, input),
    write_patch: async ({ diff }) => {
      patchSlot.value = diff || '';
      if (!patchSlot.value) return 'Acknowledged: no fixable patch.';
      return `Patch accepted (${patchSlot.value.length} bytes).`;
    },
    apply_patch_check: async ({ diff }) => applyPatchCheck(workdir, diff),
    syntax_check: async ({ paths }) => syntaxCheckWithDiff(workdir, patchSlot.value, paths),
    run_tests: async () => runTestsAgainstPatch({ workdir, diff: patchSlot.value, ctx })
  };
}

module.exports = {
  buildToolHandlers,
  defs: {
    read_file: READ_FILE_DEF,
    write_patch: WRITE_PATCH_DEF,
    apply_patch_check: APPLY_PATCH_CHECK_DEF,
    syntax_check: SYNTAX_CHECK_DEF,
    run_tests: RUN_TESTS_DEF
  }
};
