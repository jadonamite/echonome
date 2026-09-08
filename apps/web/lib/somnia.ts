import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import type { Address } from "viem";

export const OPERATOR_ADDRESS = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS as Address | undefined;

/**
 * DreamDEX's OperatorPermissionsRegistry on Shannon testnet.
 *
 * Absent from the SDK's `SOMNIA_TESTNET_ADDRESSES` — found by asking a live SPOT pool
 * (`getOperatorPermissionsRegistry()`, which binary pools don't implement), then confirmed
 * against DreamDEX's published Operators page. Mainnet is
 * `0xE7a190736B6024a4DbafadC04E283075877005ce`.
 *
 * Knowing it does NOT unblock copy-trading here — see OPERATOR_GRANT_APPLIES_TO_BINARY.
 */
export const OPERATOR_PERMISSIONS_REGISTRY: Address =
  (process.env.NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS as Address | undefined) ??
  "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A";

/**
 * Whether an operator grant actually authorises anything on an Event Contract pool.
 *
 * It does not, and this is proven on chain rather than assumed — run
 * `npm run verify:operator-gate` in `apps/worker`, or see FEEDBACK.md. With BOTH a global
 * and a per-pool grant recorded on the registry above, for the real operator, on the real
 * live pool, for the correct `placeBinaryOrderFor` selector (`0x5d97c566`),
 * `placeBinaryOrderFor` still reverts `OnlyApprovedContracts` — and it reverts identically
 * when the OWNER calls it for themselves, so it is not a per-user permission check at all.
 * Binary pools do not consult this registry; the SDK says so in a source comment
 * ("a BinaryPool ... has no operator gate") that appears in none of its type definitions.
 *
 * This constant exists so the flip is a one-line change on the day DreamDEX admits a
 * third-party operator on Event Contracts. Until then the grant step stays disabled, because
 * recording a ProxyGrant that authorises nothing would be a lie told to a follower about
 * their own funds.
 */
export const OPERATOR_GRANT_APPLIES_TO_BINARY = false;

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
      operatorPermissionsRegistry: OPERATOR_PERMISSIONS_REGISTRY,
    },
  });
  exchange.setSigner({ walletClient: walletClient as never });
  return exchange;
}
