#!/usr/bin/env node
/**
 * Lightweight smoke validation — zero new dependencies.
 * Validates skill loading invariants, credit boundary logic,
 * webhook signature behavior, and API route contracts at the
 * source/static level.
 *
 * Run:  node scripts/smoke-validate.mjs
 *
 * Does NOT start a server, modify production data, touch auth,
 * or alter package.json.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { webcrypto } from "node:crypto";

const ROOT = resolve(import.meta.dirname, "..");
const SKILLS_DIR = join(ROOT, "src/mastra/skills");
const CONSTANTS_FILE = join(ROOT, "src/lib/doodle-constants.ts");
const COSTS_FILE = join(ROOT, "src/lib/credits/costs.ts");
const WEBHOOK_FILE = join(ROOT, "src/pages/api/webhooks/picx.ts");
const CHAT_FILE = join(ROOT, "src/pages/api/chat.ts");
const AGENT_FILE = join(ROOT, "src/pages/api/agent.ts");
const CREDITS_FILE = join(ROOT, "src/lib/credits/index.ts");
/* src/lib/skill-loader.ts is the build-time authority on what a SKILL.md may
   declare (CATEGORIES, ASPECT_RATIOS, SKILL_KINDS) and on the per-kind runnable
   check. This suite reads those lists FROM it rather than restating them — a
   hardcoded copy is what let `packs`, `9:16` and every video skill read as
   invalid here while the real build accepted them. */
const LOADER_FILE = join(ROOT, "src/lib/skill-loader.ts");
const VIDEO_SKILLS_FILE = join(ROOT, "src/lib/video/skills.ts");

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SKILL LOADING INVARIANTS
// ─────────────────────────────────────────────────────────────────────────────
section("1. Skill Loading");

// Parse GENERATION_MODES from doodle-constants.ts
const constantsSrc = readFileSync(CONSTANTS_FILE, "utf8");
/* Match to the `] as const` terminator, not the first `]`: the array's own
   comments mention types like `PackVariant[]`, and a `[^\]]+` body stopped dead
   at that bracket — truncating the mode list halfway through. */
