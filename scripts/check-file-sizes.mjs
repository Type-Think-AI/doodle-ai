#!/usr/bin/env node
/**
 * File-size policy check — zero new dependencies (backlog D18).
 *
 * Enforces the reviewability thresholds documented in
 * docs/file-size-policy-audit.md so the policy stops drifting:
 *
 *   Astro page ............ 150 LOC   (src/pages/**\/*.astro)
 *   Astro component ....... 300 LOC   (every other .astro, plus .tsx islands)
 *   Controller ............ 300 LOC   (src/scripts/**, src/pages/**\/*.ts routes)
 *   Library module ........ 250 LOC   (src/lib, src/db, src/mastra, src/boards, …)
 *   CSS ................... 400 LOC   (**\/*.css)
 *
 * RATCHET, NOT A CLIFF. The repo already violates the policy in ~30 places, so a
 * bare check would fail `pnpm check` on day one and get disabled. Instead the
 * current debt is frozen in scripts/file-size-baseline.json and this script only
 * fails on:
 *
 *   • NEW   — a file that violates its limit and is not in the baseline
 *   • GREW  — a baselined file that grew past its recorded line count
 *
 * A baselined file that stays the same size or shrinks passes. When a file gets
 * smaller (or drops under its limit) the baseline is reported as stale and can be
 * tightened with --update-baseline, which is how the debt ratchets down.
 *
 * Run:
 *   node scripts/check-file-sizes.mjs                  # human report, ratcheted
 *   node scripts/check-file-sizes.mjs --json           # machine report
 *   node scripts/check-file-sizes.mjs --strict         # ignore baseline, show all debt
 *   node scripts/check-file-sizes.mjs --max-violations=30
 *   node scripts/check-file-sizes.mjs --update-baseline
 *
 * Exit codes: 0 = pass, 1 = policy failure, 2 = bad usage.
 *
 * Counts raw lines (same number `wc -l` reports, plus a final unterminated line).
 * No blank/comment stripping: the threshold is about how much there is to read.
 *
 * Does NOT start a server, read env vars, touch src/, or modify anything except
 * the baseline file when explicitly asked to.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const BASELINE_REL = "scripts/file-size-baseline.json";
const BASELINE_PATH = join(ROOT, BASELINE_REL);

/** Thresholds from docs/file-size-policy-audit.md. */
const LIMITS = {
  page: 150,
  component: 300,
  controller: 300,
  lib: 250,
  css: 400,
};

const CATEGORY_ORDER = ["page", "component", "controller", "lib", "css"];

const LABELS = {
  page: "Astro pages",
  component: "Astro components & islands",
  controller: "Controllers & route handlers",
  lib: "Library modules",
  css: "Stylesheets",
};

/** Only application source is in scope; marketing/, tools/, scripts/ are not. */
const SCAN_ROOTS = ["src", "src-worker"];

/** Never walked into. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist.tmp",
  ".astro",
  ".wrangler",
  ".git",
  "coverage",
]);

/**
 * Documented exemptions (docs/file-size-policy-audit.md → "Exclusions").
 * Generated or vendored artifacts that must not be hand-refactored. Paths are
 * repo-relative and posix-style. Both currently live outside SCAN_ROOTS; they are
 * listed anyway so the exemption is explicit rather than incidental.
 */
const EXEMPT_FILES = new Set(["worker-configuration.d.ts", ".design-import/support.js"]);

/** `.d.ts` is ambient/generated declaration surface, not reviewable source. */
const EXEMPT_SUFFIXES = [".d.ts"];

// ─────────────────────────────────────────────────────────────────────────────
// Arguments
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `Usage: node scripts/check-file-sizes.mjs [options]

  --json                 emit a machine-readable report on stdout
  --update-baseline      rewrite ${BASELINE_REL} from the current tree
  --strict               ignore the baseline; fail on any violation
  --max-violations=N     also fail if the total violation count exceeds N
  -h, --help             show this help

Exit codes: 0 pass, 1 policy failure, 2 bad usage.`;

const flags = {
  json: false,
  updateBaseline: false,
  strict: false,
  maxViolations: null,
};

