# Security Sentinel — Path to Production

## Context

The architecture is locked in (see [ADR-004](decisions/004-claude-agent-sdk-for-brain.md)):
webhook service → BullMQ → Node.js analysis worker driving Claude Agent SDK
subagents → Docker sandbox → GitHub PR.

This document is the path from "webhook service exists, brain doesn't" to a
production-ready autonomous agent. It is organized into milestones, each shippable
on its own, plus the cross-cutting concerns that must be true at every step.

## Current state

- ✅ Webhook ingestion (HMAC against raw body, validation, replay protection, rate limit, correlation IDs, healthz/readyz, graceful shutdown, Dockerfile, unit tests) — **M1 complete**
- ✅ BullMQ queue (`security-analysis`)
- ✅ ADRs 001–004
- ✅ Analysis worker scaffold + Semgrep pipeline — **M2 complete**
- ✅ Docker sandbox driver (no-network, cap-drop, non-root, mem/cpu/wall-clock caps) — **M3 complete**
- ✅ Claude Agent SDK integration + four markdown subagents + reflection loop + token budgets + cost tracking — **M4 complete**
- ✅ GitHub PR creation (App + PAT auth, structured branch names, prompt-injection-safe rendering, idempotent per finding) — **M5 complete**
- ✅ Postgres (jobs, findings, research, patches, prs)
- ❌ Notification service (M6)
- ❌ Observability stack (M7 — partial: structured pino-style logs via Winston exist, metrics/tracing/dashboards/alerts pending)
- ❌ Agentic RAG (M8, deferred past v1)
- ❌ E2E test against fixture vulnerable repo (lands alongside M6/M7)

## Milestones

Each milestone is a vertical slice that ends with something demonstrable.

### M1 — Webhook service production hardening

**Deliverable:** webhook service is no longer "WIP" — it can sit in front of a
real GitHub App in production without supervision.

- Rate limiting per source IP / repo (avoid abuse from a runaway GitHub App).
- Delivery-ID-based replay protection (`X-GitHub-Delivery` dedup with short TTL
  in Redis), independent of the existing commit-SHA dedup.
- `/healthz` (liveness) and `/readyz` (Redis + producer ready) endpoints.
- Graceful shutdown: stop accepting requests, drain in-flight, close Redis.
- Correlation IDs threaded from request → job (`x-request-id` → job metadata).
- Unit tests for middleware, integration tests for the full handler with a
  fake Redis (`ioredis-mock`).
- Dockerfile + `docker-compose.yml` snippet for local dev.

**Exit criteria:** webhook service can be deployed standalone with a single
env-file, passes a smoke test that posts a signed webhook and observes a job
land in Redis.

### M2 — Analysis worker skeleton (no LLM yet)

**Deliverable:** a Node.js service in `services/analysis-worker/`
that consumes from `security-analysis`, fetches the repo at the right SHA,
runs Semgrep, persists findings to Postgres, and acks the job. No agent
reasoning yet — this proves the bones.

Key components:
- `src/consumer.ts` — BullMQ worker, concurrency, graceful shutdown.
- `src/repo/checkout.ts` — shallow `git clone --depth 1 --branch <sha>` into a
  job-scoped working directory; cleanup on success/fail.
- `src/scan/semgrep.ts` — Semgrep invocation, JSON output parsing.
- `src/db/` — Postgres schema + migrations (see "Data model" below).
- `src/lifecycle.ts` — per-job state transitions, idempotent on replay.

**Why no LLM yet:** locks in the surrounding plumbing (queue → checkout →
scan → persist) so when we add the brain in M4, we're not debugging
orchestration and prompts simultaneously.

**Exit criteria:** push to a fixture vulnerable repo → webhook → queue →
worker → row in `findings` table. No PR yet. End-to-end traceable via
correlation ID.

### M3 — Docker sandbox driver

**Deliverable:** the worker can run untrusted code inside a hardened Docker
container and capture stdout/stderr/exit code. Used initially for running
the repo's own test suite; later, for validating agent-generated patches.

Hardening profile (non-negotiable):
- No host network (`--network=none`), or a tightly scoped overlay only.
- No host bind mounts except the job-scoped working dir, mounted read-only
  where possible.
