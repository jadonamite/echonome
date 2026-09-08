import { createConfig, http } from "wagmi";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { injected } from "@wagmi/core";

/**
 * Wallet connect config, Shannon testnet only for this build.
 * See TECHNICAL_ARCHITECTURE.md "The on-chain flow the frontend drives directly".
 *
 * `injected` comes from `@wagmi/core`, NOT from `wagmi/connectors`. That barrel pulls in
 * every connector wagmi ships — including Base Account, which reaches @coinbase/cdp-sdk
 * and its optional `@x402/*` peers. Those aren't installed (we only ever wanted an
 * injected wallet), and Next fails the build on the unresolved import rather than
 * treating it as optional. `@wagmi/core` re-exports the same connector from its own
 * module, so this import costs nothing and drags in nothing.
 */
export const wagmiConfig = createConfig({
  chains: [somniaShannon],
  connectors: [injected()],
  transports: {
    [somniaShannon.id]: http(),
  },
});
