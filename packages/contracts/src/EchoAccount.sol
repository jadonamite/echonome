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

    /// @notice Pools the executor may trade on.
    /// @dev A coarse filter, and honestly so. Event Contract pool addresses are a TIME-VARYING
    ///      binding: the same pool is re-bound to a new market when the cadence window rolls,
    ///      which we observed directly. Allowlisting a pool therefore does NOT scope the
    ///      executor to one market — it includes that pool's future windows. The caps and the
    ///      expiry carry the real security weight.
    mapping(address => bool) public allowedPool;

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
        address pool,
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        uint64 userData
    ) external onlyActiveExecutor returns (uint128 orderId) {
        if (!allowedPool[pool]) revert PoolNotAllowed(pool);

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
    function cancelOrder(address pool, uint128 orderId) external onlyActiveExecutor {
        if (!allowedPool[pool]) revert PoolNotAllowed(pool);
        IBinaryPool(pool).cancelOrder(orderId);
        emit OrderCancelled(pool, orderId);
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
