#!/usr/bin/env node
/**
 * Bundle scripts/verify-growth.ts for Node (extensionless TS imports) and run it.
 * Same pattern as the comment in scripts/verify-packs.ts.
 */
import { createRequire } from "node:module";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const pnpmRoot = fileURLToPath(new URL("../node_modules/.pnpm/", import.meta.url));
const entries = await readdir(pnpmRoot);
const esbuildDir = entries.find((name) => name.startsWith("esbuild@"));
if (!esbuildDir) throw new Error("esbuild is not installed (expected under node_modules/.pnpm).");
const { build } = require(join(pnpmRoot, esbuildDir, "node_modules/esbuild"));

const outfile = join(await mkdtemp(join(tmpdir(), "doodleai-growth-")), "verify-growth.mjs");

try {
  await build({
    entryPoints: [new URL("./verify-growth.ts", import.meta.url).pathname],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(join(outfile, ".."), { recursive: true, force: true });
}
