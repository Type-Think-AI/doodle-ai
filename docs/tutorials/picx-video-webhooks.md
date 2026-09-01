# Tutorial: Generate a Video Clip with PicX and Receive It by Webhook

This walks the full asynchronous loop end to end: submit a clip (SDK **and** raw fetch), receive PicX's webhook, verify the signature with Web Crypto on Cloudflare Workers, handle at-least-once delivery idempotently, and refund a failed clip. Every code block runs — no pseudocode.

You need a PicX API key (`pxsk_…`), your PicX **webhook signing secret**, and a public URL PicX can POST to (for local dev, a `cloudflared`/`wrangler dev` tunnel).

The model is **MiniMax H3 Max** (`minimax/h3-max`): audio-on, 5–15s clips, 480p through the public API. See [../video-integration.md](../video-integration.md) for the architecture behind this.

---

## Step 1 — Submit a clip

PicX **always** answers `202 Accepted` and finishes the render out of band, POSTing the result to your `callback_url`. You never get the clip on this response.

### With the picx-ai SDK

```ts
// npm i picx-ai
import { PicX } from "picx-ai";

// base_url MUST include /v1 — the bare host 404s.
const picx = new PicX({
  apiKey: process.env.PICX_API_KEY!,
  baseUrl: "https://api.picxstudio.com/v1",
});

const job = await picx.videos.generate({
  model: "minimax/h3-max",
  mode: "image",                 // "text" | "image" | "reference"
  prompt: "the doodle waves and blinks, warm morning light",
  duration: 5,                   // integer 5–15
  resolution: "480p",            // only 480p is reachable via the public API
  image_url: "https://cdn.picxstudio.com/api/generated/your-frame.png",
  callback_url: "https://your-app.example.com/api/webhooks/picx-video",
});

// job.status === "queued", job.id is PicX's job id — persist it against your row.
console.log(job.id, job.status, job.poll_url);
```

`mode` decides how the input picture is used, and this is the part that trips people up:

- `"text"` — prompt only, no picture.
- `"image"` — **the picture is frame one.** Use this to *animate* a doodle you already have.
- `"reference"` — **the picture is who the character is**, and PicX makes a *new* clip of them. Pass `reference_urls: [...]` (up to 10) instead of `image_url`.

### With raw fetch (no SDK)

```ts
const res = await fetch("https://api.picxstudio.com/v1/videos/generate", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PICX_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "minimax/h3-max",
    mode: "image",
    prompt: "the doodle waves and blinks, warm morning light",
    duration: 5,
    resolution: "480p",
    image_url: "https://cdn.picxstudio.com/api/generated/your-frame.png",
    callback_url: "https://your-app.example.com/api/webhooks/picx-video",
  }),
});

// PicX answers 202 Accepted, not 200.
if (res.status !== 202) throw new Error(`submit failed: ${res.status}`);

const job = (await res.json()) as {
  id: string;
  status: "queued";
  type: "video";
  model: string;
  poll_url: string;
  events_url: string;
  webhook: string;
};
console.log(job.id, job.status);
```

### The one-line curl

```bash
curl -sS -X POST https://api.picxstudio.com/v1/videos/generate \
  -H "Authorization: Bearer $PICX_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"minimax/h3-max","mode":"image","prompt":"the doodle waves and blinks","duration":5,"resolution":"480p","image_url":"https://cdn.picxstudio.com/api/generated/your-frame.png","callback_url":"https://your-app.example.com/api/webhooks/picx-video"}'
```

You get back `{ "id": "vid_…", "status": "queued", ... }`. Now wait for the webhook.

---

## Step 2 — Verify the signature (Web Crypto, Workers-native)

PicX signs every delivery:

```
X-PicX-Signature: t=<unix-seconds>,v1=<hex-hmac>
```

`v1` is `HMAC-SHA256` over the string `` `${t}.${rawBody}` ``. You must hash the **raw** body bytes, compare in **constant time**, and reject a **stale** timestamp. This runs on Workers with no Node crypto — `crypto.subtle` and `crypto.subtle.timingSafeEqual`-free constant-time compare below.

