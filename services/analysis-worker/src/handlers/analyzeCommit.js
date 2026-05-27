/**
 * Job handler for `analyze-commit` jobs.
 *
 * Full pipeline (M1–M5):
 *   checkout → Semgrep → for each finding:
 *     triage → research → mechanic ↔ validator (with sandbox tests)
 *     → on `patched` status, commit-push-PR
 *
 * Flags:
 *   - SKIP_AGENT_LOOP=true: ack after Semgrep, skip the brain.
 *   - SKIP_PR_CREATION=true: run the brain but never open PRs.
 *
 * @module handlers/analyzeCommit
 */

const logger = require('../utils/logger');
const jobsRepo = require('../db/jobs');
const findingsRepo = require('../db/findings');
const { checkoutCommit } = require('../repo/checkout');
const { runSemgrep } = require('../scan/semgrep');
const { processFinding, newBudget, BudgetExceededError } = require('../agents/orchestrator');
const { openPrForFinding } = require('../github/openPrForFinding');

function skipAgents() {
  return String(process.env.SKIP_AGENT_LOOP || '').toLowerCase() === 'true';
}

async function analyzeCommit(job) {
  const { repository, commitSha, priority } = job.data;
  const correlationId = job.data.correlationId || null;

  const shortSha = commitSha ? commitSha.substring(0, 7) : 'unknown';
  const ctx = { jobId: job.id, repository, commitSha: shortSha, correlationId };

  logger.info('Job received', { ...ctx, attempt: job.attemptsMade + 1 });

  await jobsRepo.insertPending({
    id: job.id,
    repository,
    commitSha,
    priority,
    correlationId,
    payload: job.data
  });
  await jobsRepo.markRunning(job.id);

  let cleanup = async () => {};
  try {
    const checkout = await checkoutCommit({ repository, commitSha, jobId: job.id });
    cleanup = checkout.cleanup;

    const findings = await runSemgrep(checkout.workdir);
    const persisted = await findingsRepo.insertFindings(job.id, findings);

    if (skipAgents()) {
      await jobsRepo.markCompleted(job.id);
      logger.info('Agent loop skipped (SKIP_AGENT_LOOP=true)', { ...ctx, findings: persisted.length });
      return { status: 'scanned', findings: persisted.length, agentSkipped: true };
    }

    const budget = newBudget();
    const summary = {
      findings: persisted.length,
      patched: 0,
      falsePositive: 0,
      gaveUp: 0,
      unfixable: 0,
      errored: 0,
      prsOpened: 0,
      prsFailed: 0
    };

    for (const { id: findingId, finding } of persisted) {
      try {
        const result = await processFinding({
          finding,
          findingId,
          workdir: checkout.workdir,
          ctx,
          budget
        });

        switch (result.status) {
          case 'patched': summary.patched += 1; break;
          case 'false_positive': summary.falsePositive += 1; break;
          case 'gave_up': summary.gaveUp += 1; break;
          case 'unfixable': summary.unfixable += 1; break;
          default: break;
        }

        if (result.status === 'patched') {
          try {
            const prResult = await openPrForFinding({
              finding,
              findingId,
              repository,
              commitSha,
              workdir: checkout.workdir,
              orchestratorResult: result,
              correlationId,
              ctx
            });
            if (prResult.status === 'opened' || prResult.status === 'already_open') {
              summary.prsOpened += 1;
            }
          } catch (prErr) {
            summary.prsFailed += 1;
            logger.error('PR creation failed', {
              ...ctx,
              findingId,
              error: prErr.message
            });
          }
        }
      } catch (err) {
        summary.errored += 1;
        logger.error('Finding processing failed', {
          ...ctx,
          findingId,
          error: err.message,
          budgetExceeded: err instanceof BudgetExceededError
        });
        if (err instanceof BudgetExceededError) {
          await jobsRepo.setCostUsd(job.id, Number(budget.costUsd.toFixed(4)));
          await jobsRepo.markFailed(job.id, `budget exceeded: ${err.message}`);
          return { status: 'budget_exceeded', ...summary };
        }
      }
    }

    await jobsRepo.setCostUsd(job.id, Number(budget.costUsd.toFixed(4)));
    await jobsRepo.markCompleted(job.id);
    logger.info('Job completed', { ...ctx, ...summary, cost_usd: Number(budget.costUsd.toFixed(4)) });
    return { status: 'analyzed', ...summary };
  } catch (err) {
    await jobsRepo.markFailed(job.id, err.message);
    logger.error('Job failed', { ...ctx, error: err.message });
    throw err;
  } finally {
    await cleanup();
  }
}

module.exports = { analyzeCommit };
