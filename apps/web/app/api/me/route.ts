import { NextResponse } from "next/server";
import { getActiveGrant, getCopyLinksForFollower } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET /api/me?address=0x… — one wallet's authorisation state and its copy links. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const [grant, copyLinks] = await Promise.all([
      getActiveGrant(address),
      getCopyLinksForFollower(address),
    ]);
    return NextResponse.json({ grant, copyLinks });
  } catch (err) {
    console.error("[api/me]", err);
    return NextResponse.json({ error: "Could not read your account" }, { status: 500 });
  }
}
