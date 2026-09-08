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
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'missed')),
  settled_outcome     text CHECK (settled_outcome IN ('up', 'down')),
  tx_hash             text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS echo_copy_link_created_idx ON echo (copy_link_id, created_at);
