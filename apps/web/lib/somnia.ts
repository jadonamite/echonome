import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import type { Address } from "viem";

export const OPERATOR_ADDRESS = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS as Address | undefined;

/**
 * The OperatorPermissionsRegistry address.
 *
 * 🚧 OPEN BLOCKER: this is NOT in the SDK's baked-in `SOMNIA_TESTNET_ADDRESSES` — every key
 * was printed and it genuinely isn't there — and `setOperatorApprovalGlobal` requires it
 * (`config.addresses.operatorPermissionsRegistry`, or a per-call `operatorRegistry`
 * override). Until it's known, the grant step cannot be executed against the real contract.
 *
 * It is read from the environment rather than hardcoded so that the moment the address is
 * found, the grant flow works with a config change and no code change. The connect page
 * renders an explicit blocked state when it's absent — it never simulates a grant that
 * didn't happen. See FEEDBACK.md.
 */
export const OPERATOR_REGISTRY_ADDRESS = process.env
  .NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS as Address | undefined;

const indexerUrl =
  process.env.NEXT_PUBLIC_SHANNON_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
const wsRpcUrl =
  process.env.NEXT_PUBLIC_SHANNON_WS_URL ?? "wss://api.infra.testnet.somnia.network/ws";

/**
 * An exchange bound to the browser's own wallet. The SDK's documented browser pattern:
 * construct unauthenticated, then `setSigner({ walletClient })` when the user connects.
 * No private key ever exists in this app — the user's wallet signs, or nothing happens.
 */
export function createBrowserExchange(walletClient: unknown): SomniaMarkets {
  const exchange = new SomniaMarkets({
    indexerUrl,
    chain: somniaShannon,
    wsRpcUrl,
    addresses: {
      ...SOMNIA_TESTNET_ADDRESSES,
      ...(OPERATOR_REGISTRY_ADDRESS
        ? { operatorPermissionsRegistry: OPERATOR_REGISTRY_ADDRESS }
        : {}),
    },
  });
  exchange.setSigner({ walletClient: walletClient as never });
  return exchange;
}