```ts
// src/lib/picx-webhook.ts — runs on Cloudflare Workers, no node:crypto.

/** Parse "t=...,v1=..." into its parts. Returns null if malformed. */
function parseSignatureHeader(header: string | null): { t: number; v1: string } | null {
  if (!header) return null;
  let t: number | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") t = Number(v);
    else if (k === "v1") v1 = v;
  }
  if (t === undefined || !Number.isFinite(t) || !v1) return null;
  return { t, v1 };
}

/** Constant-time hex-string compare. Length-safe, no early return. */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Verify a PicX webhook. Pass the RAW body string (the exact bytes you read
 * off the request), the signature header, and your signing secret.
 * `toleranceSeconds` bounds replay: a delivery older than this is rejected
 * even with a valid HMAC.
 */
export async function verifyPicxWebhook(opts: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const parsed = parseSignatureHeader(opts.signatureHeader);
  if (!parsed) return false;

  // Freshness bound — reject stale (replayed) deliveries.
  const tolerance = opts.toleranceSeconds ?? 300; // 5 minutes
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - parsed.t) > tolerance) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(opts.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Sign the EXACT string PicX signed: `${t}.${rawBody}`.
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${parsed.t}.${opts.rawBody}`),
  );

  return constantTimeEqualHex(toHex(signed), parsed.v1.toLowerCase());
}
```

---

## Step 3 — Receive the webhook: verify → correlate → idempotent complete/refund

This is the whole handler. Read the raw body **once** before parsing, verify, then correlate on `data.generation_id` **from the signed body** — never a URL path parameter (the signature doesn't cover the URL, so a replayed delivery would verify against the wrong item). Then complete or refund idempotently, and answer 2xx once the delivery is authentic.

```ts
// src/pages/api/webhooks/picx-video.ts (Astro API route on Workers)
import type { APIRoute } from "astro";
import { verifyPicxWebhook } from "../../../lib/picx-webhook";

