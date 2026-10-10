import { NextResponse } from "next/server";
import { getBoard } from "@/lib/stocks";

export const preferredRegion = "fra1";
export const revalidate = 900;

/** GET /api/board — agents ranked by Brier score over every settled night. */
export async function GET() {
  const b = await getBoard();
  return NextResponse.json({
    firstDay: b.firstDay,
    lastDay: b.lastDay,
    tickers: b.tickers,
    agents: b.scores.map(({ reliability, ...s }) => s),
    updatedAt: b.updatedAt,
  });
}
