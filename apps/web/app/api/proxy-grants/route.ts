import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * POST /api/proxy-grants — record a grant the user has ALREADY signed and confirmed on
 * chain. `{ followerAddress, operatorAddress, scope }`.
 *
 * This row is a local mirror of on-chain state, never the source of it. The chain is
 * what actually authorises the operator; this table only tells the worker which grants
 * to bother looking at. Writing a row here grants nothing, and the mirror engine still
 * checks the grant is un-revoked before every single echo.
 *
 * DELETE — mark it revoked. Same asymmetry: revoking here stops Echonome from acting,
 * but a user who wants the authorisation gone at the protocol level revokes it from
 * their own wallet, which no code of ours can undo.
 */
export async function POST(request: Request) {
  let body: { followerAddress?: string; operatorAddress?: string; scope?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const { followerAddress, operatorAddress, scope } = body;

  if (!followerAddress || !ADDRESS.test(followerAddress)) {
    return NextResponse.json({ error: "followerAddress must be a wallet address" }, { status: 400 });
  }
  if (!operatorAddress || !ADDRESS.test(operatorAddress)) {
    return NextResponse.json({ error: "operatorAddress must be a wallet address" }, { status: 400 });
  }

  try {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM proxy_grant
       WHERE lower(follower_address) = lower($1) AND lower(operator_address) = lower($2)
         AND revoked_at IS NULL`,
      [followerAddress, operatorAddress]
    );
    if (existing) {
      return NextResponse.json({ grant: existing }, { status: 200 });
    }

    const grant = await queryOne(
      `INSERT INTO proxy_grant (follower_address, operator_address, scope)
       VALUES ($1, $2, $3)
       RETURNING id, follower_address, operator_address, scope, granted_at`,
      [followerAddress, operatorAddress, scope ?? "place_and_cancel"]
    );
    return NextResponse.json({ grant }, { status: 201 });
  } catch (err) {
    console.error("[api/proxy-grants POST]", err);
    return NextResponse.json({ error: "Could not record your authorisation" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const followerAddress = new URL(request.url).searchParams.get("address");
  if (!followerAddress || !ADDRESS.test(followerAddress)) {
    return NextResponse.json({ error: "address must be a wallet address" }, { status: 400 });
  }

  try {
    // Deactivating the copy links too, so nothing is left pointing at a dead grant.
    await queryOne(
      `UPDATE copy_link SET active = false
       WHERE proxy_grant_id IN (
         SELECT id FROM proxy_grant
         WHERE lower(follower_address) = lower($1) AND revoked_at IS NULL
       )`,
      [followerAddress]
    );
    const revoked = await queryOne<{ id: string }>(
      `UPDATE proxy_grant SET revoked_at = now()
       WHERE lower(follower_address) = lower($1) AND revoked_at IS NULL
       RETURNING id`,
      [followerAddress]
    );
    return NextResponse.json({ revoked: revoked?.id ?? null });
  } catch (err) {
    console.error("[api/proxy-grants DELETE]", err);
    return NextResponse.json({ error: "Could not revoke your authorisation" }, { status: 500 });
  }
}
