/**
 * Orchestrates the four subagents for a single finding:
 *   triage → (early-exit on false_positive) → research → loop[mechanic → validator]
 *
 * Returns `{ status, diff?, dossier?, attempts[], triage }` and persists
 * research + patch rows. The caller (handler) owns cost rollup into the job row.
 *
 * @module agents/orchestrator
 */

const logger = require('../utils/logger');
const { BudgetTracker, BudgetExceededError } = require('./sdk');
const { triage } = require('./triager');
const { research } = require('./researcher');
const { mechanic } = require('./mechanic');
const { validate } = require('./validator');
const { insertResearch } = require('../db/research');
const { insertPatch } = require('../db/patches');

const DEFAULT_INPUT_BUDGET = Number(process.env.TOKEN_BUDGET_INPUT) || 200_000;
const DEFAULT_OUTPUT_BUDGET = Number(process.env.TOKEN_BUDGET_OUTPUT) || 50_000;
const MAX_ITERATIONS = Number(process.env.AGENT_MAX_ITERATIONS) || 3;

async function processFinding({ finding, findingId, workdir, ctx, budget }) {
  // 1. Triage
  const triageVerdict = await triage({ finding, workdir, budget, ctx });
  logger.info('Triage complete', { ...ctx, findingId, verdict: triageVerdict.verdict });

  if (triageVerdict.verdict === 'false_positive') {
    return { status: 'false_positive', triage: triageVerdict, attempts: [] };
  }
  // 'needs_more_info' is treated as real risk for M4 — surface to the human via PR notes.

  // 2. Research
  const dossier = await research({ finding, triageVerdict, workdir, budget, ctx });
  await insertResearch(findingId, dossier);
  logger.info('Research complete', { ...ctx, findingId });

  // 3. Mechanic ↔ Validator loop
  const attempts = [];
  const patchSlot = { value: '' };

  for (let i = 1; i <= MAX_ITERATIONS; i += 1) {
    const previousAttempts = attempts.map((a) => ({
      diff: a.diff,
      validator_failure: a.validatorDetails
    }));

    patchSlot.value = '';
    const diff = await mechanic({
      finding,
      dossier,
      workdir,
      budget,
      ctx: { ...ctx, attempt: i },
      previousAttempts,
      patchSlot
    });

    if (!diff || diff.trim().length === 0) {
      logger.info('Mechanic declined to patch', { ...ctx, findingId, attempt: i });
      await insertPatch({
        findingId,
        attemptN: i,
        diff: '',
        validatorResult: 'error',
        validatorLog: 'mechanic returned no patch'
      });
      return { status: 'unfixable', triage: triageVerdict, dossier, attempts };
    }

    const validation = await validate({
      finding,
      diff,
      workdir,
      budget,
      ctx: { ...ctx, attempt: i },
      patchSlot
    });

    await insertPatch({
      findingId,
      attemptN: i,
      diff,
      validatorResult: validation.result === 'pass' ? 'pass' : 'fail',
      validatorLog: validation.details || ''
    });

    attempts.push({ diff, validatorResult: validation.result, validatorDetails: validation.details });

    if (validation.result === 'pass') {
      logger.info('Patch validated', { ...ctx, findingId, attempt: i });
      return { status: 'patched', triage: triageVerdict, dossier, diff, attempts };
    }

    logger.warn('Patch validation failed; reflecting', {
      ...ctx,
      findingId,
      attempt: i,
      details: validation.details
    });
  }

  return { status: 'gave_up', triage: triageVerdict, dossier, attempts };
}

function newBudget() {
  return new BudgetTracker({
    inputLimit: DEFAULT_INPUT_BUDGET,
    outputLimit: DEFAULT_OUTPUT_BUDGET
  });
}

module.exports = { processFinding, newBudget, BudgetExceededError };
