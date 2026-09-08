/**
 * Compiles the contracts with solc-js and writes ABI + bytecode to `out/`.
 *
 * No Foundry on purpose: this repo is already npm/TypeScript end to end, and adding a second
 * toolchain (plus a `curl | bash` install) to compile two files is a poor trade. solc is a
 * normal npm dependency, pinned to an exact version so a build is reproducible.
 */
import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");
const outDir = join(here, "..", "out");

const sources: Record<string, { content: string }> = {};
for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".sol"))) {
  sources[file] = { content: readFileSync(join(srcDir, file), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    // Optimised, because the factory embeds the account's full creation code and an
    // unoptimised build risks the 24 KB deployed-code limit for no benefit.
    optimizer: { enabled: true, runs: 200 },
    // Shannon follows mainnet EVM semantics; pinning the target keeps a future solc default
    // from silently emitting opcodes this chain does not have.
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), {
  import: (path: string) => {
    const local = path.replace(/^\.\//, "");
    if (sources[local]) return { contents: sources[local].content };
    return { error: `not found: ${path}` };
  },
}));

const errors = (output.errors ?? []).filter((e: any) => e.severity === "error");
const warnings = (output.errors ?? []).filter((e: any) => e.severity === "warning");
for (const w of warnings) console.log(`warning: ${w.formattedMessage.trim()}`);
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
let count = 0;
for (const [file, contracts] of Object.entries(output.contracts as Record<string, any>)) {
  for (const [name, c] of Object.entries(contracts as Record<string, any>)) {
    writeFileSync(
      join(outDir, `${name}.json`),
      JSON.stringify(
        {
          contractName: name,
          sourceFile: file,
          abi: c.abi,
          bytecode: `0x${c.evm.bytecode.object}`,
          deployedBytecodeSize: c.evm.deployedBytecode.object.length / 2,
        },
        null,
        2
      )
    );
    console.log(`${name}: ${c.evm.deployedBytecode.object.length / 2} bytes deployed`);
    count++;
  }
}
console.log(`compiled ${count} contract(s) -> out/`);
