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

/**
 * Faucet endpoint for Somnia Shannon testnet.
 * Dispenses 1 STT to a requested address so the user can deploy their EchoAccount
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

    const operatorKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
    if (!operatorKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Operator faucet key is not configured. Please use the official Somnia testnet faucet.",
        },
        { status: 503 }
      );
    }

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
    if (operatorBalance < parseEther("1")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faucet reserve is temporarily depleted. Please use the official Somnia faucet.",
        },
        { status: 503 }
      );
    }

    // Check user balance — if user already has more than 5 STT, avoid draining the faucet
    const userBalance = await publicClient.getBalance({ address: targetAddress as Address });
    if (userBalance >= parseEther("5")) {
      return NextResponse.json({
        ok: true,
        alreadyFunded: true,
        balance: formatEther(userBalance),
        message: `Wallet already has ${formatEther(userBalance)} STT — sufficient for deployment and gas.`,
      });
    }

    // Dispense 1 STT
    const hash = await walletClient.sendTransaction({
      to: targetAddress as Address,
      value: parseEther("1"),
    });

    await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });

    const newBalance = await publicClient.getBalance({ address: targetAddress as Address });

    return NextResponse.json({
      ok: true,
      hash,
      dispensed: "1.0 STT",
      balance: formatEther(newBalance),
      message: "Successfully funded with 1.0 STT gas.",
    });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Faucet disbursement failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
