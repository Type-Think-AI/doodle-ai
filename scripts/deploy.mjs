#!/usr/bin/env node
/**
 * One deploy path for both environments: migrate, then deploy, then verify.
 *
 *   node scripts/deploy.mjs staging
 *   node scripts/deploy.mjs production
 *   node scripts/deploy.mjs            # infers from the branch in CI
 *
 * WHY THIS EXISTS
 * The package scripts already chained a migration before `wrangler deploy`, but
 * only for a deploy run by hand. Cloudflare Workers Builds deploys on every push
 * using its OWN configured command, which was a bare `wrangler deploy` — so a
 * git-triggered release shipped code against an unmigrated database and failed at
 * runtime, on a table the new code expected and the database did not have.
 * Pointing both paths at this one script is what closes that gap.
 *
 * ORDER: migrate, then deploy. Migrations in this project are additive by
 * convention (see the header of migrations/0012 and 0015), so old code tolerates
 * the new schema but new code does not tolerate the old one. Migrating first
 * means the window between the two steps is safe in the only direction it can
 * fail. A migration that is NOT additive — a rename, a drop, a NOT NULL on an
 * existing column — cannot be shipped this way and needs an expand/contract pair
 * across two deploys.
 *
 * FAIL FAST: a failed migration must abort before `wrangler deploy` runs.
 * Deploying anyway is the exact outage this script exists to prevent.
 *
 * Wrangler itself supplies two guarantees this relies on, both documented in
 * `wrangler d1 migrations apply --help`: in a non-interactive shell the
 * confirmation prompt is skipped (so no --yes flag is needed, and none exists),
 * and a failed migration is rolled back with the previous one left applied.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Branch -> environment. Anything not listed is refused rather than guessed:
 * inferring "probably production" from an unknown branch is how a feature branch
 * ends up migrating the live database.
 */
const BRANCH_ENVIRONMENTS = { main: "production", dev: "staging" };

/**
 * The database each environment is ALLOWED to touch.
 *
 * Deliberately duplicated from wrangler.json rather than only read from it. The
 * script resolves the real database name from the config and then asserts it
 * against this list, so a typo or a bad merge that points staging's binding at
 * the production database is caught here instead of discovered afterwards. The
 * config says what we are about to do; this says what we are permitted to do.
 */
const ALLOWED_DATABASE = { production: "doodleai", staging: "doodleai-staging" };

/** Where to smoke-test after the deploy lands. */
const HEALTH_ORIGIN = {
  production: "https://doodleai.art",
  staging: "https://dev.doodleai.art",
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function step(message) {
  console.log(`\n▸ ${message}`);
}

/** Inherit stdio so wrangler's own progress output is the user's feedback. */
function run(command, commandArgs) {
  console.log(`  $ ${command} ${commandArgs.join(" ")}`);
  if (flags.has("--dry-run")) {
    console.log("    (dry run — not executed)");
    return;
  }
  execFileSync(command, commandArgs, { cwd: ROOT, stdio: "inherit", env: process.env });
}

/** Read-only commands still run under --dry-run: seeing them is the point. */
function runReadOnly(command, commandArgs) {
  console.log(`  $ ${command} ${commandArgs.join(" ")}`);
  execFileSync(command, commandArgs, { cwd: ROOT, stdio: "inherit", env: process.env });
}

function resolveTarget() {
  const explicit = positional[0];
  if (explicit) {
    if (!ALLOWED_DATABASE[explicit]) {
      fail(`Unknown target "${explicit}". Use: ${Object.keys(ALLOWED_DATABASE).join(" | ")}`);
    }
    return { target: explicit, source: "argument" };
  }

  // Workers Builds and most CI runners expose the branch under one of these.
  const branch =
    process.env.WORKERS_CI_BRANCH ||
    process.env.CF_PAGES_BRANCH ||
    process.env.GITHUB_REF_NAME ||
    process.env.BRANCH;

  if (!branch) {
    fail(
      "No target given and no branch found in the environment.\n" +
        "  Pass one explicitly: node scripts/deploy.mjs staging",
    );
  }
  const target = BRANCH_ENVIRONMENTS[branch];
  if (!target) {
    fail(
      `Branch "${branch}" is not mapped to an environment, so nothing was deployed.\n` +
        `  Mapped branches: ${Object.entries(BRANCH_ENVIRONMENTS)
          .map(([b, e]) => `${b} -> ${e}`)
          .join(", ")}`,
    );
  }
  return { target, source: `branch "${branch}"` };
}

/** Read the database this environment's config actually points at. */
function readConfig() {
  return JSON.parse(readFileSync(resolve(ROOT, "wrangler.json"), "utf8"));
}

function databaseFromConfig(config, target) {
  const scope = target === "production" ? config : config.env?.[target];
  if (!scope) fail(`wrangler.json has no configuration for "${target}"`);

  const entry = scope.d1_databases?.find((d) => d.binding === "DB");
  if (!entry?.database_name) {
    fail(`wrangler.json defines no D1 binding "DB" for "${target}"`);
  }
  return entry.database_name;
}

/**
 * Pin the Cloudflare account for every child wrangler call.
 *
 * Without this, `wrangler d1 migrations apply --remote` fails outright on any
 * machine whose credential can see more than one account:
 *
 *   More than one account available but unable to select one in non-interactive mode.
 *
 * wrangler.json's top-level `account_id` does NOT satisfy the D1 remote commands
 * (verified against wrangler 4.88 — both the production and staging paths fail
 * with it present), and there is no prompt to answer in CI or in a script. The
 * account id therefore has to reach wrangler through the environment.
 *
 * The safety value is larger than the convenience: an ambiguous account is one
 * keystroke away from migrating a database in the wrong account. Deriving it from
 * the committed config makes the target deterministic instead of dependent on
 * whatever `wrangler login` last selected. An id already present in the
 * environment wins, so CI can override.
 */
function pinAccount(config) {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.log(` account   ${process.env.CLOUDFLARE_ACCOUNT_ID} (from environment)`);
    return;
  }
  if (!config.account_id) {
    fail(
      "No account id: wrangler.json has no `account_id` and CLOUDFLARE_ACCOUNT_ID is unset.\n" +
        "  Remote D1 commands cannot choose an account non-interactively without one.",
    );
  }
  process.env.CLOUDFLARE_ACCOUNT_ID = config.account_id;
  console.log(` account   ${config.account_id} (from wrangler.json)`);
}

