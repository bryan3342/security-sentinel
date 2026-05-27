# ADR-004: Use Claude Agent SDK with Markdown Subagents for the Analysis Brain

## Status

Accepted

## Context

The original spec proposed Python + LangGraph as the orchestration layer for the analysis worker's multi-agent loop (Researcher → Mechanic → Validator → Reflect). With the webhook service and BullMQ queue in place, the unbuilt "brain" was the next major build.

LangGraph delivers explicit state machines and LLM-vendor neutrality, but at the cost of significant orchestration plumbing — prompt management, tool routing, retry/reflection logic, and Docker driver glue all written from scratch. For an unbuilt component where the highest-risk work is integration, not state-machine design, that tradeoff is poor.

Alternatives considered:

| Option | Pros | Cons |
|---|---|---|
| **Python + LangGraph** (original plan) | Explicit state graphs, LLM-vendor neutral, mature ecosystem | Heavy orchestration boilerplate, slowest path to E2E demo, gnarly cyclic graphs |
| **Pure Claude (no queue)** | Simplest mental model | Loses backpressure/priority/dedup/retry from BullMQ; sandboxing harder to enforce |
| **Claude Agent SDK + markdown subagents** | Minimal code, fast E2E, prompts-as-code is easy to evolve and review | Anthropic lock-in for the reasoning layer |

## Decision

The analysis worker invokes the **Claude Agent SDK** with subagent roles defined as markdown files (`agents/researcher.md`, `agents/mechanic.md`, `agents/validator.md`). The SDK handles tool routing, reflection, and turn management; the worker handles BullMQ consumption, Docker lifecycle, and persistence.

The surrounding architecture is unchanged:

- Webhook service (Node.js) and BullMQ queue stay as built.
- Docker sandbox remains the isolation boundary for any agent-generated code.
- Postgres remains the store for status tracking and patch-pattern RAG.

## Consequences

- The reasoning layer is Anthropic-coupled. Subagents are prompts, so a future move to LangGraph or another orchestrator is a worker-only rewrite, not a system rewrite.
- The worker is implemented in Node.js (matching the webhook service stack) using the Claude Agent SDK rather than a separate Python service.
- Behavior changes ship as markdown diffs rather than Python code changes — lower friction to iterate, but also lower compile-time safety; behavioral regressions must be caught by E2E tests against fixture findings.
- "LangGraph internals" is no longer a learning objective. "Production agent design with the Claude Agent SDK" replaces it. Container orchestration and agentic RAG remain in scope via Docker and Postgres.
- Cost scales linearly with analysis runs. Non-LLM pre-filtering (e.g., Semgrep severity gates) should remain in the worker to avoid invoking the brain on noise.
