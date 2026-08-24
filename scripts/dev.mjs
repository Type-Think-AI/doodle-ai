#!/usr/bin/env node

/**
 * Orchestrates `pnpm dev`: migrate the shared staging D1 schema, build the
 * Worker, start `wrangler dev --remote --env staging`, then rebuild on every
 * source change so Wrangler's own file-watcher (which watches the built
 * output, not source) picks it up and reloads automatically.
 *
 * This exists because `astro build` has no built-in `--watch` flag and this
 * project deliberately doesn't use `astro dev`'s local-emulated D1/KV for
 * day-to-day work (see astro.config.mjs and docs/architecture.md) — the
 * whole team develops against one shared Cloudflare-hosted staging database
 * instead. Zero new dependencies: just `node:child_process` + `node:fs`.
 */

import { spawn } from "node:child_process";
import { existsSync, renameSync, rmSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(root, "dist");
const DIST_TMP = join(root, "dist.tmp");
const DIST_OLD = join(root, "dist.old");

/** Paths whose changes should trigger a rebuild. Source only — never `dist`. */
const WATCH_PATHS = ["src", "public", "astro.config.mjs", "package.json", "tsconfig.json"];
/** Batches rapid-fire saves (an editor writing several files at once) into one rebuild. */
const DEBOUNCE_MS = 250;

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", ...options });
    child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}`))));
    child.on("error", reject);
  });
}

let building = false;
let rebuildQueued = false;

/**
 * `wrangler dev` watches `dist/_worker.js/index.js` and its chunks, and
 * reloads the instant any of those files change. Rebuilding straight into
 * `dist` races that watcher: esbuild's chunk filenames are content-hashed,
 * so a build in progress deletes and rewrites files under names that change
 * between runs — if wrangler reloads mid-write it resolves an import against
 * a chunk that either isn't there yet or was already replaced, and dies with
 * a "Could not resolve" error (a build-restart storm followed until the
 * process choked on this, in an earlier version of this script).
 *
 * Fixed the standard way: build into a throwaway directory, then swap it
 * into place with two `rename`s. A same-filesystem rename is a single inode
 * operation — wrangler's watcher can only ever see "old dist" or "new dist",
 * never a directory mid-write. `dist` is never briefly missing either, since
 * the old one is renamed out of the way only once the new one is ready to
 * rename in.
 */
async function build() {
  if (building) {
    rebuildQueued = true;
    return;
  }
  building = true;
  console.log("\n🔨 Rebuilding…");
  try {
    rmSync(DIST_TMP, { recursive: true, force: true });
    await run("pnpm", ["exec", "astro", "build", "--outDir", DIST_TMP]);
    if (existsSync(DIST)) renameSync(DIST, DIST_OLD);
    renameSync(DIST_TMP, DIST);
    rmSync(DIST_OLD, { recursive: true, force: true });
    console.log("✅ Build complete — wrangler dev will pick it up automatically.\n");
  } catch (err) {
    console.error("✘ Build failed:", err.message);
  } finally {
    building = false;
    if (rebuildQueued) {
      rebuildQueued = false;
      await build();
    }
  }
}

let debounceTimer = null;
function scheduleRebuild(changedPath) {
  console.log(`  changed: ${changedPath}`);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(build, DEBOUNCE_MS);
}

async function main() {
  console.log("▶ Migrating shared staging D1 schema…");
  await run("pnpm", ["run", "db:migrate:staging"]);

  await build();

  console.log("▶ Starting wrangler dev --remote --env staging …");
  const wrangler = spawn("pnpm", ["exec", "wrangler", "dev", "--remote", "--env", "staging"], {
    cwd: root,
    stdio: "inherit",
  });

  const watchers = WATCH_PATHS.filter((p) => existsSync(join(root, p))).map((p) => {
    const target = join(root, p);
    // `recursive: true` is supported on macOS and Windows; Linux support
    // landed in recent Node but isn't guaranteed on every distro — this
    // project's dev machines are macOS, so that's not a concern here.
    return watch(target, { recursive: true }, (_event, filename) => {
      if (!filename) return scheduleRebuild(p);
      scheduleRebuild(join(p, filename));
    });
  });

  const shutdown = () => {
    console.log("\n▶ Shutting down…");
    for (const w of watchers) w.close();
    wrangler.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  wrangler.on("exit", (code) => {
    for (const w of watchers) w.close();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
