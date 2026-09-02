#!/usr/bin/env node
/**
 * End-to-end smoke test for the async VIDEO pipeline — no browser, no build.
 *
 * It proves the two halves that let a video clip come back safely:
 *   (1) the inbound webhook (POST /api/webhooks/picx) accepts a correctly
 *       signed delivery and REJECTS a tampered body, a stale timestamp and a
 *       missing signature header — using the exact signature scheme PicX uses
 *       (HMAC-SHA256 over `{t}.{rawBody}`, header `X-PicX-Signature: t=..,v1=..`);
 *   (2) an unknown generation id is answered 2xx-not-matched (never an error),
 *       so PicX has nothing to retry on an authentic-but-unrecognised delivery.
 *
 * Everything above talks ONLY to the locally running app with a THROWAWAY
 * secret you pass in — it never touches PicX and never spends a credit.
 *
 * The optional (3) `--submit` flag DOES hit PicX and submits one real 5s 480p
 * clip. That SPENDS REAL CREDITS, so it is OFF by default, refuses to run
 * without an explicit key, and prints what it is about to spend before doing it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO RUN  (package.json is not editable, so run node directly)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   # 1. Start the app in one terminal (either local mode is fine):
 *   pnpm dev:local           # astro dev on http://localhost:4321
 *
 *   # 2. Run the webhook checks with the SAME secret the app has in .dev.vars
 *   #    as PICX_WEBHOOK_SECRET. This spends NOTHING.
 *   WEBHOOK_SECRET=whsec_your_local_test_secret node scripts/video-smoke.mjs
 *
 *   # Point at a different origin (e.g. a cloudflared tunnel or staging):
 *   APP_URL=https://dev.doodleai.art WEBHOOK_SECRET=whsec_... node scripts/video-smoke.mjs
 *
 *   # 3. OPTIONAL — actually submit one 5s/480p clip to PicX (SPENDS CREDITS):
 *   PICX_API_KEY=pxsk_... node scripts/video-smoke.mjs --submit
 *
 * Env vars:
 *   APP_URL          Base URL of the running app       (default http://localhost:4321)
 *   WEBHOOK_SECRET   Throwaway secret the app is using for PICX_WEBHOOK_SECRET
 *                    (required for the webhook checks; may be any string — it
 *                     only has to MATCH what the running app has configured)
 *   PICX_API_KEY     Real PicX key. ONLY read when --submit is passed.
 *
 * No new dependencies: plain node ESM + node:crypto webcrypto, same as
 * scripts/smoke-validate.mjs.
 */

import { webcrypto } from "node:crypto";

const crypto = webcrypto;

const APP_URL = (process.env.APP_URL || "http://localhost:4321").replace(/\/$/, "");
const WEBHOOK_URL = `${APP_URL}/api/webhooks/picx`;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const SUBMIT = process.argv.includes("--submit");

