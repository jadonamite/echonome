import { createConfig, http } from "wagmi";
import { bsc } from "viem/chains";
import { injected } from "@wagmi/core";

/**
 * BNB Smart Chain mainnet. Browser wallets, including Binance Web3 Wallet, announce themselves
 * through EIP-6963 and appear alongside the generic injected connector.
 *
 * `injected` comes from `@wagmi/core`, not `wagmi/connectors`, whose barrel pulls in optional
 * peers that are not installed and fail the build.
 */
export const wagmiConfig = createConfig({
  chains: [bsc],
  connectors: [injected({ shimDisconnect: false })],
  transports: {
    [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC_URL || "https://bsc-rpc.publicnode.com"),
  },
});
