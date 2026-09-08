import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET /api/leaderboard — traders + calibration scores, ranked, warming-up ones flagged. */
export async function GET() {
  try {
    const traders = await getLeaderboard();
    return NextResponse.json({ traders });
  } catch (err) {
    console.error("[api/leaderboard]", err);
    return NextResponse.json({ error: "Could not read the leaderboard" }, { status: 500 });
  }
}
