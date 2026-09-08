import { createConfig, http } from "wagmi";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { injected } from "wagmi/connectors";

// T011 — wallet connect config, Shannon testnet only for this build.
// See TECHNICAL_ARCHITECTURE.md "The on-chain flow the frontend drives directly".
export const wagmiConfig = createConfig({
  chains: [somniaShannon],
  connectors: [injected()],
  transports: {
    [somniaShannon.id]: http(),
  },
});
