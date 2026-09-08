import { NextResponse } from "next/server";
import { getEchoesForFollower } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET /api/me/echoes?address=0x… — every trade placed for this wallet, newest first. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const echoes = await getEchoesForFollower(address);
    return NextResponse.json({ echoes });
  } catch (err) {
    console.error("[api/me/echoes]", err);
    return NextResponse.json({ error: "Could not read your echoes" }, { status: 500 });
  }
}