- `--cap-drop=ALL`, `--security-opt=no-new-privileges`.
- Non-root user inside the container.
- CPU/memory caps, wall-clock timeout (kill + record on overrun).
- Image pinned by digest, not tag.
- One container per job; teardown on completion regardless of outcome.

Key files:
- `src/sandbox/driver.ts` — dockerode-based driver with the policy above.
- `src/sandbox/runner.ts` — high-level `runTests(workdir)` / `runPatch(workdir)`.
- `sandbox/Dockerfile` — base image with common toolchains (node, python, go).

**Exit criteria:** worker can run `npm test` (or equivalent) for a fixture
repo inside the sandbox and surface results. An "escape attempt" test fixture
(tries to read host `/etc/passwd`) fails as expected.

### M4 — Claude Agent SDK + subagents

**Deliverable:** the worker invokes the Claude Agent SDK to run the
Phase II–IV loop. This is the brain landing on top of the plumbing from
M2–M3.

Subagents (markdown, versioned in repo):
- `agents/triager.md` — given a Semgrep finding + relevant file slice,
  decide: real risk, false positive, or needs-more-info. Cheap call,
  pre-filter before research.
- `agents/researcher.md` — given a confirmed finding, search the web for CVE
  details and accepted remediations. Tools: web search, web fetch.
- `agents/mechanic.md` — given finding + research, propose a patch. Tools:
  read repo files, write patch file.
- `agents/validator.md` — given patch, apply it in the sandbox, run tests,
  return pass/fail with details. Tools: sandbox runner.

Orchestration shape (in the worker, not in a subagent):
1. Triager → drop if false positive.
2. Researcher → produces a research dossier (persisted).
3. Loop up to N times: Mechanic → Validator. Reflect on failure: feed
   validator output back into Mechanic context.
4. On success → produce PR body.

**Cost controls:**
- Hard token budget per job (env-configured, default ~200k input + 50k
  output). Worker aborts and marks job `budget_exceeded` if exceeded.
- Triager runs with the cheapest model (Haiku); Mechanic uses Sonnet/Opus.
- Reflection loop capped at N=3 iterations; beyond that, escalate to human.

**Exit criteria:** end-to-end on a fixture repo with a known SQL injection:
finding → triaged real → researched → patched → validated → PR opened with
finding, research summary, patch, and validator evidence.

### M5 — GitHub PR creation + HITL surface

**Deliverable:** PRs are opened against the source repo via a GitHub App,
with structured bodies, labels, and reviewers.

- GitHub App (not personal token) with least-privilege permissions:
  `contents: write`, `pull_requests: write`, `metadata: read`. No org-wide
  access, installable per repo.
- PR body template: severity, CWE, finding location, plain-English risk
  summary, the patch, validator evidence (tests passed), links to research
  sources.
- Auto-applied labels: `security-sentinel`, severity (`sev-high`/`sev-med`/
  `sev-low`).
- Reviewer assignment from a configurable team.
- Branch naming: `sentinel/<short-sha>/<finding-id>`.
- **Prompt-injection hardening on PR bodies:** any text that originates from
  agent output is rendered inside a fenced code block, with backticks
  escaped, before being sent to GitHub. The PR title is fully templated
  from structured fields, never free-form from the agent.

**Exit criteria:** the M4 fixture run produces a real PR in a test repo,
reviewer is paged, merge requires human approval.

### M6 — Notification service

**Deliverable:** `services/notification-service/` consumes job-completion
events and posts to Slack and/or email. Decoupled from the worker so the
worker never blocks on notification delivery.

- Subscribes to a `notifications` BullMQ queue (worker publishes to it).
- Slack webhook + SMTP transport, both feature-flagged.
- Routes by severity and repo (configurable mapping).
- Failure → DLQ; never blocks the main pipeline.

**Exit criteria:** PR opens → Slack message in target channel within 30s,
with link to PR and finding summary.

### M7 — Observability

This is cross-cutting but called out as a milestone because it must be
landed before "prod-ready."

- **Structured logs** — `pino` everywhere, with `correlation_id`,
  `job_id`, `repo`, `sha` on every line.
