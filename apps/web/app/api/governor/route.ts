import { NextResponse } from "next/server";
import { getDesk } from "@/lib/stocks";

export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

/** GET /api/governor?ticker=NVDA&usd=500&spent24h=0 — how much of this buy Governor allows right now. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ticker = u.searchParams.get("ticker") ?? "";
  const requestUsd = Number(u.searchParams.get("usd") ?? "0");
  const spent = Number(u.searchParams.get("spent24h") ?? "0");
  if (!ticker || !(requestUsd > 0) || !(spent >= 0)) {
    return NextResponse.json({ error: "ticker and a positive usd are required" }, { status: 400 });
  }
  const desk = await getDesk(ticker, requestUsd, spent);
  if (!desk) return NextResponse.json({ error: `unknown ticker ${ticker}` }, { status: 404 });
  return NextResponse.json({
    ticker: desk.ticker,
    token: { symbol: desk.symbol, address: desk.address, chainId: 56 },
    requestUsd,
    allowedUsd: desk.decision.allowedUsd,
    limiter: desk.decision.limiter,
    pool: desk.decision.pool,
    impactAtAllowedBps: desk.decision.impactAtAllowedBps,
    reasons: desk.decision.reasons,
    flow: desk.flow,
    marketOpen: desk.marketOpen,
    at: desk.at,
  });
}
