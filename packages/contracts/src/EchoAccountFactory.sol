// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {EchoAccount} from "./EchoAccount.sol";

/**
 * @title EchoAccountFactory
 * @notice Deploys one `EchoAccount` per follower, at an address knowable in advance.
 *
 * @dev CREATE2 with the owner in the salt, for two concrete reasons:
 *
 *      1. The frontend can show a follower their account address, and let them inspect the
 *         code that will live there, BEFORE they pay to deploy it. "Send funds to this
 *         address once you've deployed it" is a much worse instruction than "this will be
 *         your account".
 *      2. A double-tap — an impatient second click, a retried transaction after an RPC
 *         timeout, which has already happened twice on this chain during this build — cannot
 *         produce a second account. The address is a pure function of the owner, so the
 *         second attempt reverts on collision instead of silently splitting their funds
 *         across two accounts they don't know about.
 *
 *      The factory holds no funds, has no owner, and has no privileges over anything it
 *      deploys. It is a deployer, not a controller: nothing here can reach a deployed
 *      account's state.
 */
contract EchoAccountFactory {
    /// @notice One whole outcome share in raw units, baked in at factory deploy time so every
    ///         account from this factory sizes its collateral checks identically.
    uint256 public immutable oneShare;

    event AccountDeployed(address indexed owner, address indexed account);

    error AlreadyDeployed(address account);

    constructor(uint256 _oneShare) {
        oneShare = _oneShare == 0 ? 1e6 : _oneShare;
    }

    /**
     * @notice Deploy the caller's account.
     * @dev Deliberately no parameters at all.
     *
     *      No `owner`: the caller is always the owner. A factory that let one address deploy
     *      an account owned by another is a phishing surface for no benefit — the follower is
     *      signing this transaction regardless.
     *
     *      No `executor` or `expiry` either, and that one is subtler. CREATE2 hashes the
     *      constructor arguments along with the bytecode, so if those were parameters the
     *      predicted address would depend on them — and a frontend that predicted an address
     *      with one set of arguments and deployed with another would show the follower an
     *      address their funds never arrive at. Every account is therefore constructed with no
     *      executor, which makes `accountFor(owner)` exact, and the follower authorises the
     *      executor in the same configuration transaction that sets their caps and expiry.
     *      That is a step they were taking anyway, and it means an account can never exist in
     *      a state where something can trade before its limits are set.
     */
    function deploy() external returns (address account) {
        address predicted = accountFor(msg.sender);
        if (predicted.code.length != 0) revert AlreadyDeployed(predicted);

        account = address(new EchoAccount{salt: _salt(msg.sender)}(msg.sender, address(0), 0, oneShare));
        emit AccountDeployed(msg.sender, account);
    }

    /**
     * @notice The address `owner`'s account has, or will have.
     * @dev Exact, and a pure function of the owner — safe to show a follower before they have
     *      paid for anything, and safe to rely on after.
     */
    function accountFor(address owner) public view returns (address) {
        bytes memory creation = abi.encodePacked(
            type(EchoAccount).creationCode,
            abi.encode(owner, address(0), uint64(0), oneShare)
        );
        return _create2Address(_salt(owner), keccak256(creation));
    }

    function _salt(address owner) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("EchoAccount:v1:", owner));
    }

    function _create2Address(bytes32 salt, bytes32 initCodeHash) private view returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash))))
        );
    }
}