interface PicxVideoWebhook {
  id: string;                         // PicX event/job id
  status: "completed" | "failed";     // terminal
  type: "video";
  data: {
    generation_id: string;            // OUR row id — the correlation key
    video_url?: string;               // present on success
    error?: string;                   // present on failure
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env; // PICX_WEBHOOK_SECRET, DB (D1), etc.

  // 1. Read the RAW body exactly once — this is what was signed.
  const rawBody = await request.text();

  // 2. Verify. A bad signature is the ONE case that returns non-2xx.
  const ok = await verifyPicxWebhook({
    rawBody,
    signatureHeader: request.headers.get("X-PicX-Signature"),
    secret: env.PICX_WEBHOOK_SECRET,
  });
  if (!ok) return new Response("bad signature", { status: 401 });

  // 3. Parse only AFTER the HMAC matched, from the bytes we hashed.
  const evt = JSON.parse(rawBody) as PicxVideoWebhook;
  const generationId = evt.data?.generation_id;
  if (!generationId) return new Response("no generation_id", { status: 400 });

  // 4. Load our row and correlate on the SIGNED body's id.
  const row = await env.DB
    .prepare("SELECT id, status, credits_charged FROM generation WHERE id = ? AND skill_id = 'video'")
    .bind(generationId)
    .first<{ id: string; status: string; credits_charged: number }>();
  if (!row) return new Response("unknown generation", { status: 404 });

  // 5. Idempotency: at-least-once delivery means this can arrive twice.
  //    A row already terminal is a no-op — return 2xx so PicX stops retrying.
  if (row.status === "ok" || row.status === "refunded" || row.status === "failed") {
    return new Response("already processed", { status: 200 });
  }

  if (evt.status === "completed" && evt.data.video_url) {
    await env.DB
      .prepare("UPDATE generation SET status='ok', output_url=?, completed_at=? WHERE id=? AND status='pending'")
      .bind(evt.data.video_url, Date.now(), generationId)
      .run();
    return new Response("ok", { status: 200 });
  }

  // 6. Failure → refund on the idempotency key `refund:<generationId>`.
  //    The UNIQUE constraint on idempotency_key collapses a double refund
  //    (webhook + hourly sweep) onto ONE ledger row.
  await refundGeneration(env.DB, row.id, row.credits_charged, evt.data.error ?? "video_failed");
  return new Response("refunded", { status: 200 });
};

/** Refund is idempotent: the UNIQUE key makes a second attempt a caught no-op. */
async function refundGeneration(
  db: D1Database,
  generationId: string,
  credits: number,
  errorCode: string,
): Promise<void> {
  const userRow = await db
    .prepare("SELECT user_id FROM generation WHERE id = ?")
    .bind(generationId)
    .first<{ user_id: string }>();
  if (!userRow) return;

  const balRow = await db
    .prepare("SELECT balance FROM credit_balance WHERE user_id = ?")
    .bind(userRow.user_id)
    .first<{ balance: number }>();
  const balanceAfter = (balRow?.balance ?? 0) + credits;

  try {
    // INSERT OR ABORT so the UNIQUE(idempotency_key) collision throws and is caught.
    await db.batch([
      db.prepare(
        `INSERT INTO credit_ledger
           (id, user_id, delta, reason, ref_id, idempotency_key, balance_after, created_at)
         VALUES (?, ?, ?, 'refund', ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), userRow.user_id, credits, generationId,
        `refund:${generationId}`, balanceAfter, Date.now(),
      ),
      db.prepare("UPDATE credit_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
        .bind(credits, Date.now(), userRow.user_id),
      db.prepare("UPDATE generation SET status='refunded', error_code=? WHERE id=? AND status='pending'")
        .bind(errorCode, generationId),
    ]);
  } catch (err) {
    // A UNIQUE violation on refund:<id> means it was already refunded
    // (a duplicate delivery, or the hourly sweep beat us). That is success.
    if (String(err).includes("UNIQUE")) return;
    throw err;
  }
}
```

---

## Step 4 — Why each guard is here (the failure it stops)

- **Raw body read once, parse after verify.** Hashing a re-serialised object won't match PicX's HMAC — key order and whitespace differ. Verify the bytes, then parse the same bytes.
- **Constant-time compare.** A `===` compare returns early on the first differing char and leaks the correct signature one byte at a time. `constantTimeEqualHex` always walks the whole string.
- **Freshness bound.** Without it, a captured valid delivery replays forever. With it, a stale `t` is rejected even though the HMAC is genuine.
- **Correlate on `data.generation_id`, not a URL path.** The signature covers the body, not the path. A path-param callback (`…/picx-video/<id>`) lets a valid delivery for clip A be replayed against clip B's URL and still verify. One static URL + body-based correlation closes it.
- **Terminal-status short-circuit.** At-least-once delivery means duplicates. A row already `ok`/`refunded`/`failed` returns 2xx and changes nothing — no second CDN write, no second ledger row.
- **2xx on an authentic-but-duplicate delivery.** Returning non-2xx tells PicX to retry something you've already handled; three failed retries mark it *exhausted* for no reason. Reserve non-2xx for genuinely unprocessable deliveries (bad signature → 401, missing id → 400/404).
- **`refund:<generationId>` idempotency key.** Both the webhook and the hourly sweep can refund the same clip; the `UNIQUE` column makes the second one a caught no-op, so the user is refunded exactly once.

---

## Step 5 — Test the verifier locally

Sign a body with the same secret and POST it to your local route. This is the exact HMAC PicX uses, so a valid signature here is a valid signature in production.

```ts
// scripts/sign-webhook.ts — Node 20+ (uses global crypto.subtle)
async function sign(secret: string, body: string): Promise<string> {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

const body = JSON.stringify({
  id: "evt_test",
  status: "completed",
  type: "video",
  data: { generation_id: "YOUR_PENDING_ROW_ID", video_url: "https://cdn.picxstudio.com/api/video/clip.mp4" },
});

sign(process.env.PICX_WEBHOOK_SECRET!, body).then((header) => {
  console.log(`curl -sS -X POST http://localhost:4321/api/webhooks/picx-video \\
  -H 'Content-Type: application/json' \\
  -H 'X-PicX-Signature: ${header}' \\
  -d '${body}'`);
});
```

Run it, paste the printed curl, and assert the row flips to `ok`. Then:

- **Tamper test:** change one character of `body` after signing → expect `401`, no state change.
- **Stale test:** hard-code `t` an hour in the past → expect `401` from the freshness bound.
- **Idempotency test:** POST the *same* completed delivery twice → expect exactly one `output_url` write; POST the same *failed* delivery twice → expect exactly one `refund:<generationId>` ledger row.
