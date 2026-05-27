/**
 * Claude Agent SDK wrapper.
 *
 * Loads markdown system prompts, runs the tool-use loop against
 * `@anthropic-ai/sdk`, accumulates token usage with a hard budget, and
 * estimates cost. Subagents (triager/researcher/mechanic/validator)
 * compose on top of `runSubagent`.
 *
 * Prompt caching: system prompts are sent with `cache_control: ephemeral`
 * so repeated invocations within a 5-minute window cost much less.
 *
 * @module agents/sdk
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

const PROMPTS_DIR = path.join(__dirname, '..', '..', 'agents');

// Per-million-token pricing in USD. Update as pricing changes.
const PRICING = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 }
};
const FALLBACK_PRICING = { input: 5, output: 20 };

class BudgetExceededError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'BudgetExceededError';
  }
}

class BudgetTracker {
  constructor({ inputLimit, outputLimit }) {
    this.inputUsed = 0;
    this.outputUsed = 0;
    this.costUsd = 0;
    this.inputLimit = inputLimit;
    this.outputLimit = outputLimit;
  }

  record(usage, model) {
    const inputTokens =
      (usage.input_tokens || 0) +
      (usage.cache_read_input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0);
    const outputTokens = usage.output_tokens || 0;

    this.inputUsed += inputTokens;
    this.outputUsed += outputTokens;
    this.costUsd += estimateCost(usage, model);

    if (this.inputUsed > this.inputLimit || this.outputUsed > this.outputLimit) {
      throw new BudgetExceededError(
        `Token budget exceeded: input=${this.inputUsed}/${this.inputLimit} output=${this.outputUsed}/${this.outputLimit}`
      );
    }
  }
}

function estimateCost(usage, model) {
  const p = PRICING[model] || FALLBACK_PRICING;
  // Cached reads are typically 10% of input price; cache creation ~25% premium.
  // Simplified: treat both as full input here (over-estimate, conservative).
  const input =
    (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) * 0.1 +
    (usage.cache_creation_input_tokens || 0) * 1.25;
  const output = usage.output_tokens || 0;
  return (input * p.input + output * p.output) / 1_000_000;
}

const promptCache = new Map();
function loadPrompt(name) {
  if (promptCache.has(name)) return promptCache.get(name);
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  const text = fs.readFileSync(file, 'utf8');
  promptCache.set(name, text);
  return text;
}

let client = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Run a subagent against Claude with optional tools. Loops on tool_use
 * stops, executing the supplied tool handlers, until the model ends its
 * turn. Returns the final assistant message content blocks plus any
 * captured tool inputs (so e.g. the mechanic can retrieve its submitted patch).
 *
 * @param {object} params
 * @param {string} params.name - Subagent name (used to load `agents/<name>.md`).
 * @param {string} params.model
 * @param {Array} params.tools - Anthropic tool definitions; may be empty.
 * @param {object} params.toolHandlers - Map of toolName → async fn(input).
 * @param {string|Array} params.userMessage - Initial user message content.
 * @param {BudgetTracker} params.budget
 * @param {object} params.ctx - Log context (jobId, correlationId, etc.).
 * @param {number} [params.maxTurns=8]
 */
async function runSubagent({
  name,
  model,
  tools = [],
  toolHandlers = {},
  userMessage,
  budget,
  ctx = {},
  maxTurns = 8
}) {
  const systemPrompt = loadPrompt(name);
  const messages = [
    { role: 'user', content: typeof userMessage === 'string' ? userMessage : userMessage }
  ];
  const toolInputs = {};

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const response = await getClient().messages.create({
      model,
      max_tokens: 4096,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
      ],
      tools,
      messages
    });

    if (response.usage) {
      budget.record(response.usage, model);
    }

    logger.info('Subagent call complete', {
      ...ctx,
      subagent: name,
      turn,
      stop_reason: response.stop_reason,
      input_tokens: response.usage && response.usage.input_tokens,
      output_tokens: response.usage && response.usage.output_tokens,
      cost_usd_total: Number(budget.costUsd.toFixed(4))
    });

    if (response.stop_reason !== 'tool_use') {
      return { response, toolInputs };
    }

    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    const toolResultBlocks = [];

    for (const block of toolUseBlocks) {
      const handler = toolHandlers[block.name];
      if (!handler) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Tool not available: ${block.name}`,
          is_error: true
        });
        continue;
      }
      try {
        const result = await handler(block.input);
        // Record the latest input per tool — used by callers like the mechanic
        // to retrieve the submitted patch after the loop ends.
        toolInputs[block.name] = block.input;
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result)
        });
      } catch (err) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Tool error: ${err.message}`,
          is_error: true
        });
      }
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResultBlocks });
  }

  throw new Error(`Subagent ${name} exceeded ${maxTurns} turns without ending`);
}

/**
 * Extract a single JSON object from the model's final assistant message.
 * Subagents are instructed to emit pure JSON; this is the parser.
 */
function parseJsonResponse(response) {
  const textBlocks = response.content.filter((b) => b.type === 'text');
  if (!textBlocks.length) {
    throw new Error('No text content in response');
  }
  const raw = textBlocks.map((b) => b.text).join('');
  // Tolerate optional ```json fences even though prompts forbid them.
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse subagent JSON: ${err.message}; raw: ${raw.slice(0, 200)}`);
  }
}

module.exports = {
  runSubagent,
  parseJsonResponse,
  BudgetTracker,
  BudgetExceededError,
  estimateCost
};
