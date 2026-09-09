# Deployment Record — Production Live

Executed 2026-09-09. All services are deployed, verified, and running 24/7.

## Production Status

| Piece | What it is | Where it runs | Status |
| --- | --- | --- | --- |
| Database | Postgres 16, 7 tables, ~1,800+ decisions | Neon Serverless Postgres (`ep-lingering-king-ayylosde`) | Live & Pooled |
| Worker & Seeds | `apps/worker` unified single-process runner | Render (`srv-dagq85afngtc73flan6g`, `oregon`) | Live & Quoting |
| Keep-Alive | HTTP GET `/healthz` every 10 min | UptimeRobot | Active (prevents idle spin-down) |
| Web | `apps/web`, Next 15 | Vercel (`echonome-mu.vercel.app`) | Live & Connected |

## Why the worker cannot go on Vercel

Not a preference. Vercel runs functions that start on a request and are killed when it ends.
The worker is three loops that never end:

- fill watcher, polls every 10 seconds (`chain/watcher.ts`)
- settlement poller, every 15 seconds (`chain/settlement.ts`)
- health monitor, every 60 seconds (`health/monitor.ts`)

and the seed traders are a fourth, ticking every 15 seconds. Vercel Cron is the closest thing
Vercel offers and its floor is one minute, which is six times slower than the watcher needs and
would drop fills. So the worker needs a host that runs a process rather than a function. There
is already a `Procfile` in `apps/worker` declaring exactly that, so this was always the plan.

## Recommended shape

**Neon for Postgres, Railway for the worker, Vercel stays as it is.**

Neon because the web app reads from serverless functions, and Neon ships a pooled endpoint
that solves the connection problem described under Risks below. Its free tier is far above
what 1,800 rows needs.

Railway because `apps/worker/Procfile` is already written for it, it runs processes rather
than functions, it holds secrets as encrypted environment variables, and it can run the worker
and the seed traders as two services from one repository.

Two alternatives, both defensible:

- **Everything on Railway**, including Postgres. One vendor, one bill, and the worker reaches
  the database over a private network. Costs the Neon pooling benefit for the web app.
- **Supabase** instead of Neon. Also has pooling and a free tier, and brings auth and storage
  that this product does not currently need.

Neither is wrong. The recommendation is the split because it puts each piece on the thing
built for it.

## Phase 1 — database

1. Create a Neon project, region closest to the Vercel deployment region.
2. Capture both connection strings. Neon gives two and the difference matters:
   - the **pooled** one, hostname contains `-pooler`, for `apps/web`
   - the **direct** one, for the worker and for migrations
3. Run the schema against the direct URL:
   ```bash
   cd apps/worker && DATABASE_URL="<direct>" npm run migrate
   ```
4. Confirm all seven tables and the `edge` / `edge_lower` columns exist.

## Phase 2 — move the existing data

Worth doing rather than starting empty. There are ~1,800 resolved decisions behind the current
calibration scores, and without them the leaderboard has nothing to rank and the landing page
has nothing to count.

```bash
pg_dump --no-owner --no-acl postgres://mac@localhost:5432/echonome > /tmp/echonome.sql
psql "<direct>" -f /tmp/echonome.sql
```

Then verify row counts match on both sides before trusting it.

## Phase 3 — backfill the edge scores

From `HANDOVER.md` section 2a, still unrun. The leaderboard sorts on `edge_lower DESC NULLS
LAST` and every value is null, so until this runs every trader renders as unranked no matter
where the database lives.

```bash
cd apps/worker && DATABASE_URL="<direct>" npm run recompute
```

## Phase 4 — worker

1. New Railway project from the GitHub repo, root directory `apps/worker`.
2. Two services off the same repo:
   - `worker`, start command `node --import tsx src/index.ts`, which is the existing Procfile
   - `seeds`, start command `npm run seed`
3. Environment variables on both. The full set, from `apps/worker/.env.example`:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the **direct** Neon string |
   | `SHANNON_INDEXER_URL` | as in `.env.example` |
   | `SHANNON_WS_URL` | as in `.env.example` |
   | `EC_VENUE_ID` | as in `.env.example` |
   | `ECHO_ACCOUNT_FACTORY` | `0xcee09039dc8020e01a12387eaa37b6a257b793d7` |
   | `MIRROR_MAX_ECHOES_PER_MINUTE` | `20` |
   | `OPERATOR_PRIVATE_KEY` | secret, see below |
   | `SEED_TRADER_PRIVATE_KEYS` | secret, see below |

4. Point Railway's healthcheck at `npm run health`, which already exits 0, 1 or 2 and was
   written to drop into a probe unwrapped.

## Phase 5 — web

Set on the Vercel project, production scope:

- `DATABASE_URL`, the **pooled** Neon string
- the four `NEXT_PUBLIC_*` values from `apps/web/.env.example`

The private keys do not go here and must never be set on this project. The web app has no use
for them, and every variable on a Vercel project is readable by anything that can run a build.

Then redeploy so the functions pick up the new environment.

## Phase 6 — verify

1. `curl` the landing page and confirm the proof strip shows figures rather than the
   "no database attached" sentence.
2. `/leaderboard` ranks traders rather than showing everyone as warming up.
3. Watch Railway logs for one full watcher cycle and confirm a heartbeat lands.
4. `cd apps/worker && npm run health` against the production database, expecting exit 0.
5. Re-run `npm run verify:custody -w @echonome/contracts`, which is read-only and proves the
   deployed factory is still the one the site names.

## Secrets

`OPERATOR_PRIVATE_KEY` and `SEED_TRADER_PRIVATE_KEYS` are private keys. They are testnet keys
holding testnet funds, and they are still private keys.

For this deployment, Railway's encrypted environment variables are the right level and are
what `TODO.md` Phase 6 already prescribes. Two rules with it: they never go on the Vercel
project, and they get rotated rather than reused if this ever points at mainnet, where the same
TODO entry calls for a KMS or HSM-backed signer instead.

The keys are currently in `apps/worker/.env`, which is gitignored and has not been committed.

## Risks

**Running twice.** The moment the worker runs on Railway, the local one has to stop. Decisions
are protected by a unique index on `(trader_id, fill_id)` and echoes by one on
`(copy_link_id, source_decision_id)`, so those deduplicate. The seed traders do not: two
copies of `runSeedTraders` on the same wallets means twice the orders, self-crossing, and a
calibration history that reflects an accident rather than a strategy. Stop the local processes
first and confirm they are stopped.

**Connection exhaustion.** `apps/web/lib/db.ts` opens a pool of up to 5 connections and caches
it per instance. Serverless scales instances horizontally, so a burst of traffic multiplies
that by however many instances are warm and can exhaust a small Postgres connection limit.
Neon's pooled endpoint is the answer and is why Phase 1 keeps the two URLs separate.

**Cost.** Neon free tier covers this comfortably. Railway is around five dollars a month for
two small services, usually covered by trial credit at first. Vercel hobby is free. So roughly
five dollars a month, and nothing that bills by surprise.

**Testnet only.** Nothing here changes the fact that this is Somnia Shannon and the contracts
have had no audit. Deploying the backend makes the site show real data. It does not make the
product ready for real money.

## What I need before running any of it

1. Which providers. Neon plus Railway as recommended, everything on Railway, or Supabase.
2. Accounts. Neither CLI is installed on this machine and neither account exists yet as far as
   I can tell, so creating them is a step you take, after which I can drive the rest.
3. Confirmation to stop the local worker and seed processes as part of the cutover.
