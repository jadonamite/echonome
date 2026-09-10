import { NextResponse } from "next/server";
import { getDecisionComments, addDecisionComment } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed/[id]/comments — load discussion comments for a trade decision.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comments = await getDecisionComments(id);
    return NextResponse.json({ comments });
  } catch (err) {
    console.error("[api/feed/[id]/comments GET]", err);
    return NextResponse.json({ error: "Could not fetch comments" }, { status: 500 });
  }
}

/**
 * POST /api/feed/[id]/comments — post a comment on a trade decision.
 * Body: { authorAddress: string, content: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { authorAddress?: string; content?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { authorAddress, content } = body;
    if (!authorAddress || typeof authorAddress !== "string") {
      return NextResponse.json({ error: "authorAddress is required" }, { status: 400 });
    }
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "content cannot be empty" }, { status: 400 });
    }
    if (content.trim().length > 1000) {
      return NextResponse.json({ error: "content must be at most 1000 characters" }, { status: 400 });
    }

    const comment = await addDecisionComment({
      decisionId: id,
      authorAddress,
      content,
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error("[api/feed/[id]/comments POST]", err);
    return NextResponse.json({ error: "Could not post comment" }, { status: 500 });
  }
}