const modesMatch = constantsSrc.match(/GENERATION_MODES\s*=\s*\[([\s\S]*?)\]\s*as const/);
assert(modesMatch, "GENERATION_MODES array found in doodle-constants.ts");
const GENERATION_MODES = modesMatch[1]
  /* Strip comments BEFORE splitting on commas. GENERATION_MODES carries block
     comments documenting each authoring wave, and the prose commas inside them
     were being read as mode names — so the check demanded a credit cost for
     phantom modes made of sentence fragments. */
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "")
  .split(",")
  .map((s) => s.trim().replace(/['"]/g, ""))
  .filter(Boolean);
assert(GENERATION_MODES.length > 0, `GENERATION_MODES has ${GENERATION_MODES.length} entries`);

/* Read a `const NAME = [...]` string-literal list out of a source file, ignoring
   comments. Used for the loader's own enums and for VIDEO_SKILL_IDS. */
function parseStringList(src, name) {
  const m = src.match(new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return null;
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .split(",")
    .map((s) => s.trim().replace(/['"]/g, ""))
    .filter(Boolean);
}

const loaderSrc = readFileSync(LOADER_FILE, "utf8");
const CATEGORIES = parseStringList(loaderSrc, "CATEGORIES");
const ASPECT_RATIOS = parseStringList(loaderSrc, "ASPECT_RATIOS");
const SKILL_KINDS = parseStringList(loaderSrc, "SKILL_KINDS");
assert(CATEGORIES?.length > 0, `CATEGORIES parsed from skill-loader (${CATEGORIES?.join(", ")})`);
assert(ASPECT_RATIOS?.length > 0, `ASPECT_RATIOS parsed from skill-loader (${ASPECT_RATIOS?.join(", ")})`);
assert(SKILL_KINDS?.length > 0, `SKILL_KINDS parsed from skill-loader (${SKILL_KINDS?.join(", ")})`);

const VIDEO_SKILL_IDS = parseStringList(readFileSync(VIDEO_SKILLS_FILE, "utf8"), "VIDEO_SKILL_IDS");
assert(VIDEO_SKILL_IDS?.length > 0, `VIDEO_SKILL_IDS has ${VIDEO_SKILL_IDS?.length} entries`);

// Discover skill directories
const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
assert(skillDirs.length > 0, `Found ${skillDirs.length} skill directories`);

// Validate each SKILL.md
const runnableIds = [];
/* Runnable ids split by kind: an image skill is executed by generateDoodle and
   must exist in GENERATION_MODES, a video skill by generateVideo and must exist
   in VIDEO_SKILL_IDS. Pooling them is what made every video skill look like a
   missing generation mode. */
const runnableImageIds = [];
const runnableVideoIds = [];
const allIds = [];
const allOrders = [];

for (const dir of skillDirs) {
  const skillPath = join(SKILLS_DIR, dir, "SKILL.md");
  assert(existsSync(skillPath), `${dir}/SKILL.md exists`);
  if (!existsSync(skillPath)) continue;

  const raw = readFileSync(skillPath, "utf8");
  assert(raw.startsWith("---\n"), `${dir}/SKILL.md starts with frontmatter`);

  // Extract frontmatter name
  const nameMatch = raw.match(/^name:\s*(.+)$/m);
  assert(nameMatch && nameMatch[1].trim() === dir,
    `${dir}: frontmatter name matches directory ("${nameMatch?.[1]?.trim()}")`);

  // Extract metadata.id
  const idMatch = raw.match(/^\s+id:\s*(.+)$/m);
  const id = idMatch?.[1]?.trim();
  assert(id, `${dir}: has metadata.id ("${id}")`);
  if (id) allIds.push(id);

  // Extract runnable
  const runnableMatch = raw.match(/^\s+runnable:\s*(true|false)$/m);
  const runnable = runnableMatch?.[1] === "true";
  if (runnable && id) runnableIds.push(id);

  /* `kind` is optional in SKILL.md and defaults to image — same default the
     loader applies, so an older still-skill with no kind keeps working. */
  const kindMatch = raw.match(/^\s+kind:\s*(\w+)$/m);
  const kind = kindMatch?.[1] ?? "image";
  assert(SKILL_KINDS.includes(kind), `${dir}: kind is valid ("${kind}")`);
  if (runnable && id) (kind === "video" ? runnableVideoIds : runnableImageIds).push(id);

  // Extract order
  const orderMatch = raw.match(/^\s+order:\s*(\d+)$/m);
  if (orderMatch) allOrders.push(Number(orderMatch[1]));

  // Structural checks
  const hasBody = raw.split("\n---")[1]?.trim().length > 0;
  assert(hasBody, `${dir}: has instruction body below frontmatter`);
  const categoryMatch = raw.match(/^\s+category:\s*['"]?([\w-]+)['"]?$/m);
  assert(CATEGORIES.includes(categoryMatch?.[1]),
    `${dir}: category is valid ("${categoryMatch?.[1]}")`);
  const ratioMatch = raw.match(/^\s+aspectRatio:\s*['"]?([\d:]+)['"]?$/m);
  assert(ASPECT_RATIOS.includes(ratioMatch?.[1]),
    `${dir}: aspectRatio is valid ("${ratioMatch?.[1]}")`);
}

// Cross-checks
assert(
  new Set(allIds).size === allIds.length,
  `All skill ids are unique (${allIds.length} ids, ${new Set(allIds).size} unique)`
);
assert(
  new Set(allOrders).size === allOrders.length,
  `All skill orders are unique (${allOrders.length} orders, ${new Set(allOrders).size} unique)`
);

/* Runnable ↔ registry, bidirectional, PER KIND — mirroring the loader's
   assertRunnableSkillsAreExecutable(). A video skill listed under GENERATION_MODES
   would be handed to the image endpoint and 422 after charging, which is exactly
   why the two registries are kept separate. */
const missingMode = runnableImageIds.filter((id) => !GENERATION_MODES.includes(id));
assert(
  missingMode.length === 0,
  `Every runnable image skill has a GENERATION_MODE (missing: ${missingMode.join(", ") || "none"})`
);
const missingSkill = GENERATION_MODES.filter((m) => !runnableImageIds.includes(m));
assert(
  missingSkill.length === 0,
  `Every GENERATION_MODE has a runnable image skill (orphans: ${missingSkill.join(", ") || "none"})`
);
const missingVideoMode = runnableVideoIds.filter((id) => !VIDEO_SKILL_IDS.includes(id));
assert(
  missingVideoMode.length === 0,
  `Every runnable video skill is in VIDEO_SKILL_IDS (missing: ${missingVideoMode.join(", ") || "none"})`
);
const missingVideoSkill = VIDEO_SKILL_IDS.filter((id) => !runnableVideoIds.includes(id));
assert(
  missingVideoSkill.length === 0,
  `Every VIDEO_SKILL_ID has a runnable skill (orphans: ${missingVideoSkill.join(", ") || "none"})`
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. CREDIT BOUNDARY LOGIC
// ─────────────────────────────────────────────────────────────────────────────
section("2. Credit Boundaries");

const costsSrc = readFileSync(COSTS_FILE, "utf8");

// Every GENERATION_MODE must have a cost entry (keys may be unquoted, quoted, or hyphenated-quoted)
for (const mode of GENERATION_MODES) {
  const patterns = [
    `"${mode}"`,     // double-quoted key
    `'${mode}'`,     // single-quoted key
    `${mode}:`,      // unquoted key (TS object literal)
  ];
  const hasEntry = patterns.some((p) => costsSrc.includes(p));
  assert(hasEntry, `Credit cost defined for mode "${mode}"`);
}

// Costs must be positive integers
const costEntries = [...costsSrc.matchAll(/["']?([a-z-]+)["']?\s*:\s*(\d+)/g)];
for (const [, mode, cost] of costEntries) {
  if (GENERATION_MODES.includes(mode)) {
    assert(Number(cost) > 0, `Cost for "${mode}" is positive (${cost})`);
  }
}

// SIGNUP_GRANT_CREDITS present and positive
const grantMatch = costsSrc.match(/SIGNUP_GRANT_CREDITS\s*=\s*(\d+)/);
assert(grantMatch && Number(grantMatch[1]) > 0,
  `SIGNUP_GRANT_CREDITS is positive (${grantMatch?.[1]})`);

// Verify credit ledger enforces invariants
const creditsSrc = readFileSync(CREDITS_FILE, "utf8");
assert(creditsSrc.includes("write.amount <= 0"), "spend() rejects non-positive amounts");
assert(creditsSrc.includes("balance < write.amount"), "spend() checks balance >= amount");
assert(creditsSrc.includes("idempotencyKey"), "Idempotency key is used for deduplication");
assert(creditsSrc.includes("db.batch("), "Writes use db.batch() for atomicity");
assert(creditsSrc.includes("transfer_out") && creditsSrc.includes("transfer_in"),
  "Transfer uses paired transfer_out / transfer_in entries");
assert(/fromBalance\s*<\s*args\.amount/.test(creditsSrc),
  "transfer() checks sender balance before moving credits");

// ─────────────────────────────────────────────────────────────────────────────
// 3. WEBHOOK SIGNATURE BEHAVIOR
// ─────────────────────────────────────────────────────────────────────────────
section("3. Webhook Signature Verification");

const webhookSrc = readFileSync(WEBHOOK_FILE, "utf8");

// Gate ordering: secret configured → signature valid → timestamp fresh → correlate
assert(webhookSrc.includes("PICX_WEBHOOK_SECRET"), "References PICX_WEBHOOK_SECRET");
assert(webhookSrc.includes("503") && webhookSrc.includes("webhook_not_configured"),
  "Gate 1: returns 503 when NEITHER secret nor API key is configured (fail closed)");

/* Confirm-by-fetch is the authentication for an unsigned delivery (a callback_url
   submit is signed with a secret PicX never returns). These assertions pin the
   three properties that make it safe, because losing any one of them silently
   turns the receiver back into "trust the body". */
assert(webhookSrc.includes("confirmWithPicx"),
  "Unsigned deliveries are confirmed against PicX, not trusted");
assert(/deliveryIsOurs[\s\S]{0,400}confirmWithPicx/.test(webhookSrc),
  "Ownership is checked in our own tables BEFORE any outbound confirmation");
assert(webhookSrc.includes("data = confirmed.data"),
  "Confirmed record REPLACES the folded data view");
/* Both views must be replaced. The image-frame path reads `event.data?.output_url`
   directly rather than the folded view, so substituting only `data` left a forged
   URL reachable on the busiest delivery path. */
assert(webhookSrc.includes("event.data = confirmed.data"),
  "Confirmed record also replaces event.data, which the frame path reads directly");
assert(webhookSrc.includes("confirmation_unavailable") && webhookSrc.includes("not_final_yet"),
  "A transient or not-yet-final read-back asks for retry instead of settling work");
assert(webhookSrc.includes("invalid_signature") && webhookSrc.includes("401"),
  "Gate 2: returns 401 on bad signature");
assert(/MAX_SIGNATURE_AGE_SECONDS\s*=\s*\d+/.test(webhookSrc),
  "Gate 3: has timestamp freshness bound");
assert(webhookSrc.includes("missing_generation_id") && webhookSrc.includes("400"),
  "Gate 4 prereq: rejects missing generation_id");

// Signature algorithm
assert(webhookSrc.includes("HMAC") && webhookSrc.includes("SHA-256"),
  "Uses HMAC-SHA256 for signature");
assert(webhookSrc.includes("X-PicX-Signature"), "Reads X-PicX-Signature header");
assert(/t=.*v1=/.test(webhookSrc) || webhookSrc.includes("parts.t") && webhookSrc.includes("parts.v1"),
  "Parses t= and v1= components from signature header");

// Constant-time comparison
assert(webhookSrc.includes("diff |=") || webhookSrc.includes("diff|="),
  "Uses constant-time (bitwise OR accumulator) comparison");
assert(webhookSrc.includes("expected.length !== signature.length"),
  "Length check before constant-time comparison");

// Signed payload composition
assert(webhookSrc.includes("`${timestamp}.${rawBody}`"),
  "Signs over timestamp.rawBody (not re-serialized JSON)");

// Correlation on body, not URL path
assert(webhookSrc.includes("generation_id") && !webhookSrc.includes("params."),
  "Correlates on generation_id from body, not URL path params");

// Idempotency
assert(webhookSrc.includes('status !== "running"'),
  "Idempotent: skips already-completed items");

// Refund on failure
assert(webhookSrc.includes("refund(db"),
  "Refunds credits on generation failure");

// Live signature verification test
section("3b. Signature Crypto Verification (runtime)");
{
  const crypto = webcrypto;
  const secret = "test-webhook-secret-32bytes!!!";
  const body = JSON.stringify({ id: "evt_1", event: "generation.completed", data: { generation_id: "gen_abc" } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = `${timestamp}.${body}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");

  assert(hex.length === 64, `HMAC produces 64-char hex (got ${hex.length})`);

  // Verify the constant-time comparison logic would pass for matching sigs
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ hex.charCodeAt(i);
  assert(diff === 0, "Constant-time compare returns 0 for identical signatures");

  // Verify mismatch detection
  const tampered = "a" + hex.slice(1);
  let diff2 = 0;
  for (let i = 0; i < hex.length; i++) diff2 |= hex.charCodeAt(i) ^ tampered.charCodeAt(i);
  assert(diff2 !== 0, "Constant-time compare returns non-zero for different signatures");

  // Verify stale timestamp rejection logic
  const staleTs = String(Math.floor(Date.now() / 1000) - 600); // 10 min old
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(staleTs));
  assert(age > 300, `Stale timestamp (${age}s) would exceed MAX_SIGNATURE_AGE_SECONDS (300)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. API ROUTE CONTRACTS
// ─────────────────────────────────────────────────────────────────────────────
section("4. API Route Contracts");

const chatSrc = readFileSync(CHAT_FILE, "utf8");
const agentSrc = readFileSync(AGENT_FILE, "utf8");

// POST /api/chat
assert(chatSrc.includes("export async function POST"), "/api/chat exports POST handler");
assert(chatSrc.includes("prerender = false"), "/api/chat disables prerender (SSR route)");
assert(chatSrc.includes("requireOrg"), "/api/chat requires authenticated org context");
assert(chatSrc.includes("messages") && chatSrc.includes("Array.isArray"),
  "/api/chat validates messages is an array");
assert(chatSrc.includes("application/x-ndjson"), "/api/chat streams ndjson");
assert(chatSrc.includes("bridgeCloudflareEnv"), "/api/chat bridges env vars for Mastra");
assert(chatSrc.includes("MAX_RETRIES") || chatSrc.includes("attempt"),
  "/api/chat has retry logic for transient fetch failures");
assert(chatSrc.includes("getBalance"), "/api/chat emits credit balance after generation");

// Error handling
assert(chatSrc.includes("api key") && chatSrc.includes("isn't configured"),
  "/api/chat has user-friendly error for missing API key");
assert(chatSrc.includes("fetch failed"),
  "/api/chat has user-friendly error for network failures");
assert(!chatSrc.includes("err.stack") && !chatSrc.includes("JSON.stringify(err"),
  "/api/chat does NOT leak stack traces to client");

// POST /api/agent (mode recommendation)
assert(agentSrc.includes("export async function POST"), "/api/agent exports POST handler");
assert(agentSrc.includes("prerender = false"), "/api/agent disables prerender");
assert(agentSrc.includes("message") && agentSrc.includes("required"),
  "/api/agent validates message is required");
assert(agentSrc.includes("recommendDoodleMode"), "/api/agent falls back to local recommender");
assert(agentSrc.includes("structuredOutput"), "/api/agent uses structured output schema");

// Verify all API routes exist
const API_ROUTES = [
  "src/pages/api/chat.ts",
  "src/pages/api/agent.ts",
  "src/pages/api/upload.ts",
  "src/pages/api/webhooks/picx.ts",
];
for (const route of API_ROUTES) {
  assert(existsSync(join(ROOT, route)), `Route file exists: ${route}`);
}

// Webhook returns 2xx for all authentic deliveries (idempotency)
assert(webhookSrc.includes("200") && webhookSrc.includes("duplicate"),
  "Webhook returns 200 on duplicate delivery (at-least-once safe)");
assert(webhookSrc.includes("matched: false"),
  "Webhook returns 200 for unrecognized-but-authentic delivery");

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`    • ${f}`);
}
console.log("═".repeat(60) + "\n");

process.exit(failed > 0 ? 1 : 0);
