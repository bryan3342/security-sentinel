/**
 * Glue between the orchestrator's "patched" result and a real GitHub PR.
 * Steps:
 *   1. Skip if a PR for this finding is already open (DB lookup).
 *   2. Mint a push token + commit-and-push the patch on a structured branch.
 *   3. Render title/body/labels from structured fields (no LLM free text in the title).
 *   4. Open the PR via Octokit.
 *   5. Persist the PR row.
 *
 * @module github/openPrForFinding
 */

const logger = require('../utils/logger');
const { commitAndPushPatch } = require('../repo/commitAndPush');
const { getPushToken, isConfigured } = require('./client');
const { openPullRequest } = require('./pr');
const { buildPrTitle, buildPrBody, buildLabels, buildCommitMessage } = require('./template');
const prsRepo = require('../db/prs');

function skipPrCreation() {
  return String(process.env.SKIP_PR_CREATION || '').toLowerCase() === 'true';
}

function pickReviewers() {
  const raw = process.env.PR_REVIEWERS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function pickBaseBranch() {
  return process.env.PR_BASE_BRANCH || 'main';
}

async function openPrForFinding({ finding, findingId, repository, commitSha, workdir, orchestratorResult, correlationId, ctx }) {
  if (skipPrCreation()) {
    logger.info('PR creation skipped (SKIP_PR_CREATION=true)', { ...ctx, findingId });
    return { status: 'skipped' };
  }
  if (!isConfigured()) {
    logger.warn('PR creation skipped — no GitHub credentials configured', { ...ctx, findingId });
    return { status: 'skipped', reason: 'no-creds' };
  }

  const existing = await prsRepo.findByFinding(findingId);
  if (existing) {
    logger.info('PR already open for finding — skipping', {
      ...ctx,
      findingId,
      prNumber: existing.github_pr_number
    });
    return { status: 'already_open', prNumber: existing.github_pr_number };
  }

  const token = await getPushToken();
  const commitMessage = buildCommitMessage({ finding });

  const { branch, headSha } = await commitAndPushPatch({
    workdir,
    repository,
    commitSha,
    findingId,
    diff: orchestratorResult.diff,
    token,
    commitMessage,
    ctx
  });

  const title = buildPrTitle({
    severity: finding.severity,
    cwe: finding.cwe,
    filePath: finding.filePath,
    line: finding.line
  });
  const body = buildPrBody({
    finding,
    dossier: orchestratorResult.dossier,
    validator: orchestratorResult.attempts[orchestratorResult.attempts.length - 1] && {
      details: orchestratorResult.attempts[orchestratorResult.attempts.length - 1].validatorDetails
    },
    attempts: orchestratorResult.attempts.length,
    correlationId
  });
  const labels = buildLabels({ finding });
  const reviewers = pickReviewers();

  const { prNumber, htmlUrl } = await openPullRequest({
    repository,
    base: pickBaseBranch(),
    head: branch,
    title,
    body,
    labels,
    reviewers,
    ctx
  });

  await prsRepo.insertPr({ findingId, githubPrNumber: prNumber });

  return { status: 'opened', prNumber, htmlUrl, branch, headSha };
}

module.exports = { openPrForFinding };
