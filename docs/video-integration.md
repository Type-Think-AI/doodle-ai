# Doodle AI — Video Integration

> **Status:** implemented. Doodle AI generates short animated clips through PicX's public video API and delivers them by webhook.
> **Prerequisite:** [architecture.md](./architecture.md) — the credit ledger, the `generation` row, and the debit-first/refund-on-failure discipline all carry over unchanged; this doc only adds the parts that differ for an *asynchronous* job.
> **Source of truth for numbers:** [`src/lib/video/constants.ts`](../src/lib/video/constants.ts). Every price, duration and resolution below is quoted from there. Do not restate a number here that isn't in that file.

## 1. Why this is different from images

Image generation is synchronous from our point of view: the Worker calls PicX, blocks, and gets a permanent CDN URL back in one request. Video is not. H3 Max renders a clip over tens of seconds to a few minutes, so PicX answers the submit call **immediately with `202 Accepted`** and finishes the work out of band. That single fact reshapes the flow:

- We can't hold a Worker open waiting for the clip — Workers have a wall-clock budget and the user has a tab that needs to stay responsive.
- The result comes back to us on **our** webhook, not on the response to the submit.
- The browser therefore can't wait on PicX either. It polls **our own D1 row**, which the webhook writes.

So the shape is: *submit → 202 → store a `pending` video generation → tell the browser "queued" → PicX POSTs the finished clip to our callback → we complete or refund the row → the browser's next poll sees it.* The credit mechanics are identical to images (debit before the slow part, refund on failure); only the "slow part" is now an async round-trip through a webhook instead of a blocking call.

## 2. The model, in one paragraph

The clips come from **MiniMax H3 Max**, PicX id `minimax/h3-max` (`VIDEO_MODEL`). It is a *post-trained* H3 variant tuned for prompt adherence — **not** a higher tier, so there is no "S3" and no 2K/4K. Audio is always on (`VIDEO_HAS_AUDIO`). Clips run 5–15 seconds as an integer (`MIN_VIDEO_SECONDS` / `MAX_VIDEO_SECONDS`, default `DEFAULT_VIDEO_SECONDS`). Native resolutions are 480P and 768P; see §6 for why we only ship 480p.

### The three input routes

H3 Max sources its visual input three ways, and the second and third are the ones people get wrong:

| Route | `mode` | Meaning |
|---|---|---|
| text-to-video | `text` | No photo. The prompt alone drives the clip. |
| image-to-video | `image` | **This exact frame is frame one.** The clip animates outward from the picture you gave. |
| reference-to-video | `reference` | **This is what the character looks like — now make a *new* clip of them.** The picture is identity, not the opening frame. |

The `image` vs `reference` distinction is the single most misused part of the API, so state it plainly wherever it appears: animating the doodle we just produced is `image` (that doodle *is* frame one); making a fresh scene starring that doodle character is `reference` (the doodle only tells the model who the character is). Passing a reference where you meant an opening frame gets you a clip that *resembles* the input but doesn't *start* on it, which reads as a bug to the user and isn't one.

## 3. The submit contract

Doodle AI calls PicX's public API — the Worker holds the platform `PICX_API_KEY`, exactly as it does for images. Never a client credential.

```
POST https://api.picxstudio.com/v1/videos/generate
Authorization: Bearer <PICX_API_KEY>
Content-Type: application/json

{
  "model": "minimax/h3-max",
  "mode": "image",
  "prompt": "the doodle waves and blinks, warm light",
  "duration": 5,
  "resolution": "480p",
  "image_url": "https://cdn.picxstudio.com/api/generated/…png",   // mode=image
  "reference_urls": ["…"],                                        // mode=reference (≤10)
  "callback_url": "https://doodleai.art/api/v1/webhooks/picx-video"
}
```

PicX **always** answers `202 Accepted` — there is no synchronous success path — with:

```json
{
  "id": "vid_…",
  "status": "queued",
  "type": "video",
  "model": "minimax/h3-max",
  "poll_url": "https://api.picxstudio.com/v1/videos/vid_…",
  "events_url": "https://api.picxstudio.com/v1/videos/vid_…/events",
  "webhook": "https://doodleai.art/api/v1/webhooks/picx-video"
}
```

