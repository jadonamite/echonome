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

-- ── Data-correctness migration (2026-09-08, second hardening pass) ─────────────────
-- `decision.implied_probability` must be a probability in [0, 1]. It wasn't: the fill
-- watcher wrote the SDK's RAW `fillPrice` (quote units, 6 decimals on this venue), so
-- every row recorded during the first live run holds a value like 960000 where 0.96 was
-- meant. Nothing downstream noticed, because nothing had ever settled — the Brier scores
-- that would have exposed it were never computed. See FEEDBACK.md.
--
-- Backfill is scale-only and self-limiting: a correct row is <= 1 and can never match, so
-- re-running this migration is a no-op rather than dividing good rows a second time.
UPDATE decision SET implied_probability = implied_probability / 1000000 WHERE implied_probability > 1;

-- With the data corrected, make the constraint the database's job, not the watcher's.
-- The whole product ranks traders on these numbers; a silently out-of-range one should
-- fail loudly at the insert, the way the side check already caught the first live bug.
ALTER TABLE decision DROP CONSTRAINT IF EXISTS decision_implied_probability_check;
ALTER TABLE decision ADD CONSTRAINT decision_implied_probability_check
  CHECK (implied_probability >= 0 AND implied_probability <= 1);

-- ── Liveness monitoring (2026-09-09) ───────────────────────────────────────────────
-- Six defects in two days, every one of them a healthy process writing nothing. An
-- uptime check would have passed through all of them. This table is how a loop proves
-- it is actually looping, rather than merely resident: each component stamps its own
-- row every tick, and a stale stamp is a wedged loop even when the process is alive.
CREATE TABLE IF NOT EXISTS worker_heartbeat (
  component     text PRIMARY KEY,
  last_beat_at  timestamptz NOT NULL DEFAULT now(),
  detail        jsonb NOT NULL DEFAULT '{}'
);
