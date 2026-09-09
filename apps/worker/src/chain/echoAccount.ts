import { parseAbi } from "viem";

/**
 * The EchoAccount / EchoAccountFactory surface the worker uses.
 *
 * Hand-written rather than imported from the contracts package's build output, so running the
 * worker never requires having compiled the contracts. The tradeoff is that these signatures
 * can drift from `packages/contracts/src/*.sol` — the same class of silent drift that a
 * transcribed ABI always risks — so the custody verification script is the thing that catches
 * it: it exercises every one of these against the deployed contract, and a signature that has
 * drifted fails there loudly rather than reverting mysteriously in production.
 */
export const echoAccountAbi = parseAbi([
  "function placeOrder(address pool, uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, uint64 userData) returns (uint128)",
  "function cancelOrder(address pool, uint128 orderId)",
  "function executorStatus() view returns (bool active, bool isPaused, bool expired, uint64 expiry, uint256 budgetLeft)",
  "function allowedPool(address) view returns (bool)",
  "function executor() view returns (address)",
  "function owner() view returns (address)",
  "function executorExpiry() view returns (uint64)",
  "function paused() view returns (bool)",
  "function maxOrderCollateral() view returns (uint256)",
  "function totalCollateralCap() view returns (uint256)",
  "function collateralCommitted() view returns (uint256)",
  "function setExecutor(address executor, uint64 expiry)",
  "function revokeExecutor()",
  "function setPaused(bool paused)",
  "function setAllowedPool(address pool, bool allowed)",
  "function setCaps(uint256 maxOrderCollateral, uint256 totalCollateralCap)",
  "function approveToken(address token, address spender, uint256 amount)",
  "function withdrawToken(address token, address to, uint256 amount)",
]);

export const echoAccountFactoryAbi = parseAbi([
  "function deploy() returns (address account)",
  "function accountFor(address owner) view returns (address)",
  "function oneShare() view returns (uint256)",
  "event AccountDeployed(address indexed owner, address indexed account)",
]);

/** Deployed on Shannon 2026-09-09. Custody-verified: `npm run verify:custody -w @echonome/contracts`. */
export function echoAccountFactoryAddress(): `0x${string}` {
  return (process.env.ECHO_ACCOUNT_FACTORY ??
    "0xcee09039dc8020e01a12387eaa37b6a257b793d7") as `0x${string}`;
}
