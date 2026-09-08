import { NextResponse } from "next/server";
import { getTraderDecisions, getTraderSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET /api/traders/:id — one trader, their score, and their decision history. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const trader = await getTraderSummary(id);
    if (!trader) {
      return NextResponse.json({ error: "No such trader" }, { status: 404 });
    }
    const decisions = await getTraderDecisions(id);
    return NextResponse.json({ trader, decisions });
  } catch (err) {
    console.error("[api/traders/:id]", err);
    return NextResponse.json({ error: "Could not read this trader" }, { status: 500 });
  }
}
