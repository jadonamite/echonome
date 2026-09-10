import type { Metadata } from "next";
import { getFeedTrades } from "@/lib/queries";
import { FeedView } from "@/components/feed/feed-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trade Feed · Echonome",
  description:
    "Live social stream of trades, follower echoes, and community commentary on Somnia event markets.",
};

export default async function FeedPage() {
  const initialTrades = await getFeedTrades({ filter: "all", limit: 30 });

  return <FeedView initialTrades={initialTrades} initialFilter="all" />;
}
