-- Echonome worker schema. Postgres. Applied by src/db/migrate.ts.
-- Mirrors packages/shared/src/types.ts field-for-field.

CREATE TABLE IF NOT EXISTS trader (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address     text NOT NULL UNIQUE,
  label       text NOT NULL,
  is_seed     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id            uuid NOT NULL REFERENCES trader(id),
  market_id            text NOT NULL,
  side                 text NOT NULL CHECK (side IN ('up', 'down')),
  implied_probability  numeric NOT NULL,
  settled_outcome      text CHECK (settled_outcome IN ('up', 'down')),
  resolved_at          timestamptz,
  fill_id              text, -- the SDK's own fill identity ("${blockNumber}_${logIndex}") — see idempotency block below
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decision_trader_created_idx ON decision (trader_id, created_at);

CREATE TABLE IF NOT EXISTS calibration_score (
  trader_id     uuid PRIMARY KEY REFERENCES trader(id),
  brier_score   numeric NOT NULL,
  reliability   jsonb NOT NULL DEFAULT '[]',
  sample_count  integer NOT NULL DEFAULT 0,
  computed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proxy_grant (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_address  text NOT NULL,
  operator_address  text NOT NULL,
  scope             text NOT NULL,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz
);
CREATE INDEX IF NOT EXISTS proxy_grant_follower_idx ON proxy_grant (follower_address);

CREATE TABLE IF NOT EXISTS copy_link (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proxy_grant_id  uuid NOT NULL REFERENCES proxy_grant(id),
  trader_id       uuid NOT NULL REFERENCES trader(id),
  size_fraction   numeric NOT NULL CHECK (size_fraction > 0 AND size_fraction <= 1),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS copy_link_trader_active_idx ON copy_link (trader_id, active);

CREATE TABLE IF NOT EXISTS echo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_link_id        uuid NOT NULL REFERENCES copy_link(id),
  source_decision_id  uuid NOT NULL REFERENCES decision(id),
  market_id           text NOT NULL,
  side                text NOT NULL CHECK (side IN ('up', 'down')),
  size                numeric NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'missed', 'failed')),
  failure_reason      text, -- set when status = 'failed' — the revert/error name, not a stack trace
  settled_outcome     text CHECK (settled_outcome IN ('up', 'down')),
  tx_hash             text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS echo_copy_link_created_idx ON echo (copy_link_id, created_at);

-- ── Phase 6 hardening migrations (2026-09-08) ──────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS above is a no-op once a table already exists, so every
-- column/constraint added after the table's first deploy needs its own explicit ALTER
-- here — this block is itself the running migration history, not just the end state.

ALTER TABLE echo ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE echo DROP CONSTRAINT IF EXISTS echo_status_check;
ALTER TABLE echo ADD CONSTRAINT echo_status_check CHECK (status IN ('pending', 'settled', 'missed', 'failed'));

-- Idempotency: one echo per (copy_link, source_decision), full stop. A watcher restart,
-- a duplicate poll, or a retried tick can never double-echo the same trade to the same
-- follower — the DB itself refuses it, not just application logic.
CREATE UNIQUE INDEX IF NOT EXISTS echo_copy_link_decision_unique ON echo (copy_link_id, source_decision_id);

-- Same idempotency guarantee one layer up: a fill is a fill, once, PER TRADER — not
-- globally unique on fill_id alone, because one fill event can legitimately produce two
-- Decisions (maker + taker) when two of our own tracked traders cross each other, which
-- already happened live (ec-maker vs ec-oracle-follow triggered SelfMatchCancelTaker —
-- see FEEDBACK.md). Nullable + a unique index so rows inserted before this column
-- existed don't break the migration — every new row from the watcher populates it.
ALTER TABLE decision ADD COLUMN IF NOT EXISTS fill_id text;
DROP INDEX IF EXISTS decision_fill_id_unique; -- superseded by the composite index below, same migration pass
CREATE UNIQUE INDEX IF NOT EXISTS decision_trader_fill_unique ON decision (trader_id, fill_id) WHERE fill_id IS NOT NULL;
