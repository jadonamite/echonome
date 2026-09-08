import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/copy-links — start copying a trader under a grant the follower has already
 * signed on chain. `{ proxyGrantId, traderId, sizeFraction }`.
 *
 * This route can only ever create a row that points at an EXISTING, un-revoked grant.
 * It cannot create authorisation, widen it, or move funds — the grant is the only thing
 * that gives the operator any power at all, and it is signed by the user's own wallet on
 * /connect. See TECHNICAL_ARCHITECTURE.md "The on-chain flow the frontend drives directly".
 */
export async function POST(request: Request) {
  let body: { proxyGrantId?: string; traderId?: string; sizeFraction?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const { proxyGrantId, traderId, sizeFraction } = body;

  if (!proxyGrantId || !traderId) {
    return NextResponse.json({ error: "proxyGrantId and traderId are both required" }, { status: 400 });
  }
  // The schema enforces this too; rejecting here means the user gets a sentence rather
  // than a constraint-violation stack trace.
  if (typeof sizeFraction !== "number" || !(sizeFraction > 0) || sizeFraction > 1) {
    return NextResponse.json(
      { error: "sizeFraction must be greater than 0 and no more than 1" },
      { status: 400 }
    );
  }

  try {
    const grant = await queryOne<{ id: string }>(
      `SELECT id FROM proxy_grant WHERE id = $1 AND revoked_at IS NULL`,
      [proxyGrantId]
    );
    if (!grant) {
      return NextResponse.json(
        { error: "That authorisation doesn't exist or has been revoked" },
        { status: 404 }
      );
    }

    const trader = await queryOne<{ id: string }>(`SELECT id FROM trader WHERE id = $1`, [traderId]);
    if (!trader) {
      return NextResponse.json({ error: "No such trader" }, { status: 404 });
    }

    // Re-activating an existing link rather than stacking a second one: two active links
    // from the same follower to the same trader would echo every trade twice.
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM copy_link WHERE proxy_grant_id = $1 AND trader_id = $2`,
      [proxyGrantId, traderId]
    );

    if (existing) {
      const updated = await queryOne(
        `UPDATE copy_link SET size_fraction = $1, active = true WHERE id = $2
         RETURNING id, trader_id, size_fraction, active, created_at`,
        [sizeFraction, existing.id]
      );
      return NextResponse.json({ copyLink: updated }, { status: 200 });
    }

    const created = await queryOne(
      `INSERT INTO copy_link (proxy_grant_id, trader_id, size_fraction, active)
       VALUES ($1, $2, $3, true)
       RETURNING id, trader_id, size_fraction, active, created_at`,
      [proxyGrantId, traderId, sizeFraction]
    );
    return NextResponse.json({ copyLink: created }, { status: 201 });
  } catch (err) {
    console.error("[api/copy-links POST]", err);
    return NextResponse.json({ error: "Could not start copying this trader" }, { status: 500 });
  }
}
