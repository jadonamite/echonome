/**
 * Wallet and chain errors, in language a person can act on.
 *
 * Raw wallet errors are written for developers and it shows. A user who declines a signature
 * gets back `User rejected the request. Details: MetaMask Tx Signature: User denied transaction
 * signature. Version: viem@2.x` — four sentences, three of them about software. Worse, a
 * decline is not a fault at all: the user did the thing they meant to do, and telling them
 * something went wrong is simply untrue.
 *
 * So the common cases are named, and anything unrecognised keeps its own first line rather
 * than being flattened into "Something went wrong" — an unhelpful message you can search for
 * beats a polite one you cannot.
 */

export interface WalletErrorCopy {
  title: string;
  detail?: string;
}

/** EIP-1193 codes, plus the ones wallets add on top. */
function codeOf(err: unknown): number | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const raw = e?.code ?? e?.cause?.code;
  return typeof raw === "number" ? raw : undefined;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}

/** Wallet messages are paragraphs. Only the first line is ever worth showing. */
function firstLine(message: string): string {
  const line = message.split(/\n|\. Details:|\bVersion:/)[0]?.trim() ?? "";
  return line.replace(/\.$/, "");
}

export function describeWalletError(err: unknown): WalletErrorCopy {
  const code = codeOf(err);
  const message = messageOf(err);
  const lower = message.toLowerCase();

  // 4001 — the user declined or closed the popup. Not a fatal failure.
  if (code === 4001 || lower.includes("user rejected") || lower.includes("user denied")) {
    return {
      title: "Request cancelled",
      detail:
        "The request was cancelled or dismissed in your wallet. Open your wallet extension to approve connecting or switching to Somnia Shannon.",
    };
  }

  // -32002 — a prompt is already open, usually behind the browser window.
  if (code === -32002 || lower.includes("already pending")) {
    return {
      title: "Your wallet is already asking",
      detail: "There is a pending request in your wallet. Open it and respond there first.",
    };
  }

  // 4902 / unrecognised chain — the network has not been added yet.
  if (code === 4902 || lower.includes("unrecognized chain") || lower.includes("unrecognised chain")) {
    return {
      title: "Somnia Shannon isn't in your wallet yet",
      detail:
        "Add the network as chain 50312, then try again. Your wallet may offer to add it for you.",
    };
  }

  if (lower.includes("no injected") || lower.includes("connector not found") || lower.includes("provider")) {
    return {
      title: "No browser wallet found",
      detail: "Install a wallet extension such as MetaMask, then reload this page.",
    };
  }

  if (lower.includes("chain mismatch") || lower.includes("wrong network")) {
    return {
      title: "Wrong network",
      detail: "Switch your wallet to Somnia Shannon testnet and try again.",
    };
  }

  if (lower.includes("insufficient funds")) {
    return {
      title: "Not enough to cover gas",
      detail: "This wallet needs some STT on Somnia Shannon to pay for the transaction.",
    };
  }

  const line = firstLine(message);
  return {
    title: "Your wallet couldn't complete that",
    detail: line || undefined,
  };
}
