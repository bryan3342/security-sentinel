-- Initial schema for the analysis worker.
-- Tables match the data model in docs/production-plan.md.
-- Only `jobs` is read/written by M2; the rest are scaffolded so later
-- milestones don't require additional migrations to start using them.

CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  repository      TEXT NOT NULL,
  commit_sha      TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  priority        INTEGER NOT NULL DEFAULT 5,
  correlation_id  TEXT,
  payload         JSONB NOT NULL,
  cost_usd        NUMERIC(10, 4) NOT NULL DEFAULT 0,
  error           TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_repo_sha_idx ON jobs (repository, commit_sha);
CREATE INDEX IF NOT EXISTS jobs_status_idx   ON jobs (status);

CREATE TABLE IF NOT EXISTS findings (
  id            BIGSERIAL PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  severity      TEXT NOT NULL,
  cwe           TEXT,
  file_path     TEXT NOT NULL,
  line          INTEGER,
  raw_semgrep   JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS findings_job_idx ON findings (job_id);

CREATE TABLE IF NOT EXISTS research (
  id           BIGSERIAL PRIMARY KEY,
  finding_id   BIGINT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  dossier_md   TEXT NOT NULL,
  sources      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patches (
  id                BIGSERIAL PRIMARY KEY,
  finding_id        BIGINT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  attempt_n         INTEGER NOT NULL,
  diff              TEXT NOT NULL,
  validator_result  TEXT NOT NULL CHECK (validator_result IN ('pass', 'fail', 'error')),
  validator_log     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finding_id, attempt_n)
);

CREATE TABLE IF NOT EXISTS prs (
  id                BIGSERIAL PRIMARY KEY,
  finding_id        BIGINT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  github_pr_number  INTEGER NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('open', 'merged', 'closed')),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finding_id, github_pr_number)
);
