import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/copy-links/:id — stop copying a trader.
 *
 * Sets `active = false`. The mirror engine re-reads this on every detected fill
 * (`WHERE trader_id = $1 AND active = true`), so stopping takes effect on the very next
 * trade rather than at the end of some polling window. It does NOT touch the on-chain
 * grant — that is the user's to revoke from their own wallet, and revoking it kills every
 * copy at once. Two separate switches on purpose: one for "stop copying this trader",
 * one for "revoke Echonome's permission entirely".
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const updated = await queryOne<{ id: string; active: boolean }>(
      `UPDATE copy_link SET active = false WHERE id = $1 RETURNING id, active`,
      [id]
    );
    if (!updated) {
      return NextResponse.json({ error: "No such copy link" }, { status: 404 });
    }
    return NextResponse.json({ copyLink: updated });
  } catch (err) {
    console.error("[api/copy-links/:id DELETE]", err);
    return NextResponse.json({ error: "Could not stop this copy" }, { status: 500 });
  }
}

/** PATCH /api/copy-links/:id — pause or resume without deleting. `{ active: boolean }`. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active must be true or false" }, { status: 400 });
  }

  try {
    const updated = await queryOne<{ id: string; active: boolean }>(
      `UPDATE copy_link SET active = $1 WHERE id = $2 RETURNING id, active`,
      [body.active, id]
    );
    if (!updated) {
      return NextResponse.json({ error: "No such copy link" }, { status: 404 });
    }
    return NextResponse.json({ copyLink: updated });
  } catch (err) {
    console.error("[api/copy-links/:id PATCH]", err);
    return NextResponse.json({ error: "Could not update this copy" }, { status: 500 });
  }
}
