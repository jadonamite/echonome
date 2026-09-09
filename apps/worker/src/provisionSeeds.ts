/**
 * Creates and funds a wallet for each extra seed strategy.
 *
 *   npm run seeds:provision
 *
 * Idempotent: keys are written once to `.seed-wallets.json` (gitignored, testnet only) and
 * reused. Each wallet gets native gas from the operator and mints its own test collateral.
 */
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createReadOnlyExchange, isTradeableTargetMarket } from "./chain/client.js";
import { queryOne, end } from "./db/client.js";

export const EXTRA_STRATEGIES = ["ec-coinflip", "ec-longshot", "ec-favourite"] as const;
const WALLET_FILE = new URL("../.seed-wallets.json", import.meta.url).pathname;
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

export function seedWallets(): Record<string, `0x${string}`> {
  if (process.env.EXTRA_SEED_WALLETS) {
    try {
      return JSON.parse(process.env.EXTRA_SEED_WALLETS);
    } catch (err) {
      console.error("[provisionSeeds] failed to parse EXTRA_SEED_WALLETS:", err);
    }
  }
  if (!existsSync(WALLET_FILE)) return {};
  return JSON.parse(readFileSync(WALLET_FILE, "utf8"));
}

async function main() {
  const pub = createPublicClient({ chain: somniaShannon, transport: http() });
  const operator = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as `0x${string}`);
  const operatorWallet = createWalletClient({ account: operator, chain: somniaShannon, transport: http() });

  const wallets = seedWallets();
  for (const name of EXTRA_STRATEGIES) {
    if (!wallets[name]) wallets[name] = generatePrivateKey();
  }
  writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2), { mode: 0o600 });

  const exchange = createReadOnlyExchange();
  await exchange.loadMarkets(true);
  const market = (Object.values(exchange.markets) as any[]).find(
    (m) => m.type === "binary" && isTradeableTargetMarket(m.info)
  );
  const collateral = (market?.info.collateral ?? "0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e") as Address;

  for (const name of EXTRA_STRATEGIES) {
    const key = wallets[name];
    const account = privateKeyToAccount(key);
    console.log(`\n${name}  ${account.address}`);

    const gas = await pub.getBalance({ address: account.address });
    if (gas < 2n * 10n ** 18n) {
      const hash = await operatorWallet.sendTransaction({ to: account.address, value: 5n * 10n ** 18n });
      await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
      console.log(`  funded with gas`);
    }

    let usdc = (await pub.readContract({ address: collateral, abi: erc20, functionName: "balanceOf", args: [account.address] })) as bigint;
    if (usdc < 100_000_000n) {
      const ex = new SomniaMarkets({
        indexerUrl: process.env.SHANNON_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql",
        chain: somniaShannon,
        wsRpcUrl: process.env.SHANNON_WS_URL ?? "wss://api.infra.testnet.somnia.network/ws",
        addresses: SOMNIA_TESTNET_ADDRESSES,
        privateKey: key,
      });
      await ex.trader.faucet().catch((e: unknown) => console.log(`  faucet: ${String(e).slice(0, 70)}`));
      usdc = (await pub.readContract({ address: collateral, abi: erc20, functionName: "balanceOf", args: [account.address] })) as bigint;
    }
    console.log(`  collateral: ${formatUnits(usdc, 6)} tUSDC`);

    // Registering the wallet is what makes the fill watcher track it — a trader the watcher
    // doesn't know about trades into the void as far as the leaderboard is concerned.
    await queryOne(
      `INSERT INTO trader (address, label, is_seed) VALUES ($1, $2, true)
       ON CONFLICT (address) DO NOTHING`,
      [account.address, `${name} (seed)`]
    );
    console.log(`  registered as a tracked trader`);
  }

  console.log(`\n${EXTRA_STRATEGIES.length} strategies provisioned. Restart the seed runner to start them.`);
  await end();
  process.exit(0);
}

// Run the provisioner ONLY when this file is the process entry point.
//
// `runSeedTraders.ts` imports EXTRA_STRATEGIES and seedWallets from here. Without this guard
// that import executed main(), which provisions and then calls process.exit(0) — so starting
// the seed runner silently killed the seed runner. It looked like a crash-free shutdown: the
// bots logged "strategy ready", ticked once, and vanished. The whole fleet was dead for nine
// hours and the only trace was a heartbeat that stopped advancing.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
