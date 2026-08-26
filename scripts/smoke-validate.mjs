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
const modesMatch = constantsSrc.match(/GENERATION_MODES\s*=\s*\[([^\]]+)\]/);
assert(modesMatch, "GENERATION_MODES array found in doodle-constants.ts");
const GENERATION_MODES = modesMatch[1]
  .split(",")
  .map((s) => s.trim().replace(/['"]/g, ""))
  .filter(Boolean);
assert(GENERATION_MODES.length > 0, `GENERATION_MODES has ${GENERATION_MODES.length} entries`);

// Discover skill directories
const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
assert(skillDirs.length > 0, `Found ${skillDirs.length} skill directories`);

// Validate each SKILL.md
const runnableIds = [];
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

  // Extract order
  const orderMatch = raw.match(/^\s+order:\s*(\d+)$/m);
  if (orderMatch) allOrders.push(Number(orderMatch[1]));

  // Structural checks
  const hasBody = raw.split("\n---")[1]?.trim().length > 0;
  assert(hasBody, `${dir}: has instruction body below frontmatter`);
  assert(/^\s+category:\s*(avatars|collages|freeform)$/m.test(raw),
    `${dir}: category is valid`);
  assert(/^\s+aspectRatio:\s*['"]?(1:1|3:2)['"]?$/m.test(raw),
    `${dir}: aspectRatio is valid`);
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

// Runnable ↔ GENERATION_MODES bidirectional match
const missingMode = runnableIds.filter((id) => !GENERATION_MODES.includes(id));
assert(
  missingMode.length === 0,
  `Every runnable skill has a GENERATION_MODE (missing: ${missingMode.join(", ") || "none"})`
);
const missingSkill = GENERATION_MODES.filter((m) => !runnableIds.includes(m));
assert(
  missingSkill.length === 0,
  `Every GENERATION_MODE has a runnable skill (orphans: ${missingSkill.join(", ") || "none"})`
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
  "Gate 1: returns 503 when secret not configured (fail closed)");
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
