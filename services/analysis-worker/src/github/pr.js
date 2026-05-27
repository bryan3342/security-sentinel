/**
 * Pull request creation. Idempotent per finding: if an open PR already
 * exists, we skip (`status` table is the source of truth, but we also
 * tolerate races by catching the "already exists" error from GitHub).
 *
 * @module github/pr
 */

const { getOctokit } = require('./client');
const logger = require('../utils/logger');

function parseRepo(repository) {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error(`Invalid repository: ${repository}`);
  return { owner, repo };
}

async function openPullRequest({
  repository,
  base,
  head,
  title,
  body,
  labels = [],
  reviewers = [],
  ctx = {}
}) {
  const { owner, repo } = parseRepo(repository);
  const octokit = getOctokit();

  let prNumber;
  let htmlUrl;

  try {
    const created = await octokit.pulls.create({ owner, repo, title, body, head, base });
    prNumber = created.data.number;
    htmlUrl = created.data.html_url;
  } catch (err) {
    // GitHub returns 422 if a PR for this head ↔ base already exists.
    if (err && err.status === 422) {
      const existing = await octokit.pulls.list({
        owner,
        repo,
        head: `${owner}:${head}`,
        base,
        state: 'open'
      });
      if (existing.data.length > 0) {
        prNumber = existing.data[0].number;
        htmlUrl = existing.data[0].html_url;
        logger.info('Reusing existing PR', { ...ctx, repository, prNumber, head });
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  if (labels.length > 0) {
    try {
      await octokit.issues.addLabels({ owner, repo, issue_number: prNumber, labels });
    } catch (err) {
      logger.warn('Failed to add labels', { ...ctx, repository, prNumber, error: err.message });
    }
  }

  if (reviewers.length > 0) {
    try {
      await octokit.pulls.requestReviewers({ owner, repo, pull_number: prNumber, reviewers });
    } catch (err) {
      logger.warn('Failed to request reviewers', { ...ctx, repository, prNumber, error: err.message });
    }
  }

  logger.info('PR opened', { ...ctx, repository, prNumber, htmlUrl });
  return { prNumber, htmlUrl };
}

module.exports = { openPullRequest };
