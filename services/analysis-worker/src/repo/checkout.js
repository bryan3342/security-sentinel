/**
 * Repository checkout for analysis jobs.
 *
 * Fetches a single commit by SHA into a job-scoped working directory. Uses
 * `git fetch --depth 1 <sha>` rather than a full clone — this is fast and
 * works against GitHub's smart-HTTP server. A GitHub token (env
 * `GITHUB_TOKEN`) is injected into the remote URL when set, enabling
 * private-repo access; without it, only public repos work.
 *
 * `git` is invoked via spawn with array args (no shell), so repo names
 * and SHAs from the webhook payload can't escape into a shell injection.
 *
 * @module repo/checkout
 */

const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const logger = require('../utils/logger');

const REPO_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_RE = /^[a-f0-9]{7,40}$/i;

function workdirRoot() {
  return process.env.WORKDIR_ROOT || path.join(os.tmpdir(), 'sentinel');
}

function remoteUrl(repository) {
  const token = process.env.GITHUB_TOKEN;
  return token
    ? `https://x-access-token:${token}@github.com/${repository}.git`
    : `https://github.com/${repository}.git`;
}

function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      // GIT_TERMINAL_PROMPT=0: never prompt for credentials, fail fast.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`git ${args[0]} exited ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Check out `commitSha` of `repository` into a fresh working directory.
 * Returns `{ workdir, cleanup }`. The caller MUST invoke `cleanup` in a
 * finally block to remove the workdir regardless of outcome.
 */
async function checkoutCommit({ repository, commitSha, jobId }) {
  if (!REPO_NAME_RE.test(repository)) {
    throw new Error(`Invalid repository name: ${repository}`);
  }
  if (!SHA_RE.test(commitSha)) {
    throw new Error(`Invalid commit SHA: ${commitSha}`);
  }

  const workdir = path.join(workdirRoot(), jobId);
  await fsp.mkdir(workdir, { recursive: true });

  logger.info('Checking out commit', { jobId, repository, commitSha: commitSha.substring(0, 7), workdir });

  await runGit(['init', '--quiet'], workdir);
  await runGit(['remote', 'add', 'origin', remoteUrl(repository)], workdir);
  await runGit(['fetch', '--depth', '1', '--quiet', 'origin', commitSha], workdir);
  await runGit(['checkout', '--quiet', 'FETCH_HEAD'], workdir);

  return {
    workdir,
    cleanup: async () => {
      try {
        await fsp.rm(workdir, { recursive: true, force: true });
      } catch (err) {
        logger.warn('Workdir cleanup failed', { jobId, workdir, error: err.message });
      }
    }
  };
}

module.exports = { checkoutCommit };
