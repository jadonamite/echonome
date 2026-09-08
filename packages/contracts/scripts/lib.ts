import { createPublicClient, createWalletClient, http, type Abi, type Address } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export interface Artifact {
  contractName: string;
  abi: Abi;
  bytecode: `0x${string}`;
}

export function artifact(name: string): Artifact {
  return JSON.parse(readFileSync(join(here, "..", "out", `${name}.json`), "utf8"));
}

export const publicClient = createPublicClient({ chain: somniaShannon, transport: http() });

export function wallet(privateKey: string) {
  const account = privateKeyToAccount(privateKey.trim() as `0x${string}`);
  return {
    account,
    client: createWalletClient({ account, chain: somniaShannon, transport: http() }),
  };
}

/**
 * Somnia's RPC confirms slowly and sometimes times out on a transaction that still lands —
 * documented in FEEDBACK.md after a faucet call did exactly that. So the receipt wait is
 * generous, and on timeout we re-check rather than assuming failure and retrying blindly,
 * which is how a retry turns one action into two.
 */
export async function send(hash: `0x${string}`, label: string): Promise<boolean> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") console.log(`  ! ${label}: reverted (${hash})`);
    return receipt.status === "success";
  } catch {
    const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) return receipt.status === "success";
    console.log(`  ! ${label}: no receipt after 180s (${hash}) — may still land`);
    return false;
  }
}

/** Gas ceiling for every write here. Learned the hard way: a per-pool operator grant reverted
 *  at 400k with gasUsed 394,769 — an out-of-gas that reads exactly like a logic revert unless
 *  you compare gasUsed against the limit. */
export const GAS = 5_000_000n;

export interface Result {
  name: string;
  passed: boolean;
  detail: string;
}

/** Asserts a call reverts, and reports WHICH error — "it reverted" is a much weaker claim
 *  than "it reverted with NotOwner", and only the second one proves the guard you meant. */
export async function mustRevert(name: string, expected: string, fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return { name, passed: false, detail: "NO REVERT — the call succeeded when it must not have" };
  } catch (err) {
    const e = err as { cause?: any; shortMessage?: string };
    const errorName: string =
      e?.cause?.data?.errorName ?? e?.cause?.cause?.data?.errorName ?? e?.shortMessage ?? "reverted";
    const matched = errorName.includes(expected);
    return {
      name,
      passed: matched,
      detail: matched ? errorName : `reverted with ${errorName}, expected ${expected}`,
    };
  }
}

export async function mustSucceed(name: string, fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return { name, passed: true, detail: "" };
  } catch (err) {
    const e = err as { cause?: any; shortMessage?: string };
    return {
      name,
      passed: false,
      detail: `reverted: ${e?.cause?.data?.errorName ?? e?.shortMessage ?? String(err).slice(0, 120)}`,
    };
  }
}

export function report(rows: Result[]): number {
  console.log("");
  let failed = 0;
  for (const r of rows) {
    if (!r.passed) failed++;
    console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
  }
  console.log(`\n${rows.length - failed}/${rows.length} passed`);
  return failed;
}

export type { Address };
