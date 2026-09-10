import { NextResponse } from "next/server";
import { toggleDecisionReaction, type ReactionType } from "@/lib/queries";

export const dynamic = "force-dynamic";

const VALID_REACTIONS: ReactionType[] = ["bullish", "bearish", "echoed"];

/**
 * POST /api/feed/[id]/reactions — toggle or update a sentiment reaction on a trade.
 * Body: { walletAddress: string, reaction: "bullish" | "bearish" | "echoed" }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { walletAddress?: string; reaction?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { walletAddress, reaction } = body;
    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }
    if (!reaction || !VALID_REACTIONS.includes(reaction as ReactionType)) {
      return NextResponse.json(
        { error: `reaction must be one of: ${VALID_REACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await toggleDecisionReaction({
      decisionId: id,
      walletAddress,
      reaction: reaction as ReactionType,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/feed/[id]/reactions POST]", err);
    return NextResponse.json({ error: "Could not update reaction" }, { status: 500 });
  }
}
