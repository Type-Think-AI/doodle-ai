#!/usr/bin/env node

/**
 * Mirrors `.dev.vars` into the **local** Secrets Store so `astro dev` (and any
 * `wrangler dev` run without `--remote`) can resolve the same secrets the
 * deployed Workers get from the account-level store.
 *
 * Why this is needed at all:
 *
 * `wrangler.json` binds six secrets via `secrets_store_secrets`. In local mode
 * Miniflare honours those bindings by creating its own *empty* store under
 * `.wrangler/state/v3/secrets-store/`. Because a binding and a `.dev.vars`
 * entry cannot coexist under one name, the empty binding **shadows** the
 * `.dev.vars` value — so `env.BETTER_AUTH_SECRET` becomes a binding whose
 * `get()` yields nothing, and createAuth() throws "BETTER_AUTH_SECRET is not
 * set" even though `.dev.vars` has it. Seeding the local store fixes that
 * without touching the remote one.
 *
 * `pnpm dev` (which runs `wrangler dev --remote --env staging`) is unaffected:
 * remote mode reads the real account store. This script only matters for
 * `pnpm dev:local`.
 *
 * Values never leave the machine: `.dev.vars` is gitignored and the local
 * store lives in `.wrangler/state/`, which is gitignored too. The remote store
 * is never contacted — every wrangler call here deliberately omits `--remote`.
 *
 * Zero new dependencies: node:fs + node:child_process, matching scripts/dev.mjs.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEV_VARS = join(root, ".dev.vars");

/**
 * Read the store id and the binding -> secret_name mapping straight from
 * wrangler.json, so this can never drift from the actual bindings.
 *
 * The distinction matters: `astro dev` loads the **top-level** (prod) config,
 * where the binding `BETTER_AUTH_SECRET` points at the store secret
 * `BETTER_AUTH_SECRET_PROD`. The local store must therefore hold
 * `BETTER_AUTH_SECRET_PROD` — seeding the *binding* name instead produces
 * `Secret "BETTER_AUTH_SECRET_PROD" not found`. For the other five the two
 * names coincide, which is exactly why that mistake hides until it bites on
 * the one secret that differs.
 *
 * Values are looked up in `.dev.vars` by **binding** name (what the code reads,
 * and what .dev.vars.example documents) and written under **secret_name**.
 */
function readBindings() {
  const config = JSON.parse(readFileSync(join(root, "wrangler.json"), "utf8"));
  const bindings = config.secrets_store_secrets;
  if (!Array.isArray(bindings) || bindings.length === 0) {
    throw new Error("No secrets_store_secrets found in wrangler.json — nothing to seed.");
  }
  const storeId = bindings[0].store_id;
  return {
    storeId,
    // [{ binding, secretName }]
    entries: bindings.map((b) => ({ binding: b.binding, secretName: b.secret_name })),
  };
}

/**
 * Minimal `.dev.vars` parser. The format is dotenv-like: `KEY=value`, `#`
 * comments, blank lines. Values are taken verbatim after the first `=` so
 * base64 secrets containing `=` survive intact; surrounding quotes are
 * stripped if present.
 */
function parseDevVars(text) {
  const out = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function wrangler(args, { input } = {}) {
  return execFileSync("wrangler", args, {
    cwd: root,
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    // Matches the rest of this project's wrangler usage — the local proxy
    // presents a cert Node rejects by default.
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  });
}

/**
 * Map of secret name -> secret id for secrets already in the LOCAL store, so
 * re-runs update in place instead of failing on a duplicate name. `update`
 * identifies a secret by `--secret-id`, not `--name`, so the id has to come
 * from here.
 *
 * The list output is an ASCII table delimited by `│`; the first two cells of a
 * data row are Name and ID.
 */
/**
 * Strip ANSI colour codes without putting a literal control character in a
 * regex (which `no-control-regex` rightly objects to). Built from the escape
 * character's code point instead.
 */
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function existingLocalSecrets(storeId, wantedNames) {
  const found = new Map();
  let output;
  try {
    output = wrangler(["secrets-store", "secret", "list", storeId]);
  } catch {
    // An empty local store exits non-zero ("List request returned no secrets").
    return found;
  }

  for (const line of output.split("\n")) {
    if (!line.includes("│")) continue;
    const cells = line
      .split("│")
      .map((cell) => cell.replace(ANSI_PATTERN, "").trim())
      .filter((cell) => cell.length > 0);
    if (cells.length < 2) continue;
    const [name, id] = cells;
    // Skip the header row and anything that isn't a 32-char hex id.
    if (name === "Name" || !/^[0-9a-f]{32}$/.test(id)) continue;
    if (wantedNames.has(name)) found.set(name, id);
  }

  return found;
}

function main() {
  if (!existsSync(DEV_VARS)) {
    console.error(
      "No .dev.vars found. Copy .dev.vars.example to .dev.vars and fill it in first.",
    );
    process.exit(1);
  }

  const { storeId, entries } = readBindings();
  const vars = parseDevVars(readFileSync(DEV_VARS, "utf8"));
  const present = existingLocalSecrets(storeId, new Set(entries.map((e) => e.secretName)));

  console.log(`Seeding local Secrets Store ${storeId} from .dev.vars\n`);

  let seeded = 0;
  const missing = [];

  for (const { binding, secretName } of entries) {
    // Value is keyed by binding name in .dev.vars; stored under secret_name.
    const value = vars[binding];
    const label = binding === secretName ? binding : `${binding} -> ${secretName}`;

    if (!value) {
      missing.push(binding);
      console.log(`  skip   ${label} — ${binding} not in .dev.vars`);
      continue;
    }

    // `create` on an existing name fails, so an already-seeded secret is
    // updated in place by id instead. Both are local-only (no --remote).
    const existingId = present.get(secretName);
    const args = existingId
      ? ["secrets-store", "secret", "update", storeId, "--secret-id", existingId]
      : [
          "secrets-store",
          "secret",
          "create",
          storeId,
          "--name",
          secretName,
          "--scopes",
          "workers",
        ];

    try {
      wrangler(args, { input: `${value}\n` });
      console.log(`  ${existingId ? "update" : "create"} ${label}`);
      seeded++;
    } catch (error) {
      console.log(`  FAIL   ${label} — ${error.message.split("\n")[0]}`);
    }
  }

  console.log(`\n${seeded}/${entries.length} seeded into the local store.`);

  if (missing.length) {
    console.log(
      `\nMissing from .dev.vars: ${missing.join(", ")}\n` +
        `Local requests needing these will fail the same way the deployed Worker would.`,
    );
  }

  console.log("\nThe remote store was not touched. Run `pnpm dev:local` now.");
}

main();
