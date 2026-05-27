/**
 * Patch operations: validate that a diff applies cleanly, and run a
 * language-aware syntax check against a scratch copy of the workdir with
 * the patch applied.
 *
 * Full test-suite execution against the patched repo is M3's job (Docker
 * sandbox); these checks are M4's static-only validation.
 *
 * @module agents/tools/patchOps
 */

const { spawn } = require('child_process');
const fs = require('fs/promises');
const fssync = require('fs');
const os = require('os');
const path = require('path');
const { safeJoin } = require('./paths');

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, opts);
    let stdout = '';
    let stderr = '';
    child.stdout && child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr && child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function applyPatchCheck(workdir, diff) {
  if (typeof diff !== 'string' || diff.trim().length === 0) {
    return { ok: false, stderr: 'Empty diff' };
  }

  const tmpPatch = path.join(os.tmpdir(), `sentinel-patch-${Date.now()}-${Math.random().toString(16).slice(2)}.diff`);
  await fs.writeFile(tmpPatch, diff, 'utf8');

  const { code, stderr } = await run('git', ['-C', workdir, 'apply', '--check', tmpPatch]);
  await fs.unlink(tmpPatch).catch(() => {});

  return { ok: code === 0, stderr: stderr.trim() };
}

async function applyPatchTo(targetDir, diff) {
  const tmpPatch = path.join(os.tmpdir(), `sentinel-patch-${Date.now()}-${Math.random().toString(16).slice(2)}.diff`);
  await fs.writeFile(tmpPatch, diff, 'utf8');
  const result = await run('git', ['-C', targetDir, 'apply', tmpPatch]);
  await fs.unlink(tmpPatch).catch(() => {});
  return result;
}

async function copyWorkdir(workdir) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-scratch-'));
  await fs.cp(workdir, scratch, { recursive: true });
  return scratch;
}

async function syntaxCheckFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  switch (ext) {
    case '.js':
    case '.cjs':
    case '.mjs': {
      const { code, stderr } = await run('node', ['--check', absPath]);
      return code === 0 ? { ok: true } : { ok: false, error: stderr.trim() };
    }
    case '.py': {
      const { code, stderr } = await run('python3', ['-m', 'py_compile', absPath]);
      return code === 0 ? { ok: true } : { ok: false, error: stderr.trim() };
    }
    case '.json': {
      try {
        JSON.parse(fssync.readFileSync(absPath, 'utf8'));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    default:
      // Unsupported extension — skip rather than reject.
      return { ok: true, skipped: true, reason: `no syntax checker for ${ext}` };
  }
}

async function syntaxCheckWithDiff(workdir, diff, paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { ok: false, failures: [{ path: '(none)', error: 'No paths provided' }] };
  }

  const scratch = await copyWorkdir(workdir);
  try {
    const apply = await applyPatchTo(scratch, diff);
    if (apply.code !== 0) {
      return {
        ok: false,
        failures: [{ path: '(patch)', error: `patch failed to apply: ${apply.stderr.trim()}` }]
      };
    }

    const failures = [];
    for (const rel of paths) {
      const abs = safeJoin(scratch, rel);
      try {
        const res = await syntaxCheckFile(abs);
        if (!res.ok) failures.push({ path: rel, error: res.error });
      } catch (err) {
        failures.push({ path: rel, error: err.message });
      }
    }
    return { ok: failures.length === 0, failures };
  } finally {
    await fs.rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { applyPatchCheck, syntaxCheckWithDiff };