We keep `id` (PicX's job id) on the `generation` row so a later webhook or a manual `poll_url` check can be correlated back. We **do not** use `poll_url` in the normal path — polling PicX from the Worker would reintroduce the blocking we just escaped. `poll_url` is a debugging and reconciliation affordance, not the delivery mechanism.

## 4. The webhook contract

The finished clip arrives at `POST /api/v1/webhooks/picx-video`. This route is **not** session-authenticated — like the Stripe webhook, its only authentication is the signature.

### Signature verification

```
X-PicX-Signature: t=<unix>,v1=<hex>
```

The signature is `HMAC-SHA256` over the string `` `${t}.${rawBody}` `` keyed with the PicX webhook secret. Verification is non-negotiable and has three parts, all required:

1. **Constant-time compare** the computed hex against `v1`. A `===` string compare leaks timing and is a real signature-forgery vector; use a constant-time comparison.
2. **Freshness bound** on `t`. Reject a timestamp outside a small window (a few minutes) even if the HMAC matches, so a captured-and-replayed delivery can't be resubmitted indefinitely.
3. **Sign over the *raw* body.** Parse JSON only *after* the HMAC matches, from the exact bytes you hashed. Re-serialising a parsed object and hashing that will not match — key ordering and whitespace differ.

### Correlate on the signed body, never the URL

Correlate the delivery to a `generation` row on **`data.generation_id` inside the signed body** — never on a URL path parameter. The signature covers the body, not the URL. If the callback were `…/picx-video/<generationId>`, a genuine, correctly-signed delivery for clip A could be replayed against clip B's path and *still verify*, because the bytes that were signed never mentioned a path. It would then complete or refund the wrong generation. A single static callback URL plus body-based correlation closes that off. (This is the same lesson the image/Stripe paths already encode: the signature defines what's trustworthy, so trust only what it covers.)

### At-least-once delivery → the receiver must be idempotent

PicX delivers **at least once** and retries **up to three times** on a non-2xx (or no) response before marking the delivery **exhausted**. Two consequences the handler must respect:

- **Idempotent completion.** The same clip can arrive twice. Completing a `generation` that is already `ok` (or refunding one already `refunded`) must be a no-op, not a second CDN write or a second ledger row. Guard on the row's current `status`.
- **Answer 2xx once the delivery is authentic.** After the signature verifies and we've recorded the outcome, return `2xx` — even if we'd already processed this delivery. A non-2xx tells PicX to retry a delivery we've already handled, burning retries and eventually flipping it to exhausted for no reason. Reserve non-2xx for *actually unprocessable* deliveries (bad signature, malformed body).

### Payload shape

The completion body carries `data.generation_id` (our correlation key), a terminal `status`, and on success the clip URL. Read the fields defensively; treat the envelope keys as `id`/`status`/`data`, and pull the correlation id from `data.generation_id` specifically. On failure the body carries a terminal failed status and an error reason we store as `error_code`.

## 5. Credits and the refund flow