// PicX endpoint + shape, mirrored from src/lib/video/submit.ts.
const VIDEO_ENDPOINT = "https://api.picxstudio.com/v1/videos/generate";
const VIDEO_MODEL = "minimax/h3-max";

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  \u2717 ${label}`);
  }
}

function section(title) {
  console.log(`\n\u2501\u2501\u2501 ${title} \u2501\u2501\u2501`);
}

/** HMAC-SHA256 over `{timestamp}.{rawBody}`, hex — exactly what the webhook verifies. */
async function sign(secret, timestamp, rawBody) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * POST a body to the webhook with an optional signature header.
 * `header` of null means send NO X-PicX-Signature at all.
 */
async function postWebhook(rawBody, header) {
  const headers = { "Content-Type": "application/json" };
  if (header !== null) headers["X-PicX-Signature"] = header;
  let res;
  try {
    res = await fetch(WEBHOOK_URL, { method: "POST", headers, body: rawBody });
  } catch (err) {
    return { networkError: err };
  }
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body is fine to leave null */
  }
  return { status: res.status, json, text };
}

/** Build a webhook body. `generationId` is the PicX id we correlate on. */
function makeBody(generationId, { event = "generation.completed", outputUrl = "https://cdn.example/clip.mp4" } = {}) {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    event,
    data: {
      generation_id: generationId,
      status: event === "generation.completed" ? "completed" : "failed",
      type: "video",
      output_url: event === "generation.completed" ? outputUrl : null,
    },
  });
}

async function preflight() {
  section("0. Preflight");
  if (!WEBHOOK_SECRET) {
    console.error(
      "\n  WEBHOOK_SECRET is required for the webhook checks.\n" +
        "  Set it to the SAME value the running app has as PICX_WEBHOOK_SECRET.\n" +
        "  Example:  WEBHOOK_SECRET=whsec_local_test node scripts/video-smoke.mjs\n",
    );
    process.exit(2);
  }
  // Is the app up at all? A signed unknown-id delivery should return 2xx; if we
  // get a 503 the app is up but the secret is not configured / mismatched, which
  // is itself a useful signal, so we don't hard-fail here — the checks below do.
  const ts = String(Math.floor(Date.now() / 1000));
  const body = makeBody(`gen_preflight_${Date.now()}`);
  const probe = await postWebhook(body, `t=${ts},v1=${await sign(WEBHOOK_SECRET, ts, body)}`);
  if (probe.networkError) {
    console.error(
      `\n  Could not reach ${WEBHOOK_URL} — is the app running?\n` +
        `  Start it with:  pnpm dev:local   (or set APP_URL)\n` +
        `  Underlying error: ${probe.networkError.message}\n`,
    );
    process.exit(2);
  }
  assert(true, `App reachable at ${WEBHOOK_URL} (HTTP ${probe.status})`);
  if (probe.status === 503) {
    console.warn(
      "  \u26a0 App returned 503 (webhook_not_configured): PICX_WEBHOOK_SECRET is\n" +
        "    unset/empty on the running app, so signature checks below will all\n" +
        "    read as rejected regardless of the signature. Set it and re-run.",
    );
  }
}

async function webhookChecks() {
  const nowSec = Math.floor(Date.now() / 1000);
  const unknownId = `gen_unknown_${Date.now()}`;

  // ── 1. Valid signature is ACCEPTED (and unknown id -> 2xx not-matched) ──────
  section("1. Valid signature accepted");
  {
    const ts = String(nowSec);
    const body = makeBody(unknownId);
    const sig = await sign(WEBHOOK_SECRET, ts, body);
    const r = await postWebhook(body, `t=${ts},v1=${sig}`);
    assert(r.status >= 200 && r.status < 300, `valid signature accepted (HTTP ${r.status}, expected 2xx)`);
    // The generation id is unknown, so the body must say matched:false — see
    // check 2 for why that has to be a 2xx and not a 404.
    assert(r.json?.matched === false, `unknown id reports matched:false (got ${JSON.stringify(r.json)})`);
  }

  // ── 2. Unknown id is 2xx-not-matched, never an error PicX would retry ───────
  section("2. Unknown generation id -> 2xx, no retry");
  {
    const ts = String(nowSec);
    const body = makeBody(`gen_definitely_absent_${Date.now()}`);
    const sig = await sign(WEBHOOK_SECRET, ts, body);
    const r = await postWebhook(body, `t=${ts},v1=${sig}`);
    assert(
      r.status >= 200 && r.status < 300,
      `authentic-but-unrecognised delivery is 2xx so PicX will not retry (HTTP ${r.status})`,
    );
    assert(r.status !== 404 && r.status < 500, `not a 4xx/5xx that would trigger PicX retries (HTTP ${r.status})`);
  }

  // ── 3. Tampered body is REJECTED ────────────────────────────────────────────
  section("3. Tampered body rejected");
  {
    const ts = String(nowSec);
    const signedBody = makeBody(unknownId);
    const sig = await sign(WEBHOOK_SECRET, ts, signedBody); // sign the ORIGINAL
    // Now mutate the body after signing — a MITM flipping the output URL.
    const tamperedBody = signedBody.replace("clip.mp4", "attacker-controlled.mp4");
    const r = await postWebhook(tamperedBody, `t=${ts},v1=${sig}`);
    assert(r.status === 401, `tampered body rejected with 401 (got HTTP ${r.status})`);
  }

  // ── 4. Stale timestamp is REJECTED ──────────────────────────────────────────
  section("4. Stale timestamp rejected");
  {
    const staleTs = String(nowSec - 3600); // an hour old, well past 300s bound
    const body = makeBody(unknownId);
    const sig = await sign(WEBHOOK_SECRET, staleTs, body); // correctly signed, just old
    const r = await postWebhook(body, `t=${staleTs},v1=${sig}`);
    assert(r.status === 401, `stale timestamp rejected with 401 (got HTTP ${r.status})`);
  }

  // ── 5. Missing signature header is REJECTED ─────────────────────────────────
  section("5. Missing signature header rejected");
  {
    const body = makeBody(unknownId);
    const r = await postWebhook(body, null); // no X-PicX-Signature at all
    // 401 when the secret is configured; 503 if the app has no secret set. Both
    // are "refused", which is the property under test — an unsigned delivery is
    // never accepted.
    assert(r.status === 401 || r.status === 503, `unsigned delivery refused (got HTTP ${r.status})`);
  }

  // ── 6. Wrong secret is REJECTED (guards against a mismatched deploy) ─────────
  section("6. Wrong signing secret rejected");
  {
    const ts = String(nowSec);
    const body = makeBody(unknownId);
    const sig = await sign(`${WEBHOOK_SECRET}_WRONG`, ts, body);
    const r = await postWebhook(body, `t=${ts},v1=${sig}`);
    assert(r.status === 401 || r.status === 503, `signature from wrong secret refused (got HTTP ${r.status})`);
  }
}

/**
 * OPTIONAL live submit. Spends real credits, so: off unless --submit, refuses
 * without a key, and prints the spend before doing it. Default run spends nothing.
 */
async function submitLiveClip() {
  section("7. Live submit (--submit) — SPENDS REAL CREDITS");

  const key = process.env.PICX_API_KEY || "";
  if (!key) {
    console.error(
      "\n  --submit needs a real key. Set PICX_API_KEY explicitly:\n" +
        "    PICX_API_KEY=pxsk_... node scripts/video-smoke.mjs --submit\n" +
        "  Refusing to submit without one.\n",
    );
    process.exit(2);
  }

  const seconds = 5;
  const resolution = "480p";
  // Mirror the pricing in src/lib/video/constants.ts: 480p is 1 internal
  // credit/second, so a 5s clip is 5 credits.
  const estimatedCredits = seconds * 1;

  console.log(
    `\n  About to submit ONE real clip to PicX:\n` +
      `    model      ${VIDEO_MODEL}\n` +
      `    mode       text\n` +
      `    duration   ${seconds}s\n` +
      `    resolution ${resolution}\n` +
      `    est. spend ~${estimatedCredits} internal credits (${resolution} @ 1 credit/s)\n`,
  );

  const payload = {
    prompt: "A friendly crayon-doodle robot waving hello, plain white background. Smoke test.",
    model: VIDEO_MODEL,
    mode: "text",
    duration: seconds,
    resolution,
    sound: true,
    // No callback_url on purpose: the smoke test does not need the async
    // completion to come back to anywhere — we only prove the submit is accepted
    // and returns an id. The clip renders on PicX's side and is never collected.
  };

  let res;
  try {
    res = await fetch(VIDEO_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    assert(false, `PicX submit reached the endpoint (network error: ${err.message})`);
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 202 && data?.id) {
    assert(true, `PicX accepted the clip (HTTP 202)`);
    console.log(`\n  Returned generation id: ${data.id}`);
    console.log(`  (The clip is rendering on PicX; this test does not collect it.)`);
  } else {
    assert(false, `PicX accepted the clip (got HTTP ${res.status}: ${data?.detail || data?.message || "no id"})`);
  }
}

async function main() {
  console.log(`\nVideo pipeline smoke test`);
  console.log(`  target: ${APP_URL}`);
  console.log(`  mode:   ${SUBMIT ? "webhook checks + LIVE SUBMIT (spends credits)" : "webhook checks only (spends nothing)"}`);

  await preflight();
  await webhookChecks();
  if (SUBMIT) await submitLiveClip();

  console.log("\n" + "\u2550".repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failures.length > 0) {
    console.log("\n  Failures:");
    for (const f of failures) console.log(`    \u2022 ${f}`);
  }
  console.log("\u2550".repeat(60) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
