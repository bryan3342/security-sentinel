/**
 * High-level sandbox operations. Builds a scratch copy of the analysis
 * workdir (with the candidate patch applied), detects the project's test
 * runner, and executes it via the driver. Returns a structured result the
 * Validator subagent can reason about.
 *
 * @module sandbox/runner
 */

const fs = require('fs/promises');
const fssync = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { runInSandbox } = require('./driver');

async function copyToScratch(workdir) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-sandbox-'));
  await fs.cp(workdir, scratch, { recursive: true });
  return scratch;
}

function applyPatch(workdir, diff) {
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', workdir, 'apply', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('close', (code) => resolve({ ok: code === 0, stderr: stderr.trim() }));
    child.stdin.end(diff);
  });
}

function detectRunner(scratchDir) {
  const has = (rel) => fssync.existsSync(path.join(scratchDir, rel));

  if (has('package.json')) {
    try {
      const pkg = JSON.parse(fssync.readFileSync(path.join(scratchDir, 'package.json'), 'utf8'));
      if (pkg.scripts && pkg.scripts.test) {
        return { runner: 'npm', cmd: ['npm', 'test', '--silent'] };
      }
    } catch (_) { /* ignore parse error */ }
  }
  if (has('pyproject.toml') || has('pytest.ini') || has('setup.cfg')) {
    return { runner: 'pytest', cmd: ['pytest', '-q', '--maxfail=3'] };
  }
  if (has('go.mod')) {
    return { runner: 'go', cmd: ['go', 'test', './...'] };
  }
  return { runner: 'none', cmd: null };
}

/**
 * Apply `diff` to a scratch copy of `workdir` and run the project's test
 * suite inside the sandbox. If no test runner is detected, returns
 * `{ ok: true, skipped: true, runner: 'none' }`.
 *
 * @param {object} params
 * @param {string} params.workdir - The job's analysis workdir.
 * @param {string} params.diff - Unified diff text.
 * @param {object} [params.ctx]
 */
async function runTestsAgainstPatch({ workdir, diff, ctx }) {
  const scratch = await copyToScratch(workdir);
  try {
    if (diff && diff.trim().length > 0) {
      const applied = await applyPatch(scratch, diff);
      if (!applied.ok) {
        return {
          ok: false,
          runner: 'none',
          stage: 'apply',
          error: `patch failed to apply in scratch: ${applied.stderr}`
        };
      }
    }

    const runner = detectRunner(scratch);
    if (runner.runner === 'none') {
      return { ok: true, skipped: true, runner: 'none', reason: 'no test runner detected' };
    }

    const result = await runInSandbox({ scratchDir: scratch, cmd: runner.cmd, ctx });

    return {
      ok: result.exitCode === 0 && !result.timedOut,
      runner: runner.runner,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } finally {
    await fs.rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { runTestsAgainstPatch, detectRunner };