The ledger rules from [architecture.md §3](./architecture.md#3-the-credit-ledger) apply verbatim — append-only, debit-first, one `UNIQUE` idempotency key per write. Video only changes *when* the refund fires, because failure now arrives asynchronously.

**Pricing.** 1 internal credit per second of 480p video (`VIDEO_CREDITS_PER_SECOND["480p"]`), derived from the clamped duration server-side, never from a client number — so a 5s clip is 5 credits (`videoCreditCost`). Compare: an image is 1 credit flat. New accounts get 10 signup credits.

**The spend/refund path:**

```
submit:
  BEGIN
    check balance ≥ videoCreditCost(seconds)   → else 402
    INSERT generation (kind='video', status='pending', id=generationId)
    INSERT credit_ledger (delta = -cost, reason='generation',
                          idempotency_key = 'gen:'||generationId)
    UPDATE credit_balance -= cost
  COMMIT
  POST /v1/videos/generate  → 202, store PicX id on the row
  return { status: 'queued' } to the browser

webhook, success:
  verify sig → correlate on data.generation_id
  if row already terminal: return 2xx (idempotent no-op)
  UPDATE generation SET status='ok', output_url=<clip>, completed_at=now
  return 2xx

webhook, failure:
  verify sig → correlate on data.generation_id
  if row already terminal: return 2xx (idempotent no-op)
  INSERT credit_ledger (delta = +cost, reason='refund',
                        idempotency_key = 'refund:'||generationId)   ← the key
  UPDATE credit_balance += cost
  UPDATE generation SET status='refunded', error_code=<reason>
  return 2xx
```

**Why the refund idempotency key is `refund:<generationId>` and not something delivery-scoped.** Two independent things can decide a clip failed: the webhook (a `failed` delivery, possibly delivered twice), and the hourly sweep (a clip that never came back at all — §6). If each used its own key, a clip that both failed *and* was swept could refund twice. Because **both refund paths write the same `refund:<generationId>` key, and that column is `UNIQUE`**, the second insert hits the constraint, is caught, and is treated as success. The webhook and the sweep therefore *collapse onto one ledger row* — the user is refunded exactly once no matter which mechanism, or how many retries, gets there first. This is the whole reason the key is derived from the generation, not the event.

## 6. Two known gaps — state them, don't hide them

**768p is unreachable through the public API today.** H3 Max renders 768P natively and PicX prices it (`VIDEO_CREDITS_PER_SECOND["768p"]`), but PicX's *public request schema* pins `resolution` to `480p|720p|1080p`. So `768p` is rejected at parse time (422), and `720p` is rejected as unpriced for this model (400, "Resolution '720p' is not available"). 480p is the only tier that submits, so Doodle AI ships 480p (`VIDEO_RESOLUTIONS`). The 768p rate is kept in `constants.ts` so the day the upstream regex admits it, adding it is a one-line change on both sides rather than a re-derivation. It is **not** selectable until then — do not surface it in the UI.

**A lost webhook delivery is detected within an hour, not instantly.** The completion path is the webhook; the safety net is the same hourly reconciliation cron the ledger already runs. If a delivery is genuinely lost (all three retries exhausted, or a Worker crash that never returned 2xx), the clip's `generation` row sits `pending`. The sweep refunds video rows stuck `pending` past `VIDEO_TIMEOUT_MINUTES` (30 min — deliberately far past the image path's 10-minute window, because a 15s clip under load has been seen past 4 minutes and the image window would refund a clip that was still rendering). The refund uses `refund:<generationId>`, so if a late delivery *then* arrives, it collapses onto the same row (§5). Practical consequence to write down: **worst-case latency between a lost clip and its refund is one cron interval — up to an hour — not immediate.** That's an accepted trade, not a bug; instant detection would require polling PicX, which is exactly what the async design avoids.

## 7. Testing locally

You can exercise the whole loop without a public URL and without spending real credits carelessly.

**Submit path (unit / integration).** `videoCreditCost` and `clampVideoSeconds` are pure — assert directly: `clampVideoSeconds(3)` → 5 (floored to min), `clampVideoSeconds(20)` → 15 (capped), `videoCreditCost(5)` → 5, `videoCreditCost(15)` → 15. Assert the submit handler debits *before* calling PicX (stub the PicX client and check the ledger row exists at 202) and returns `queued`.

**Webhook signature.** The verifier is testable in isolation — the same Web Crypto HMAC the tutorial uses ([tutorials/picx-video-webhooks.md](./tutorials/picx-video-webhooks.md)). Sign a body with the shared secret, POST it to the local route, assert 2xx and a completed row. Then flip one byte of the body and assert non-2xx and *no* state change. Then send a stale `t` with a valid HMAC and assert the freshness bound rejects it.

**Idempotency.** POST the same authentic completion twice; assert exactly one `output_url` write and (for a failure body) exactly one `refund:<generationId>` ledger row. This is the test that actually protects money.

**End-to-end against a real clip.** Point `callback_url` at a tunnelled local Worker (`cloudflared tunnel` or `wrangler dev` behind a tunnel) and submit one real 5s clip (5 credits). Watch it arrive by webhook and land in the D1 `generation` row; confirm the browser's poll of our own row flips from `pending` to `ok`. Keep this to the occasional smoke run — every real submit spends credits.

**The sweep.** Insert a `pending` video row with a `createdAt` older than `VIDEO_TIMEOUT_MINUTES`, run the reconciliation job, and assert it refunded on `refund:<generationId>` and left a fresh (< 30 min) `pending` row alone.