- **Metrics** — Prometheus endpoint on each service:
  - `webhook_requests_total{event,outcome}`
  - `queue_depth{queue,state}` (waiting/active/failed)
  - `job_duration_seconds{phase}` (triage/research/patch/validate)
  - `llm_tokens_total{model,subagent,direction}` and
    `llm_cost_usd_total` (derived)
  - `sandbox_runs_total{outcome}`, `sandbox_duration_seconds`
- **Tracing** — OpenTelemetry spans across webhook → queue → worker →
  subagent calls. The `correlation_id` is the trace ID.
- **Dashboards** — one Grafana board: queue health, job throughput,
  cost per day, top-failing-repos.
- **Alerts** — queue depth growing for >10min, job failure rate >20% over
  15min, daily cost > budget.

### M8 — Agentic RAG (deferrable past v1)

**Deliverable:** Postgres + pgvector store of past successful patches keyed
by (CWE, language, framework). Researcher/Mechanic subagents consult it
before going to the web.

This is in the spec's learning objectives but **does not block prod**. Ship
M1–M7 first. Add RAG when there's enough patch history to make it useful
(rule of thumb: 50+ merged patches).

## Cross-cutting concerns (must hold at every milestone)

### Data model (Postgres)

Tables (rough shape, finalize during M2):
- `jobs(id, repo, sha, status, started_at, completed_at, correlation_id, cost_usd)`
- `findings(id, job_id, severity, cwe, file, line, raw_semgrep)`
- `research(id, finding_id, dossier_md, sources_json)`
- `patches(id, finding_id, attempt_n, diff, validator_result, validator_log)`
- `prs(id, finding_id, github_pr_number, opened_at, status)`

Indexes on `(repo, sha)`, `(status)`, `(job_id, attempt_n)`.

### Secrets

- GitHub App private key, Anthropic API key, Postgres creds, webhook
  signing secret: managed via env injection from a real secret store
  (1Password CLI for dev, cloud KMS/Vault for prod). Never committed.
- `.env.example` documents every required var with empty values.
- Worker validates all required env at boot and exits noisily if missing.

### Idempotency

Replays of the same (repo, sha) must not double-PR.
- M2: dedup at queue level (already in producer).
- M5: before opening a PR, check `prs` table for an existing open PR on
  this finding; comment on it instead of opening a new one.

### Cost ceilings

- Per-job: hard token cap, enforced in the SDK invocation.
- Per-day: aggregate cost metric → kill switch via env-controlled flag
  that flips the worker to "drain only, no new jobs."

### Testing strategy

- Unit: middleware, producer, db queries, sandbox driver policy.
- Integration: webhook → Redis (ioredis-mock), worker → Postgres
  (testcontainers).
- E2E: a fixture-vulnerable-repo lives in this monorepo under
  `fixtures/`. CI runs the full pipeline against it with a mocked Claude
  SDK that replays canned responses. Real-LLM E2E is a manual job.
- Subagent "behavioral" tests: golden-file snapshots of the messages
  sent to the SDK for canonical fixtures. Catches accidental prompt
  regressions.

### Local dev

`docker-compose.yml` at repo root brings up: Redis, Postgres, webhook
service, worker. A `make demo` target posts a signed webhook for the
fixture repo and tails the worker logs.

### Deployment

Out of scope to design here, but the shape is:
- Each service builds to a Docker image in CI.
- Migrations run as a Kubernetes Job (or equivalent) before deploy.
- Worker is horizontally scalable; webhook service is stateless.
- One Redis, one Postgres, one notification destination per environment.

## Non-goals for v1

- Multi-tenant SaaS (org isolation, billing, dashboards per tenant).
- Auto-merging PRs.
- Languages/frameworks beyond an initial set (start with Node + Python).
- Beyond-Semgrep scanners (Snyk integration, dependency CVEs, secret scanning) —
  add post-v1 as additional finding sources feeding the same pipeline.
- Fine-tuned models or self-hosted LLMs.

## Sequencing summary

```
M1 ─┐
    ├─► M2 ─► M3 ─► M4 ─► M5 ─► M6
M7 runs in parallel from M2 onward (start instrumenting as you build).
M8 deferred.
```

A reasonable first PR after this plan: stand up `services/analysis-worker/`
with the package skeleton, BullMQ consumer, and Postgres connection — i.e.
the first half of M2.
