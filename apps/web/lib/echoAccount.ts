import { parseAbi, type Address } from "viem";

/**
 * The EchoAccount surface the browser needs. Mirrors `apps/worker/src/chain/echoAccount.ts`.
 *
 * Every function here is one the FOLLOWER calls with their own wallet. The browser never calls
 * `placeOrder` — that is the executor's, and the executor is the worker. If a function that
 * spends or trades ever appears in this file, something has gone wrong with the split.
 */
export const echoAccountAbi = parseAbi([
  "function owner() view returns (address)",
  "function executor() view returns (address)",
  "function executorExpiry() view returns (uint64)",
  "function paused() view returns (bool)",
  "function allowedPool(address) view returns (bool)",
  "function allowedSeries(uint32) view returns (bool)",
  "function venueModule() view returns (address)",
  "function venueCreator() view returns (address)",
  "function venueId() view returns (bytes32)",
  "function executorMayApprove() view returns (bool)",
  "function maxOrderCollateral() view returns (uint256)",
  "function totalCollateralCap() view returns (uint256)",
  "function collateralCommitted() view returns (uint256)",
  "function executorStatus() view returns (bool active, bool isPaused, bool expired, uint64 expiry, uint256 budgetLeft)",
  "function setExecutor(address executor, uint64 expiry)",
  "function revokeExecutor()",
  "function setPaused(bool paused)",
  "function setAllowedPool(address pool, bool allowed)",
  // The one-time authorisation. `setAllowedSeries` is what a follower signs instead of
  // re-approving a pool address every hour, and turning it off is how they stop copying an
  // asset without touching anything else.
  "function setVenue(address module, address creator, bytes32 venueId)",
  "function setAllowedSeries(uint32 seriesId, bool allowed)",
  "function setExecutorMayApprove(bool allowed)",
  "function setCaps(uint256 maxOrderCollateral, uint256 totalCollateralCap)",
  "function approveToken(address token, address spender, uint256 amount)",
  "function withdrawToken(address token, address to, uint256 amount)",
]);

export const echoAccountFactoryAbi = parseAbi([
  "function deploy() returns (address account)",
  "function accountFor(address owner) view returns (address)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function faucet(uint256 amount)",
]);

/** Deployed on Shannon 2026-09-09; custody-verified on chain. A follower can read the code at
 *  this address and check it against `packages/contracts/src/` before trusting it with a cent. */
export const ECHO_ACCOUNT_FACTORY = (process.env.NEXT_PUBLIC_ECHO_ACCOUNT_FACTORY ??
  "0xcee09039dc8020e01a12387eaa37b6a257b793d7") as Address;

/** Collateral token (tUSDC) on Shannon, 6 decimals. */
export const COLLATERAL = (process.env.NEXT_PUBLIC_COLLATERAL_TOKEN ??
  "0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e") as Address;

export const COLLATERAL_DECIMALS = 6;

/** How long a follower's authorisation lasts before it lapses and must be renewed on purpose. */
export const DEFAULT_GRANT_HOURS = 24;