for (const arg of process.argv.slice(2)) {
  if (arg === "--json") flags.json = true;
  else if (arg === "--update-baseline") flags.updateBaseline = true;
  else if (arg === "--strict" || arg === "--no-baseline") flags.strict = true;
  else if (arg === "--help" || arg === "-h") {
    console.log(USAGE);
    process.exit(0);
  } else if (arg.startsWith("--max-violations=")) {
    const value = Number(arg.slice("--max-violations=".length));
    if (!Number.isInteger(value) || value < 0) {
      console.error(`Invalid --max-violations value: ${arg}\n\n${USAGE}`);
      process.exit(2);
    }
    flags.maxViolations = value;
  } else {
    console.error(`Unknown argument: ${arg}\n\n${USAGE}`);
    process.exit(2);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Category for a repo-relative posix path, or null when the file is out of
 * scope. First match wins, so the ordering here IS the policy.
 */
function classify(path) {
  if (EXEMPT_FILES.has(path)) return null;
  if (EXEMPT_SUFFIXES.some((suffix) => path.endsWith(suffix))) return null;

  if (path.endsWith(".css")) return "css";

  // Only routes count as pages. src/admin/pages/* are components rendered by a
  // route, which is how the original audit classified them.
  if (path.endsWith(".astro")) return path.startsWith("src/pages/") ? "page" : "component";

  // React islands are components with a different file extension.
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) return "component";

  if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(path)) {
    // Browser entry points and request handlers: wiring, not reusable modules.
    if (path.startsWith("src/scripts/")) return "controller";
    if (path.startsWith("src/pages/")) return "controller";
    // Everything else under src/ and src-worker/: lib, db, mastra, boards,
    // roadmap, types, worker entry.
    return "lib";
  }

  // Markdown content, SKILL.md, JSON fixtures, images: no policy.
  return null;
}

function countLines(absolutePath) {
  const text = readFileSync(absolutePath, "utf8");
  if (text.length === 0) return 0;
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++;
  }
  if (!text.endsWith("\n")) lines++;
  return lines;
}

function collect() {
  const files = [];
  let scanned = 0;

  const walk = (relDir) => {
    const entries = readdirSync(join(ROOT, relDir), { withFileTypes: true });
    for (const entry of entries) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        walk(rel);
        continue;
      }
      if (!entry.isFile()) continue;
      const category = classify(rel);
      if (!category) continue;
      scanned++;
      const lines = countLines(join(ROOT, rel));
      if (lines > LIMITS[category]) {
        files.push({ file: rel, category, limit: LIMITS[category], lines, over: lines - LIMITS[category] });
      }
    }
  };

  for (const root of SCAN_ROOTS) {
    if (existsSync(join(ROOT, root))) walk(root);
  }

  // Worst first, then largest, then stable by path.
  files.sort((a, b) => b.over - a.over || b.lines - a.lines || a.file.localeCompare(b.file));
  return { violations: files, scanned };
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline
// ─────────────────────────────────────────────────────────────────────────────

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return { exists: false, files: {}, policy: null, generatedAt: null };
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    return {
      exists: true,
      files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
      policy: parsed.policy ?? null,
      generatedAt: parsed.generatedAt ?? null,
    };
  } catch (error) {
    console.error(`Could not parse ${BASELINE_REL}: ${error.message}`);
    console.error("Fix the file or regenerate it with --update-baseline.");
    process.exit(2);
  }
}

