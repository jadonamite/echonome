/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/shared ships raw TS with no build step — let Next.js compile it directly.
  transpilePackages: ["@echonome/shared"],

  // Load the markets SDK from node_modules at runtime instead of bundling it into the
  // server build. Measured, not guessed: `loadMarkets(true)` completes in ~3.5s under plain
  // tsx and hung past a 10s deadline inside a bundled route handler — the SDK's WebSocket
  // RPC transport doesn't survive Next's server bundling. Only lib/markets.ts (server-side
  // market labels) depends on this; lib/somnia.ts builds its exchange in the browser.
  serverExternalPackages: ["@somnia-chain/markets-sdk"],
};

export default nextConfig;
