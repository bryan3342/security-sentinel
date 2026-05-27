/**
 * Apply a patch in the analysis workdir, commit it on a fresh branch, and
 * push to origin. Auth via `GITHUB_TOKEN` (PAT or GitHub App installation
 * token from src/github/client.js). Uses git over HTTPS by injecting the
 * token into the remote URL for the duration of the push.
 *
 * The branch name is structured (`sentinel/<short-sha>/<finding-id>`) so a
 * later replay of the same finding overwrites cleanly via `--force` —
 * acceptable because these branches are exclusively sentinel-owned.
 *
 * @module repo/commitAndPush
 */

const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const logger = require('../utils/logger');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...opts,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(opts.env || {}) }
    });
    let stderr = '';
    let stdout = '';
    child.stdout && child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr && child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${cmd} ${args[0]} exited ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });
}

function buildBranchName(commitSha, findingId) {
  return `sentinel/${commitSha.substring(0, 7)}/${findingId}`;
}

function authedRemoteUrl(repository, token) {
  // GitHub App tokens use the username `x-access-token`; PATs use the token
  // as both username and password. The x-access-token form works for both.
  return `https://x-access-token:${token}@github.com/${repository}.git`;
}

/**
 * Commit and push a patch as a new branch.
 *
 * @param {object} params
 * @param {string} params.workdir   - The job's analysis workdir.
 * @param {string} params.repository - "owner/repo"
 * @param {string} params.commitSha  - The base commit SHA.
 * @param {number} params.findingId  - Finding ID (used in branch name).
 * @param {string} params.diff
 * @param {string} params.token      - GitHub token for push auth.
 * @param {string} params.commitMessage
 * @param {object} [params.ctx]
 * @returns {Promise<{ branch: string, headSha: string }>}
 */
async function commitAndPushPatch({ workdir, repository, commitSha, findingId, diff, token, commitMessage, ctx = {} }) {
  if (!diff || diff.trim().length === 0) {
    throw new Error('Empty diff — nothing to commit');
  }
  if (!token) {
    throw new Error('Missing GitHub token for push');
  }

  const branch = buildBranchName(commitSha, findingId);

  // Local git identity for the commit. Required by `git commit`.
  await run('git', ['-C', workdir, 'config', 'user.email', 'sentinel@security-sentinel.local']);
  await run('git', ['-C', workdir, 'config', 'user.name', 'Security Sentinel']);

  // Create the branch from the analyzed SHA.
  await run('git', ['-C', workdir, 'checkout', '-B', branch, 'FETCH_HEAD']);

  // Apply the patch via stdin (avoids leaving a temp file behind).
  await new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', workdir, 'apply', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`git apply failed: ${stderr.trim()}`)));
    child.stdin.end(diff);
  });

  await run('git', ['-C', workdir, 'add', '-A']);
  await run('git', ['-C', workdir, 'commit', '-m', commitMessage]);

  const { stdout: shaOut } = await run('git', ['-C', workdir, 'rev-parse', 'HEAD']);
  const headSha = shaOut.trim();

  // Push using a one-shot authenticated URL — do not persist it in the
  // remote config.
  const url = authedRemoteUrl(repository, token);
  await run('git', ['-C', workdir, 'push', '--force', url, `HEAD:refs/heads/${branch}`]);

  logger.info('Patch branch pushed', { ...ctx, repository, branch, headSha: headSha.slice(0, 7) });
  return { branch, headSha };
}

module.exports = { commitAndPushPatch, buildBranchName };
