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
const echoAccountFunctions = [
  "function placeOrder(bytes32 marketId, uint32 seriesId, address pool, uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, uint64 userData) returns (uint128)",
  "function cancelOrder(address pool, uint128 orderId)",
  "function previewAuthorisation(bytes32 marketId, uint32 seriesId, address pool) view",
  "function approveMarketCollateral(bytes32 marketId, uint32 seriesId) returns (address token, address pool)",
  "function executorStatus() view returns (bool active, bool isPaused, bool expired, uint64 expiry, uint256 budgetLeft)",
  "function allowedPool(address) view returns (bool)",
  "function allowedSeries(uint32) view returns (bool)",
  "function executorMayApprove() view returns (bool)",
  "function venueModule() view returns (address)",
  "function venueCreator() view returns (address)",
  "function venueId() view returns (bytes32)",
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
  "function setVenue(address module, address creator, bytes32 venueId)",
  "function setAllowedSeries(uint32 seriesId, bool allowed)",
  "function setExecutorMayApprove(bool allowed)",
  "function setCaps(uint256 maxOrderCollateral, uint256 totalCollateralCap)",
  "function approveToken(address token, address spender, uint256 amount)",
  "function withdrawToken(address token, address to, uint256 amount)",
] as const;

/**
 * The account's named revert reasons.
 *
 * Parsed alongside the ABI so a failed `previewAuthorisation` comes back as a name the engine
 * can record verbatim — "MarketNotInSeries" rather than an undecodable 4-byte selector. The
 * custody script's whole method rests on this: "it reverted" is satisfied by a typo, the error
 * name is not.
 */
const echoAccountErrors = [
  "error NotOwner()",
  "error NotExecutor()",
  "error ExecutorExpired()",
  "error AccountPaused()",
  "error PoolNotAllowed(address pool)",
  "error OrderTooLarge(uint256 collateral, uint256 cap)",
  "error BudgetExhausted(uint256 committed, uint256 attempted, uint256 cap)",
  "error VenueNotConfigured()",
  "error SeriesNotAllowed(uint32 seriesId)",
  "error MarketNotFromVenue(bytes32 found, bytes32 expected)",
  "error MarketNotFromCreator(address found, address expected)",
  "error PoolNotInMarket(address pool, address marketsPool)",
  "error MarketNotInSeries(uint32 seriesId, uint256 marketQid, uint256 seriesQid)",
  "error MarketNotOpen(uint64 tradingStart, uint64 expiry)",
  "error PoolNotFromVenue(address pool)",
  "error ExecutorMayNotApprove()",
] as const;

/**
 * Functions and errors together, deliberately.
 *
 * viem only decodes a custom error into `errorName` when that error is present in the ABI the
 * call was made with. Parsing the errors separately looked tidier and would have meant every
 * `previewAuthorisation` failure arrived as an undecodable selector — which is the difference
 * between telling a follower "you approved a different asset" and telling them "0x8a4f2b1c".
 */
export const echoAccountAbi = parseAbi([...echoAccountFunctions, ...echoAccountErrors]);

export const echoAccountFactoryAbi = parseAbi([
  "function deploy() returns (address account)",
  "function accountFor(address owner) view returns (address)",
  "function oneShare() view returns (uint256)",
  "event AccountDeployed(address indexed owner, address indexed account)",
]);

/**
 * Deployed on Shannon 2026-09-09. Custody-verified: `npm run verify:custody -w @echonome/contracts`.
 *
 * Redeployed when the account learned to authorise a market by SERIES instead of by pool
 * address. The account's bytecode is part of the CREATE2 preimage, so a new account contract
 * necessarily means a new factory and new account addresses — the old factory at
 * 0xcee09039… still exists and still works, and still cannot survive an hourly rollover.
 */
export function echoAccountFactoryAddress(): `0x${string}` {
  return (process.env.ECHO_ACCOUNT_FACTORY ??
    "0x4f92b138e7450e46f2843b1eb90ee0dd5060cf29") as `0x${string}`;
}
