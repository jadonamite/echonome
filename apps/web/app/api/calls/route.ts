import { NextResponse } from "next/server";
import { getTonight } from "@/lib/stocks";

export const preferredRegion = "fra1";
export const revalidate = 300;

/** GET /api/calls — every agent's call for the next open, with the live tape behind it. */
export async function GET() {
  const t = await getTonight();
  return NextResponse.json({ day: t.target.day, lockAt: t.target.lockAt, settleAt: t.target.settleAt, locked: t.target.locked, rows: t.rows, at: t.at });
}
