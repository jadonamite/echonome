// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @notice The subset of a DreamDEX BinaryPool this account needs.
/// @dev `placeBinaryOrder` places an order owned by `msg.sender`. That is the whole reason
///      this contract exists: the third-party variant, `placeBinaryOrderFor`, is closed to
///      everyone but protocol system contracts (it reverts `OnlyApprovedContracts` even for
///      the owner acting on their own behalf — verified on Shannon, see FEEDBACK.md). So
///      whatever holds a follower's collateral must itself be the caller.
interface IBinaryPool {
    function placeBinaryOrder(
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k,
        uint64 userData
    ) external payable returns (bool success, uint128 id);

    function cancelOrder(uint128 orderId) external;
}

interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice One market as the venue's own module records it.
/// @dev ABI-identical to the module's 14-value `markets(bytes32)` return — every field is
///      static, so a struct and a flat tuple encode the same. Taken as a struct so decoding
///      costs one memory pointer instead of fourteen stack slots.
struct MarketRecord {
    uint256 oracleQuestionId;
    uint8 outcomeSlotCount;
    uint8 voidPolicy;
    address collateral;
    uint32 originOperatorId;
    bytes32 originVenueId;
    address oracleAdapter;
    address creator;
    address market;
    address pool;
    uint256 yesId;
    uint256 noId;
    uint64 tradingStart;
    uint64 expiry;
}

/// @notice The venue's market registry — the contract that decides what a real market is.
interface IBinaryMarketsModule {
    function markets(bytes32 marketId) external view returns (MarketRecord memory);

    /// @dev Non-zero only for a pool the module itself minted. The cheapest possible proof
    ///      that a pool address is not something the caller invented.
    function poolCreator(address pool) external view returns (address creator);
}

/// @notice The venue's market factory, which publishes a rolling series per asset+interval.
interface IMarketCreator {
    /// @dev The oracle question of the series' CURRENT market. This is the hinge the whole
    ///      series check turns on: it moves by itself every time the window rolls, which is
    ///      exactly why a follower never has to sign again.
    function referenceQidBySeries(uint32 seriesId) external view returns (uint256 qid);

    /// @dev The series' registered definition. Only `intervalSec` is read here — it is what
    ///      separates two markets that settle at the same instant on the same asset.
    function seriesById(uint32 seriesId)
        external
        view
        returns (
            address collateral,
            string memory asset,
            uint64 numericDecimals,
            uint64 intervalSec,
            uint64 settlementWindow
        );
}

/**
 * @title EchoAccount
 * @notice A trading account a follower owns, which Echonome's engine may trigger but can
 *         never drain.
 *
 * @dev The security model, stated as plainly as it can be:
 *
 *      - The OWNER can do anything, always. Withdraw, reconfigure, pause, revoke. No
 *        condition anywhere in this contract gates an owner action, and there is no state
 *        the executor can put the account into that locks the owner out.
 *
 *      - The EXECUTOR can do exactly two things — place an order, cancel an order — and only
 *        while every one of the owner's conditions holds. There is no code path from the
 *        executor to a token transfer, to a configuration change, or to an arbitrary call.
 *        That is not a policy; it is the absence of a function.
 *
 *      This is a stronger guarantee than the operator-grant design it replaces, because the
 *      follower can read it here rather than trusting a registry whose semantics had to be
 *      discovered by experiment.
 *
 *      Deliberately NOT upgradeable. An upgradeable account would mean the deployer could
 *      change these rules after the follower funded it, which would make every promise above
 *      conditional on our good behaviour — exactly what this design exists to avoid.
 */
