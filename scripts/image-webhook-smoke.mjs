/* Prove the webhook-only image path end to end, outside the browser.
 *
 * Images have no synchronous path any more: every render is submitted with a
 * callback_url and delivered by webhook. This script exercises exactly that.
 *
 *   node scripts/image-webhook-smoke.mjs
 *       Local checks only. Spends NOTHING: builds a signed delivery and POSTs it
 *       at your receiver, asserting a valid one is accepted and that a tampered
 *       body, a stale timestamp and a missing header are each rejected.
 *
 *   node scripts/image-webhook-smoke.mjs --submit
 *       Really submits one image to PicX with your callback URL and prints the
 *       generation id. SPENDS CREDITS. Watch your dev-server log for the
 *       inbound delivery, or check the row via /api/v1/videos/<id>.
 *
 * Env (read from .dev.vars when not exported):
 *   PICX_API_KEY            required for --submit
 *   PICX_CALLBACK_ORIGIN    e.g. https://intensely-moral-pig.ngrok-free.app
 *   PICX_WEBHOOK_SECRET     signs the local deliveries; a throwaway is used when unset
 *   APP_ORIGIN              where to POST local deliveries (default http://localhost:4321)
 */

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

function fromDevVars(name) {
  try {
    return readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`))
      ?.slice(name.length + 1)
      .trim();
  } catch {
    return undefined;
  }
}
const env = (name) => process.env[name]?.trim() || fromDevVars(name);

const APP_ORIGIN = env("APP_ORIGIN") || "http://localhost:4321";
const CALLBACK_ORIGIN = env("PICX_CALLBACK_ORIGIN") || APP_ORIGIN;
const RECEIVER = `${APP_ORIGIN.replace(/\/$/, "")}/api/webhooks/picx`;
const CALLBACK_URL = `${CALLBACK_ORIGIN.replace(/\/$/, "")}/api/webhooks/picx`;

let failures = 0;
function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Exactly how PicX signs: HMAC-SHA256 over `{timestamp}.{rawBody}`. */
function sign(secret, rawBody, timestamp) {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

async function deliver(rawBody, header) {
  const res = await fetch(RECEIVER, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(header ? { "X-PicX-Signature": header } : {}) },
    body: rawBody,
  });
  return { status: res.status, body: await res.text() };
}

async function localChecks() {
  const secret = env("PICX_WEBHOOK_SECRET") || "whsec_throwaway_for_smoke_only";
  const usingThrowaway = !env("PICX_WEBHOOK_SECRET");
  /* With no secret and the dev flag on, the receiver accepts EVERY delivery by
     design, so a rejected tamper/stale/unsigned case is impossible. Expect the
     accept and say plainly that the gate is off, rather than reporting three
     failures for behaviour that was deliberately configured. */
  const insecure = usingThrowaway && env("PICX_WEBHOOK_INSECURE_DEV") === "true";
  const rejects = (status) =>
    insecure ? status === 200 : status === 401 || status === 503;
  const rejectNote = insecure ? " (accepted: insecure dev mode, gate off)" : "";
  console.log(`\nReceiver: ${RECEIVER}`);
  if (insecure) {
    console.log(
      "PICX_WEBHOOK_INSECURE_DEV=true and no PICX_WEBHOOK_SECRET: the receiver accepts\n" +
        "UNVERIFIED deliveries. The signature gates below are therefore NOT being proven —\n" +
        "set a PICX_WEBHOOK_SECRET (and restart the dev server) to test them for real.",
    );
  } else if (usingThrowaway) {
    console.log(
      "No PICX_WEBHOOK_SECRET set, so a throwaway is used. The accept case then only\n" +
        "passes if PICX_WEBHOOK_INSECURE_DEV=true; otherwise 503 is the CORRECT answer.",
    );
  }

  /* An id that belongs to nothing. The receiver must answer 2xx "not matched"
     rather than an error: the delivery is authentic, so a non-2xx would make PicX
     retry three times and then mark it exhausted. */
  const body = JSON.stringify({
    id: `evt_smoke_${Date.now()}`,
    event: "generation.completed",
    created_at: new Date().toISOString(),
    api_version: "2026-08-01",
    data: {
      generation_id: `smoke-unknown-${Date.now()}`,
      status: "completed",
      type: "image",
      model: "openai/gpt-image-2",
      output_url: "https://cdn.picxstudio.com/api/generated/smoke.png",
      error_message: null,
      credits_used: 1,
    },
  });
  const now = Math.floor(Date.now() / 1000);

  console.log("\nSignature gates:");
  const valid = await deliver(body, sign(secret, body, now));
  check(
    "valid signature accepted (or 503 when no secret is configured)",
    valid.status === 200 || valid.status === 503,
    `HTTP ${valid.status} ${valid.body.slice(0, 90)}`,
  );
  if (valid.status === 200) {
    check(
      "unknown generation id answered 2xx-not-matched, so PicX will not retry",
      /"matched":\s*false|"ok":\s*true/.test(valid.body),
      valid.body.slice(0, 90),
    );
  }

  const tampered = await deliver(body.replace("smoke-unknown", "smoke-TAMPERED"), sign(secret, body, now));
  check("tampered body rejected", rejects(tampered.status), `HTTP ${tampered.status}${rejectNote}`);

  const stale = await deliver(body, sign(secret, body, now - 3600));
  check("stale timestamp rejected", rejects(stale.status), `HTTP ${stale.status}${rejectNote}`);

  const unsigned = await deliver(body, undefined);
  check("missing signature rejected", rejects(unsigned.status), `HTTP ${unsigned.status}${rejectNote}`);
}

async function submitReal() {
  const key = env("PICX_API_KEY");
  if (!key) {
    console.error("\n--submit needs PICX_API_KEY (env or .dev.vars). Refusing to continue.");
    process.exit(1);
  }
  if (!CALLBACK_URL.startsWith("https://")) {
    console.error(
      `\n--submit needs a PUBLIC https callback. Got ${CALLBACK_URL}.\n` +
        `Start a tunnel and set PICX_CALLBACK_ORIGIN:\n` +
        `  ngrok http --domain="intensely-moral-pig.ngrok-free.app" 4321`,
    );
    process.exit(1);
  }

  console.log(`\nAbout to SPEND CREDITS: 1 image via openai/gpt-image-2.`);
  console.log(`Delivery will be POSTed to ${CALLBACK_URL}`);

  const res = await fetch("https://api.picxstudio.com/v1/images/generate", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:
        "A tiny hand-drawn doodle of a smiling star holding a paintbrush, bold marker outlines, " +
        "flat cheerful colours, clean warm-white background. No text, no watermark.",
      size: "1K",
      aspect_ratio: "1:1",
      callback_url: CALLBACK_URL,
    }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`\nHTTP ${res.status}`);
  console.log(JSON.stringify(data, null, 2));

  check("PicX accepted the submit asynchronously (202 + id)", res.status === 202 && Boolean(data.id));
  check(
    "no finished url returned, i.e. callback_url was honoured",
    !data.url,
    data.url ? "API returned a url — it ignored callback_url" : "",
  );
  if (data.id) {
    console.log(`\nWatch your dev-server log for the delivery, then read the row:`);
    console.log(`  ${APP_ORIGIN}/api/v1/videos/${data.id}   (needs your session cookie)`);
    console.log(`  NOTE: that id is PicX's; our own job id is the generation row created by the app.`);
  }
}

await localChecks();
if (process.argv.includes("--submit")) await submitReal();

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
