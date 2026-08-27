#!/usr/bin/env node
/**
 * Read-only: what would a deploy migrate?
 *
 *   node scripts/db-pending.mjs staging
 *   node scripts/db-pending.mjs production
 *
 * `wrangler d1 migrations list` answers this, but only per environment and with
 * the database name spelled out — which is exactly the argument that is easy to
 * get wrong, and getting it wrong here means reading production's state while
 * believing you are reading staging's. This resolves the name from wrangler.json
 * for the environment you name, the same way scripts/deploy.mjs does.
 *
 * Applies nothing. Safe to run against production.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? "production";

if (!["production", "staging"].includes(target)) {
  console.error(`Unknown target "${target}". Use: production | staging`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(resolve(ROOT, "wrangler.json"), "utf8"));
const scope = target === "production" ? config : config.env?.[target];
const database = scope?.d1_databases?.find((d) => d.binding === "DB")?.database_name;

if (!database) {
  console.error(`wrangler.json defines no D1 binding "DB" for "${target}"`);
  process.exit(1);
}

/* Remote D1 commands cannot pick an account non-interactively when the
   credential can see more than one, and wrangler.json's top-level `account_id`
   does not satisfy them. Same reasoning as scripts/deploy.mjs. */
if (!process.env.CLOUDFLARE_ACCOUNT_ID && config.account_id) {
  process.env.CLOUDFLARE_ACCOUNT_ID = config.account_id;
}

console.log(`\n${target} → ${database}\n`);

execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "migrations",
    "list",
    database,
    "--remote",
    ...(target === "production" ? [] : ["--env", target]),
  ],
  { cwd: ROOT, stdio: "inherit", env: process.env },
);
