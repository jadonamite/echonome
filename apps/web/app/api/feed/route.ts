import { NextResponse } from "next/server";
import { getFeedTrades, type FeedFilter } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed?filter=all|top|following|discussions&limit=30&offset=0&viewer=0x...
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = (searchParams.get("filter") ?? "all") as FeedFilter;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 30;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;
    const viewerAddress = searchParams.get("viewer") ?? null;

    const trades = await getFeedTrades({
      filter,
      limit: isNaN(limit) ? 30 : limit,
      offset: isNaN(offset) ? 0 : offset,
      viewerAddress,
    });

    return NextResponse.json({ trades });
  } catch (err) {
    console.error("[api/feed GET]", err);
    return NextResponse.json({ error: "Could not fetch trade feed" }, { status: 500 });
  }
}