async function smokeTest(target) {
  const origin = HEALTH_ORIGIN[target];
  if (!origin) return;
  if (flags.has("--dry-run")) {
    console.log(`\n▸ Would verify ${origin}/api/status  (dry run — skipped)`);
    return;
  }

  step(`Verifying ${origin}/api/status`);
  // Give the new version a moment to become the one being served.
  await new Promise((r) => setTimeout(r, 4000));

  let response;
  try {
    response = await fetch(`${origin}/api/status`, {
      headers: { accept: "application/json", "user-agent": "doodleai-deploy/1.0" },
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    fail(`Deployed, but ${origin}/api/status is unreachable: ${error.message}`);
  }

  // 503 is a valid, fully-formed answer from this endpoint: it means a component
  // is down, not that the deploy failed. Anything else non-2xx means the Worker
  // itself is not serving correctly, which IS a failed deploy.
  if (!response.ok && response.status !== 503) {
    fail(`Deployed, but /api/status returned HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  if (!payload?.summary?.state) {
    fail("Deployed, but /api/status did not return a recognisable payload");
  }

  const unhealthy = (payload.components ?? []).filter(
    (c) => c.state === "down" || c.state === "degraded",
  );
  console.log(`  summary: ${payload.summary.state} — ${payload.summary.headline}`);
  if (unhealthy.length > 0) {
    // Reported loudly but NOT treated as a deploy failure: the code shipped fine,
    // and a dependency being unwell is not something re-running a deploy fixes.
    // Exiting non-zero here would also make an unrelated third-party blip look
    // like a broken release.
    console.warn(
      `  ⚠ ${unhealthy.length} component(s) not fully healthy: ` +
        unhealthy.map((c) => `${c.id}=${c.state}`).join(", "),
    );
  }
}

async function main() {
  const { target, source } = resolveTarget();
  const config = readConfig();
  const database = databaseFromConfig(config, target);
  const expected = ALLOWED_DATABASE[target];

  if (database !== expected) {
    fail(
      `Refusing to run: "${target}" resolves to database "${database}", but is only ` +
        `permitted to touch "${expected}".\n` +
        "  Either wrangler.json's D1 binding is wrong, or ALLOWED_DATABASE in this " +
        "script needs updating — check which before proceeding.",
    );
  }

  /**
   * Explicit environment flag for every wrangler call.
   *
   * Production passes `--env=""`, not nothing. wrangler.json defines a named
   * `staging` environment, so a bare command warns:
   *
   *   ▲ Multiple environments are defined in the Wrangler configuration file,
   *     but no target environment was specified for the deploy command.
   *
   * The empty string is wrangler's own documented way to say "the top-level
   * environment, deliberately". Worth doing rather than muting: this is the
   * exact ambiguity that lets a command land on the wrong environment, and it is
   * the same class of mistake the ALLOWED_DATABASE check above guards against.
   */
  const envFlag = target === "production" ? ['--env='] : ["--env", target];

  console.log("──────────────────────────────────────────────");
  console.log(` target    ${target}   (from ${source})`);
  console.log(` database  ${database}`);
  pinAccount(config);
  console.log(` order     migrate → deploy → verify`);
  console.log("──────────────────────────────────────────────");

  // Show what is about to be applied before applying it. On a target that is
  // several migrations behind, that list is the difference between a routine
  // deploy and one that also ships someone else's half-finished schema change.
  step(`Pending migrations on ${database}`);
  runReadOnly("npx", ["wrangler", "d1", "migrations", "list", database, "--remote", ...envFlag]);

  if (!flags.has("--skip-build")) {
    // src-worker/entry.ts imports dist/_worker.js, so a deploy without a build
    // either ships the previous build or fails to resolve the import.
    step("Building");
    run("npx", ["astro", "build"]);
  } else {
    console.log("\n▸ Skipping build (--skip-build)");
  }

  step(`Applying migrations to ${database}`);
  run("npx", ["wrangler", "d1", "migrations", "apply", database, "--remote", ...envFlag]);

  step(`Deploying to ${target}`);
  run("npx", ["wrangler", "deploy", ...envFlag]);

  await smokeTest(target);

  if (flags.has("--dry-run")) {
    console.log(`\n✓ Dry run complete — nothing was migrated or deployed\n`);
  } else {
    console.log(`\n✓ ${target} deployed and verified\n`);
  }
}
await main();