contract EchoAccount {
    // ─────────────────────────────────────────────────────────────────────────────
    // Immutable identity
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice The follower. Sole authority over funds and configuration, forever.
    address public immutable owner;

    /// @notice One whole outcome share in raw units (10**baseDecimals). 1e6 on every Event
    ///         Contracts market observed on this venue, but set at deploy rather than
    ///         hardcoded so a venue with different decimals cannot silently mis-size every
    ///         collateral check in this contract.
    uint256 public immutable oneShare;

    // ─────────────────────────────────────────────────────────────────────────────
    // Owner-controlled permission state
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice The engine allowed to place and cancel orders. Zero means nobody.
    address public executor;

    /// @notice The executor's authority ends at this timestamp. A permission the follower has
    ///         forgotten about is a permission they have not consented to, so it lapses on its
    ///         own and has to be renewed deliberately.
    uint64 public executorExpiry;

    /// @notice Immediate stop for executor actions, without giving up the configuration.
    bool public paused;

    /// @notice Individual pools the executor may trade on, named by the owner.
    /// @dev An earlier version of this comment claimed pool addresses are re-bound to the next
    ///      market when a cadence window rolls, and that allowlisting one therefore covered its
    ///      future windows. That is FALSE, and measuring it is what prompted the series check
    ///      below: 14 live markets on this venue had 14 distinct pool addresses, none shared.
    ///      A pool address is one market and one window. Naming pools by hand therefore buys a
    ///      follower exactly one hour of copying before every order fails `PoolNotAllowed` —
    ///      which is what happened, 231 times, at the first rollover after the demo was set up.
    ///
    ///      This mapping is kept as the owner's manual override. The automatic path is
    ///      `allowedSeries`, and an order may use either.
    mapping(address => bool) public allowedPool;

    // ── The venue, as the owner has vouched for it ────────────────────────────────
    //
    // These four values are what let a follower approve a KIND of market once instead of
    // individual markets forever. `setVenue` names the contracts that are allowed to answer
    // "is this a real market?", and `allowedSeries` names which of that venue's rolling
    // series the executor may trade. Nothing here is writable by the executor.

    /// @notice The venue's market registry, the only contract this account will believe about
    ///         what a market is. Zero disables the automatic path entirely.
    address public venueModule;

    /// @notice The venue's market factory, which publishes the rolling series.
    /// @dev Pinned by the owner rather than read from the market record, so that a market
    ///      claiming an attacker-controlled creator can never be the thing asked whether it
    ///      belongs to an approved series. A creator migration is a deliberate re-consent.
    address public venueCreator;

    /// @notice The venue id every tradeable market must carry.
    bytes32 public venueId;

    /// @notice Rolling series the executor may trade — e.g. "BTC, hourly" on this venue.
    /// @dev A series id is a permanent on-chain name for an asset at a cadence; the market it
    ///      points at changes by itself every window. That is the whole fix: the follower signs
    ///      once, and the authorisation follows the venue's own rollover with no further
    ///      signature and no widening of what was approved.
    mapping(uint32 => bool) public allowedSeries;

    /// @notice Whether the executor may grant collateral allowances to venue-vouched pools.
    /// @dev Default false. See `setExecutorMayApprove` for exactly what turning it on permits.
    bool public executorMayApprove;

    /// @notice Most collateral a single order may commit.
    uint256 public maxOrderCollateral;

    /// @notice Lifetime ceiling on collateral the executor may commit, cumulatively.
    /// @dev A per-order cap alone bounds one mistake but not a compromised key placing many
    ///      individually-reasonable orders. This is a budget, never decremented on settlement,
    ///      because a self-replenishing allowance is not a ceiling. The owner raises it
    ///      deliberately when they want to keep going.
    uint256 public totalCollateralCap;

    /// @notice Collateral the executor has committed so far, against `totalCollateralCap`.
    uint256 public collateralCommitted;

    // ─────────────────────────────────────────────────────────────────────────────
    // Events — every state change an owner or an auditor would want to reconstruct
    // ─────────────────────────────────────────────────────────────────────────────

    event ExecutorSet(address indexed executor, uint64 expiry);
    event ExecutorRevoked(address indexed formerExecutor);
    event PausedSet(bool paused);
    event PoolAllowed(address indexed pool, bool allowed);
    event VenueSet(address indexed module, address indexed creator, bytes32 venueId);
    event SeriesAllowed(uint32 indexed seriesId, bool allowed);
    event ExecutorApprovalPermissionSet(bool allowed);
    event VenuePoolApproved(address indexed pool, address indexed token, uint256 amount);
    event CapsSet(uint256 maxOrderCollateral, uint256 totalCollateralCap);
    event CommittedReset(uint256 previousCommitted);
    event OrderPlaced(address indexed pool, uint8 kind, uint256 price, uint256 quantity, uint256 collateral, uint128 orderId);
    event OrderCancelled(address indexed pool, uint128 orderId);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────────
    // Errors — named so a revert tells a follower what happened, not just that it failed
    // ─────────────────────────────────────────────────────────────────────────────

    error NotOwner();
    error NotExecutor();
    error ExecutorExpired();
    error AccountPaused();
    error PoolNotAllowed(address pool);
    error VenueNotConfigured();
    error SeriesNotAllowed(uint32 seriesId);
    error MarketNotFromVenue(bytes32 found, bytes32 expected);
    error MarketNotFromCreator(address found, address expected);
    error PoolNotInMarket(address pool, address marketsPool);
    error MarketNotInSeries(uint32 seriesId, uint256 marketQid, uint256 seriesQid);
    error MarketCadenceMismatch(uint32 seriesId, uint64 windowSeconds, uint64 seriesInterval);
    error MarketNotOpen(uint64 tradingStart, uint64 expiry);
    error PoolNotFromVenue(address pool);
    error ExecutorMayNotApprove();
    error OrderTooLarge(uint256 collateral, uint256 cap);
    error BudgetExhausted(uint256 committed, uint256 attempted, uint256 cap);
    error ZeroAddress();
    error PlacementFailed();
    error CallFailed(bytes returndata);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev Every condition the executor is subject to, in one place, so none can be missed
    ///      by a future function that forgets one.
    modifier onlyActiveExecutor() {
        if (msg.sender != executor || executor == address(0)) revert NotExecutor();
        if (paused) revert AccountPaused();
        if (block.timestamp >= executorExpiry) revert ExecutorExpired();
        _;
    }

    constructor(address _owner, address _executor, uint64 _executorExpiry, uint256 _oneShare) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        oneShare = _oneShare == 0 ? 1e6 : _oneShare;
        executor = _executor;
        executorExpiry = _executorExpiry;
        emit ExecutorSet(_executor, _executorExpiry);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Executor actions — the only two, and both fully gated
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Place a binary order owned by this account.
    /// @dev The order, the position it creates, and everything it eventually settles into
    ///      belong to this account, and only the owner can move any of it out.
    function placeOrder(
        bytes32 marketId,
        uint32 seriesId,
        address pool,
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        uint64 userData
    ) external onlyActiveExecutor returns (uint128 orderId) {
        // Two ways in, and the owner authorised both. Either they named this exact pool, or
        // they approved the series and the venue's own registry confirms this market is that
        // series' current window. `marketId` and `seriesId` are the executor's claim about
        // which market it is trading; every part of that claim is checked against the venue.
        if (!allowedPool[pool]) _requireSeriesAuthorised(marketId, seriesId, pool);

        uint256 collateral = collateralFor(price, quantity);
        if (collateral > maxOrderCollateral) revert OrderTooLarge(collateral, maxOrderCollateral);

        uint256 newCommitted = collateralCommitted + collateral;
        if (newCommitted > totalCollateralCap) {
            revert BudgetExhausted(collateralCommitted, collateral, totalCollateralCap);
        }
        // Written before the external call: this contract makes no assumption about the
        // pool's behaviour, and a budget updated after a callback is a budget that can be
        // re-entered around.
        collateralCommitted = newCommitted;

        bool success;
        (success, orderId) = IBinaryPool(pool).placeBinaryOrder(
            kind,
            price,
            quantity,
            expireTimestampNs,
            orderType,
            selfMatchingOption,
            address(0), // builder: none
            0, // builderFeeBpsTimes1k
            userData
        );
        if (!success) revert PlacementFailed();

        emit OrderPlaced(pool, kind, price, quantity, collateral, orderId);
    }

    /// @notice Cancel an order this account placed. Freed collateral returns here.
    /// @dev Deliberately a WEAKER check than `placeOrder`, and the asymmetry is the point.
    ///      Placing requires the market to be the approved series' current, open window.
    ///      Cancelling must keep working after that window has rolled — otherwise a resting
    ///      order would become uncancellable by the executor at the exact moment it is most
    ///      worth pulling, and the follower's collateral would sit locked until they
    ///      intervened by hand. So cancel asks only the cheaper question: did this venue mint
    ///      this pool? Cancelling frees collateral back into this account and can move nothing
    ///      out of it, so there is no attack a looser check opens up.
    function cancelOrder(address pool, uint128 orderId) external onlyActiveExecutor {
        if (!allowedPool[pool]) {
            if (venueModule == address(0) || venueCreator == address(0)) revert VenueNotConfigured();
            if (IBinaryMarketsModule(venueModule).poolCreator(pool) != venueCreator) {
                revert PoolNotFromVenue(pool);
            }
        }
        IBinaryPool(pool).cancelOrder(orderId);
        emit OrderCancelled(pool, orderId);
    }

    /**
     * @notice Approve the collateral a venue-vouched market's pool will pull, so the first
     *         order into a newly rolled window does not need the follower to sign anything.
     *
     * @dev Gated by `executorMayApprove`, and by the same series check `placeOrder` uses — so
     *      an approval can only ever reach the pool of a market the owner already authorised
     *      trading in. Both the token and the spender come out of the venue's own record
     *      rather than from the caller: the executor supplies a market id, and the venue
     *      decides what that market's collateral and pool actually are.
     *
     *      The amount is the owner's own lifetime budget. A pool cannot be given permission to
     *      pull more than the follower had already agreed to put at risk in total.
     */
    function approveMarketCollateral(bytes32 marketId, uint32 seriesId)
        external
        onlyActiveExecutor
        returns (address token, address pool)
    {
        if (!executorMayApprove) revert ExecutorMayNotApprove();

        MarketRecord memory m = _vouchedMarket(marketId, seriesId);

        token = m.collateral;
        pool = m.pool;
        IERC20Minimal(token).approve(pool, totalCollateralCap);
        emit VenuePoolApproved(pool, token, totalCollateralCap);
    }

    /// @notice Revert exactly as `placeOrder` would, without placing anything.
    /// @dev The engine calls this before spending gas on an order it cannot place, and records
    ///      the named error as the reason. A boolean would have told it "no" without telling a
    ///      follower which of six conditions failed, and every silent failure in this project
    ///      has cost hours.
    function previewAuthorisation(bytes32 marketId, uint32 seriesId, address pool) external view {
        if (!allowedPool[pool]) _requireSeriesAuthorised(marketId, seriesId, pool);
    }

    /**
     * @dev The series check, in the order that fails cheapest first.
     *
     *      What it establishes, in one sentence: this pool is the trading venue of a market
     *      that the venue's own registry recorded, on the venue the owner named, minted by the
     *      creator the owner pinned, currently open, and holding the oracle question that the
     *      owner-approved series points at right now.
     *
     *      The last clause is what survives the hourly rollover. `referenceQidBySeries` moves
     *      on its own when the venue rolls the series, so an approval granted once keeps
     *      matching the new market — without ever widening to a market the owner did not mean.
     *      An attacker cannot forge it: they would have to make the venue's own factory point
     *      its series at their market.
     */
    function _requireSeriesAuthorised(bytes32 marketId, uint32 seriesId, address pool) internal view {
        MarketRecord memory m = _vouchedMarket(marketId, seriesId);

        // An unknown marketId decodes to an all-zero record, so this is also the check that
        // rejects a market the venue has never heard of: its pool is address(0) and cannot
        // match a real one.
        if (m.pool != pool) revert PoolNotInMarket(pool, m.pool);
    }

    /// @dev Everything `_requireSeriesAuthorised` establishes about the MARKET, returning the
    ///      venue's record of it. Split out because a caller that derives the pool FROM this
    ///      record has nothing to compare it against — checking `m.pool == m.pool` would be a
    ///      check against itself, and writing it that way would read like a real one.
    function _vouchedMarket(bytes32 marketId, uint32 seriesId) internal view returns (MarketRecord memory m) {
        if (!allowedSeries[seriesId]) revert SeriesNotAllowed(seriesId);
        if (venueModule == address(0) || venueCreator == address(0)) revert VenueNotConfigured();

        m = IBinaryMarketsModule(venueModule).markets(marketId);

        if (m.originVenueId != venueId) revert MarketNotFromVenue(m.originVenueId, venueId);
        if (m.creator != venueCreator) revert MarketNotFromCreator(m.creator, venueCreator);

        // Trading into a window that has already expired is not a hypothetical: a seed bot on
        // this venue quoted into a two-hours-dead market 314 times before anyone noticed. The
        // venue records the window, so the account can simply refuse.
        if (block.timestamp < m.tradingStart || block.timestamp >= m.expiry) {
            revert MarketNotOpen(m.tradingStart, m.expiry);
        }

        uint256 seriesQid = IMarketCreator(venueCreator).referenceQidBySeries(seriesId);
        if (seriesQid == 0 || m.oracleQuestionId != seriesQid) {
            revert MarketNotInSeries(seriesId, m.oracleQuestionId, seriesQid);
        }

        // And the cadence, which the question id alone does NOT establish.
        //
        // Measured on this venue: the hourly, 15-minute and 5-minute BTC markets that all
        // settle at 12:00 carry the SAME oracle question id, because a question is keyed by
        // asset and settlement instant and every cadence landing on that instant binds to it.
        // So a check that stopped at the question would have let an approval for "BTC hourly"
        // authorise the 5-minute market too — the same asset, but a cadence the follower never
        // chose, and it would have looked correct while doing it.
        //
        // The window's own length is unambiguous: expiry minus tradingStart is exactly the
        // series interval, on every market observed. Subtraction is safe here because the
        // window check above has already established expiry > tradingStart.
        (, , , uint64 intervalSec, ) = IMarketCreator(venueCreator).seriesById(seriesId);
        uint64 windowSeconds = m.expiry - m.tradingStart;
        if (intervalSec == 0 || windowSeconds != intervalSec) {
            revert MarketCadenceMismatch(seriesId, windowSeconds, intervalSec);
        }
    }

    /// @notice Quote-token collateral a BUY of `quantity` at `price` commits.
    /// @dev Both are raw units on this venue: price is quote-per-whole-share, quantity is
    ///      raw shares, so the product needs dividing by one whole share.
    function collateralFor(uint256 price, uint256 quantity) public view returns (uint256) {
        return (price * quantity) / oneShare;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Owner actions — unconditional, every one of them
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Stop or resume executor activity. Takes effect on the executor's next call.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    /// @notice Replace the executor and/or extend its expiry.
    function setExecutor(address _executor, uint64 _expiry) external onlyOwner {
        executor = _executor;
        executorExpiry = _expiry;
        emit ExecutorSet(_executor, _expiry);
    }

    /// @notice Permanently end the current executor's authority.
    /// @dev Clears the expiry too, so re-authorising is an explicit, dated decision rather
    ///      than something a stale timestamp could resurrect.
    function revokeExecutor() external onlyOwner {
        address former = executor;
        executor = address(0);
        executorExpiry = 0;
        emit ExecutorRevoked(former);
    }

    function setAllowedPool(address pool, bool allowed) external onlyOwner {
        allowedPool[pool] = allowed;
        emit PoolAllowed(pool, allowed);
    }

    /// @notice Name the venue this account will believe about what a market is.
    /// @dev Setting the module to zero turns the automatic path off completely, leaving only
    ///      pools the owner named by hand. That is the off switch, and it is the owner's.
    function setVenue(address module, address creator, bytes32 _venueId) external onlyOwner {
        venueModule = module;
        venueCreator = creator;
        venueId = _venueId;
        emit VenueSet(module, creator, _venueId);
    }

    /// @notice Let the executor grant this account's collateral allowance to a venue pool.
    /// @dev OFF by default, and the one permission in this contract that lets the executor
    ///      cause tokens to move. It exists because an ERC-20 allowance is per-spender and a
    ///      pool address is per-window: without it, approving a series once would still leave
    ///      the follower signing an `approveToken` every hour, and the hourly problem would be
    ///      moved rather than solved.
    ///
    ///      What it grants, exactly: the executor may approve the collateral token named by a
    ///      venue-vouched market record, to that record's own pool, up to `totalCollateralCap`.
    ///      It cannot choose the token, cannot choose the amount, cannot name a spender that is
    ///      not the pool of a market in a series the owner approved, and still cannot transfer
    ///      anything itself. A follower who would rather approve pools by hand leaves this off
    ///      and nothing else changes.
    function setExecutorMayApprove(bool allowed) external onlyOwner {
        executorMayApprove = allowed;
        emit ExecutorApprovalPermissionSet(allowed);
    }

    /// @notice Approve or withdraw one rolling series — an asset at a cadence.
    /// @dev The single signature that replaces re-approving a pool every hour, and the single
    ///      switch that stops it. Withdrawing a series takes effect on the executor's very next
    ///      order; nothing is grandfathered.
    function setAllowedSeries(uint32 seriesId, bool allowed) external onlyOwner {
        allowedSeries[seriesId] = allowed;
        emit SeriesAllowed(seriesId, allowed);
    }

    function setCaps(uint256 _maxOrderCollateral, uint256 _totalCollateralCap) external onlyOwner {
        maxOrderCollateral = _maxOrderCollateral;
        totalCollateralCap = _totalCollateralCap;
        emit CapsSet(_maxOrderCollateral, _totalCollateralCap);
    }

    /// @notice Reset the spent-budget counter, e.g. after a round of positions has settled.
    function resetCommitted() external onlyOwner {
        emit CommittedReset(collateralCommitted);
        collateralCommitted = 0;
    }

    /// @notice Let a pool pull collateral from this account. Required before trading.
    function approveToken(address token, address spender, uint256 amount) external onlyOwner {
        IERC20Minimal(token).approve(spender, amount);
    }

    /// @notice Move ERC-20 tokens out. Owner only — this is the custody guarantee.
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20Minimal(token).transfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    /// @notice Move the native token out. Owner only.
    function withdrawNative(address to, uint256 amount) external onlyOwner {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert CallFailed("");
        emit Withdrawn(address(0), to, amount);
    }

    /**
     * @notice Arbitrary call, owner only.
     * @dev The owner's escape hatch, and a deliberate design choice. Settling an Event
     *      Contracts position touches contracts and calling conventions that will change
     *      (redemption moved between the module and a settlement singleton during this build
     *      alone), and ERC-6909 outcome tokens need their own operator approval. Enumerating
     *      all of that here would either bloat this contract or leave a follower's funds
     *      stranded the first time the venue changed shape.
     *
     *      It grants the owner nothing they do not already have — they can withdraw every
     *      token unconditionally, so an arbitrary call adds no authority. It is emphatically
     *      NOT available to the executor: that would collapse the entire security model into
     *      a single function.
     */
    function ownerCall(address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        returns (bytes memory)
    {
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) revert CallFailed(ret);
        return ret;
    }

    /// @notice Whether the executor could act right now, and why not if it couldn't.
    /// @dev A read the frontend and the engine both use — the engine to skip an account that
    ///      would revert instead of burning gas discovering it, the UI to tell a follower the
    ///      truth about their own account's state.
    function executorStatus()
        external
        view
        returns (bool active, bool isPaused, bool expired, uint64 expiry, uint256 budgetLeft)
    {
        isPaused = paused;
        expired = block.timestamp >= executorExpiry;
        expiry = executorExpiry;
        budgetLeft = totalCollateralCap > collateralCommitted ? totalCollateralCap - collateralCommitted : 0;
        active = executor != address(0) && !isPaused && !expired && budgetLeft > 0;
    }

    receive() external payable {}
}
