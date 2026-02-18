# ADR-001: Use BullMQ for Job Queuing

## Status

Accepted

## Context

Security Sentinel needs a reliable job queue to decouple webhook ingestion from analysis processing. The queue must support:

- Job prioritization (critical branches/files analyzed first)
- Automatic retries with exponential backoff
- Job deduplication (same commit should not be analyzed twice)
- Visibility into queue health (waiting, active, completed, failed counts)

Alternatives considered:

| Option     | Pros | Cons |
|------------|------|------|
| **BullMQ** | Native Node.js, rich feature set, Redis-backed, active maintenance | Requires Redis infrastructure |
| RabbitMQ   | Protocol-level reliability, language-agnostic | Heavier operational overhead, separate broker process |
| AWS SQS    | Fully managed, scales automatically | Vendor lock-in, limited priority support, no local dev parity |
| Kafka      | Excellent throughput, event sourcing | Overkill for job queue pattern, complex ops |

## Decision

Use **BullMQ** with Redis as the backing store.

## Consequences

- Redis becomes a required infrastructure dependency for all environments.
- Job prioritization, retries, and deduplication are available out of the box.
- The team must monitor Redis memory usage as job history accumulates (mitigated by `removeOnComplete` / `removeOnFail` limits).
- Local development only requires a Redis instance (easily provided via Docker).