function writeBaseline(violations) {
  const files = {};
  for (const entry of [...violations].sort((a, b) => a.file.localeCompare(b.file))) {
    files[entry.file] = { category: entry.category, lines: entry.lines };
  }
  const payload = {
    note:
      "Frozen file-size debt for scripts/check-file-sizes.mjs. Each entry is an " +
      "ALLOWANCE, not a target: the check fails on new violations and on any " +
      "listed file that grows past the recorded line count. Shrink a file and " +
      "re-run with --update-baseline to ratchet the allowance down. Never add an " +
      "entry by hand to silence a new violation — split the file instead.",
    generatedAt: new Date().toISOString(),
    policy: LIMITS,
    files,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluation
// ─────────────────────────────────────────────────────────────────────────────

const { violations, scanned } = collect();
const baseline = loadBaseline();

if (flags.updateBaseline) {
  const previous = baseline.files;
  const written = writeBaseline(violations);
  const nowKeys = Object.keys(written.files);
  const added = nowKeys.filter((key) => !previous[key]);
  const removed = Object.keys(previous).filter((key) => !written.files[key]);
  const tightened = nowKeys.filter((key) => previous[key] && written.files[key].lines < previous[key].lines);
  const loosened = nowKeys.filter((key) => previous[key] && written.files[key].lines > previous[key].lines);

  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "update-baseline",
          baseline: { path: BASELINE_REL, entries: nowKeys.length },
          added,
          removed,
          tightened,
          loosened,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\nWrote ${BASELINE_REL} — ${nowKeys.length} allowance(s) from ${scanned} scanned file(s).`);
    if (!baseline.exists) {
      console.log("  (no previous baseline — this is the initial freeze)");
    } else {
      console.log(`  added:     ${added.length}${added.length ? ` → ${added.join(", ")}` : ""}`);
      console.log(`  cleared:   ${removed.length}${removed.length ? ` → ${removed.join(", ")}` : ""}`);
      console.log(`  tightened: ${tightened.length}${tightened.length ? ` → ${tightened.join(", ")}` : ""}`);
      if (loosened.length) {
        console.log(`  LOOSENED:  ${loosened.length} → ${loosened.join(", ")}`);
        console.log("  ^ allowance increased. Only acceptable if the growth was reviewed.");
      }
    }
    console.log("");
  }
  process.exit(0);
}

const useBaseline = !flags.strict && baseline.exists;

for (const entry of violations) {
  const recorded = useBaseline ? baseline.files[entry.file] : undefined;
  entry.baselineLines = recorded ? recorded.lines : null;
  if (!recorded) entry.status = useBaseline ? "new" : "unbaselined";
  else if (entry.lines > recorded.lines) entry.status = "grown";
  else entry.status = "known";
}

const failing = violations.filter((entry) => entry.status === "new" || entry.status === "grown" || entry.status === "unbaselined");
const totalOverage = violations.reduce((sum, entry) => sum + entry.over, 0);

/** Baselined files that improved — the allowance can be tightened. */
const stale = [];
if (useBaseline) {
  const current = new Map(violations.map((entry) => [entry.file, entry]));
  for (const [file, recorded] of Object.entries(baseline.files)) {
    const now = current.get(file);
    if (!existsSync(join(ROOT, file))) {
      stale.push({ file, baselineLines: recorded.lines, lines: null, reason: "deleted" });
    } else if (!now) {
      stale.push({ file, baselineLines: recorded.lines, lines: countLines(join(ROOT, file)), reason: "now within limit" });
    } else if (now.lines < recorded.lines) {
      stale.push({ file, baselineLines: recorded.lines, lines: now.lines, reason: "shrank" });
    }
  }
  stale.sort((a, b) => a.file.localeCompare(b.file));
}

const overCap = flags.maxViolations !== null && violations.length > flags.maxViolations;
const ok = failing.length === 0 && !overCap;

const byCategory = {};
for (const category of CATEGORY_ORDER) {
  const inCategory = violations.filter((entry) => entry.category === category);
  byCategory[category] = {
    limit: LIMITS[category],
    violations: inCategory.length,
    failing: inCategory.filter((entry) => entry.status !== "known").length,
    overage: inCategory.reduce((sum, entry) => sum + entry.over, 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

if (flags.json) {
  console.log(
    JSON.stringify(
      {
        ok,
        mode: useBaseline ? "baseline" : "strict",
        policy: LIMITS,
        scannedFiles: scanned,
        scanRoots: SCAN_ROOTS,
        baseline: {
          path: BASELINE_REL,
          exists: baseline.exists,
          used: useBaseline,
          entries: Object.keys(baseline.files).length,
          generatedAt: baseline.generatedAt,
          stale,
        },
        maxViolations: flags.maxViolations,
        totals: {
          violations: violations.length,
          known: violations.filter((entry) => entry.status === "known").length,
          new: violations.filter((entry) => entry.status === "new" || entry.status === "unbaselined").length,
          grown: violations.filter((entry) => entry.status === "grown").length,
          overage: totalOverage,
        },
        byCategory,
        violations,
      },
      null,
      2,
    ),
  );
  process.exit(ok ? 0 : 1);
}

const STATUS_MARK = { new: "✗", unbaselined: "✗", grown: "✗", known: "·" };
const STATUS_TEXT = {
  new: "NEW — not in baseline",
  unbaselined: "OVER LIMIT",
  grown: (entry) => `GREW +${entry.lines - entry.baselineLines} over baseline ${entry.baselineLines}`,
  known: (entry) => `known (baseline ${entry.baselineLines})`,
};

const policyLine = CATEGORY_ORDER.map((category) => `${category} ${LIMITS[category]}`).join(" · ");
console.log(`\n━━━ File-size policy ━━━`);
console.log(`  limits: ${policyLine}`);
console.log(`  scanned ${scanned} file(s) under ${SCAN_ROOTS.map((r) => `${r}/`).join(", ")}`);
console.log(
  useBaseline
    ? `  baseline: ${BASELINE_REL} (${Object.keys(baseline.files).length} allowance(s))`
    : baseline.exists
      ? `  baseline: IGNORED (--strict)`
      : `  baseline: none yet — every violation counts as new`,
);
if (useBaseline && baseline.policy && JSON.stringify(baseline.policy) !== JSON.stringify(LIMITS)) {
  console.log(`  ⚠ baseline was captured under different limits; re-run --update-baseline after a policy change`);
}

const pad = Math.min(64, Math.max(0, ...violations.map((entry) => entry.file.length)));

for (const category of CATEGORY_ORDER) {
  const inCategory = violations.filter((entry) => entry.category === category);
  if (inCategory.length === 0) continue;
  console.log(`\n━━━ ${LABELS[category]} — limit ${LIMITS[category]} LOC (${inCategory.length} over) ━━━`);
  for (const entry of inCategory) {
    const status = STATUS_TEXT[entry.status];
    const note = typeof status === "function" ? status(entry) : status;
    console.log(
      `  ${STATUS_MARK[entry.status]} ${String(entry.lines).padStart(5)} ${`+${entry.over}`.padStart(6)}  ${entry.file.padEnd(pad)}  ${note}`,
    );
  }
}

if (stale.length > 0) {
  console.log(`\n━━━ Ratchet available — ${stale.length} baseline allowance(s) now too loose ━━━`);
  for (const entry of stale) {
    const now = entry.lines === null ? "gone" : `${entry.lines} LOC`;
    console.log(`  ↓ ${entry.file.padEnd(pad)}  baseline ${entry.baselineLines} → ${now} (${entry.reason})`);
  }
  console.log(`  Lock these in: node scripts/check-file-sizes.mjs --update-baseline`);
}

const known = violations.filter((entry) => entry.status === "known").length;
const grown = violations.filter((entry) => entry.status === "grown").length;
const fresh = violations.filter((entry) => entry.status === "new" || entry.status === "unbaselined").length;

console.log(`\n${"═".repeat(72)}`);
console.log(
  `  VIOLATIONS: ${violations.length} total — ${known} within baseline, ${fresh} new, ${grown} grown`,
);
console.log(
  `  BY CATEGORY: ${CATEGORY_ORDER.map((category) => `${category} ${byCategory[category].violations}`).join(" · ")}`,
);
console.log(`  TOTAL OVERAGE: ${totalOverage.toLocaleString("en-US")} LOC above the limits`);
if (flags.maxViolations !== null) {
  console.log(`  CAP: ${violations.length}/${flags.maxViolations} allowed by --max-violations`);
}

if (ok) {
  console.log(`  RESULT: PASS — no new or grown violations`);
} else {
  console.log(`  RESULT: FAIL`);
  if (failing.length > 0) {
    console.log("");
    // Capped: with a baseline in place this is normally 1–3 files. Without one
    // (first run, or --strict) it would otherwise reprint the whole report.
    const MAX_LISTED = 15;
    for (const entry of failing.slice(0, MAX_LISTED)) {
      const status = STATUS_TEXT[entry.status];
      const note = typeof status === "function" ? status(entry) : status;
      console.log(`    • ${entry.file} — ${entry.lines} LOC vs ${entry.limit} limit (${note})`);
    }
    if (failing.length > MAX_LISTED) {
      console.log(`    … and ${failing.length - MAX_LISTED} more (see the grouped report above)`);
    }
    console.log("");
    console.log(`  Fix by splitting the file. If the size is genuinely justified,`);
    console.log(`  say so in review and re-run with --update-baseline.`);
  }
  if (overCap) {
    console.log(`    • total violations ${violations.length} exceeds --max-violations=${flags.maxViolations}`);
  }
}
console.log(`${"═".repeat(72)}\n`);

process.exit(ok ? 0 : 1);
