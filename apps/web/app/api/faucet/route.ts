import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseEther,
  formatEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

const SHANNON_RPC =
  process.env.NEXT_PUBLIC_SHANNON_RPC_URL ?? "https://api.infra.testnet.somnia.network";

export const maxDuration = 60;

const DEFAULT_OPERATOR_KEY =
  "0x19e0bede9097618b1e4c1d893121bcf0f56538d30b221ec3e86966b34797a0f2" as const;

/**
 * Faucet endpoint for Somnia Shannon testnet.
 * Dispenses 5 STT to a requested address so the user can deploy their EchoAccount
 * and execute testnet transactions without needing an external faucet step.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const targetAddress = body?.address;

    if (!targetAddress || !isAddress(targetAddress)) {
      return NextResponse.json(
        { ok: false, error: "A valid Ethereum address is required." },
        { status: 400 }
      );
    }

    const operatorKey = (process.env.OPERATOR_PRIVATE_KEY ||
      DEFAULT_OPERATOR_KEY) as `0x${string}`;

    const publicClient = createPublicClient({
      chain: somniaShannon,
      transport: http(SHANNON_RPC),
    });

    const account = privateKeyToAccount(operatorKey);
    const walletClient = createWalletClient({
      account,
      chain: somniaShannon,
      transport: http(SHANNON_RPC),
    });

    // Check operator balance
    const operatorBalance = await publicClient.getBalance({ address: account.address });
    if (operatorBalance < parseEther("5")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faucet reserve is temporarily depleted. Please use the official Somnia faucet.",
        },
        { status: 503 }
      );
    }

    // Check user balance — if user already has more than 15 STT, avoid draining the faucet
    const userBalance = await publicClient.getBalance({ address: targetAddress as Address });
    if (userBalance >= parseEther("15")) {
      return NextResponse.json({
        ok: true,
        alreadyFunded: true,
        balance: formatEther(userBalance),
        message: `Wallet already has ${formatEther(userBalance)} STT — sufficient for deployment and gas.`,
      });
    }

    // Dispense 5 STT
    const hash = await walletClient.sendTransaction({
      to: targetAddress as Address,
      value: parseEther("5"),
    });

    try {
      await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 });
    } catch {
      // Transaction broadcast succeeded, receipt wait timed out
    }

    const newBalance = await publicClient.getBalance({ address: targetAddress as Address }).catch(() => 0n);

    return NextResponse.json({
      ok: true,
      hash,
      dispensed: "5.0 STT",
      balance: formatEther(newBalance),
      message: "Successfully funded with 5.0 STT gas.",
    });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Faucet disbursement failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
