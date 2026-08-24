# Doodle AI — Mobile Strategy

> **Status:** design note for a future phase. Nothing here is implemented yet.
> **Prerequisites:** [architecture.md](./architecture.md) · [roadmap.md](./roadmap.md) (start after Phase 4)

## Principle

**One backend, two clients.** The mobile app consumes the exact same `/api/v1/*` surface the web app uses. No mobile-specific backend, no duplicated business logic, no second credit system. Two decisions in the web build make this possible, and both are cheap now and expensive later:

1. **Bearer tokens accepted alongside cookies from day one** (Phase 2).
2. **Credits are server-authoritative** — the client displays a balance, it never computes one.

## Stack

| | Choice | Why |
|---|---|---|
| Framework | **Expo** (React Native) | One codebase for iOS + Android, OTA updates, and the camera/media-library modules we need are first-party |
| Auth | **Better Auth bearer tokens** + refresh | Same auth service as web. `expo-secure-store` for the token (Keychain / Keystore), never `AsyncStorage`. |
| OAuth | `expo-auth-session` | Google/Apple. **Apple Sign-In is mandatory** on iOS if any other social sign-in is offered — App Store guideline 4.8. |
| Camera / photos | `expo-camera`, `expo-image-picker` | Mirrors the existing `src/scripts/app/media-picker.ts` flow |
| Networking | `fetch` + TanStack Query | Caching, retries, offline-aware refetch |
| Store billing | `expo-in-app-purchases` or **RevenueCat** | See the commercial section below — this is the hard part |
| Push | `expo-notifications` | "Your doodle is ready", re-engagement |

## Auth flow

```
Sign in ──POST /api/auth/sign-in/email  (or OAuth via expo-auth-session)
       ──▶ { token, refreshToken, user }
       ──▶ expo-secure-store

Every request ── Authorization: Bearer <token>

401 ──▶ POST /api/auth/refresh ──▶ retry once ──▶ still 401 ──▶ sign out
```

Refresh must be **single-flight**: if five requests 401 at once, one refresh runs and the other four wait on it. Otherwise the refresh token is burned four times over and the user is signed out mid-session for no reason.

Nothing above needs a new endpoint. That is the entire payoff of enabling bearer tokens in Phase 2 rather than bolting them on when the mobile app starts.

## Credits are server-authoritative

The app reads the balance from `GET /api/v1/me` and from the `credits` event on the chat stream. It **never** decrements a local counter to feel responsive — an optimistic balance that disagrees with the server produces support tickets about "missing credits" that are impossible to debug.

Insufficient credits surface as a `402` with `code: "insufficient_credits"` — the same contract the web app handles, so the error mapping is shared logic.

## The commercial trap

**This is the part that changes the business model, and it needs deciding before the app is built, not after.**

Apple and Google take **15–30%** of in-app purchases. Consumable credits bought inside an app generally **must** go through their IAP systems — you cannot link out to a web checkout to avoid the cut. Apple's rules here have shifted through litigation and vary by jurisdiction, so **verify the current guidelines at build time rather than trusting anything written here**.

Three options:

| Option | How it works | Trade-off |
|---|---|---|
| **A. IAP with mobile-specific pricing** | Credits cost more in-app to absorb the 30% | Simplest and safest. Users notice the price difference; be upfront about it. |
| **B. Consume-only mobile** | Credits are purchased on the web; the app spends them | Zero store cut, but a genuinely worse funnel — and it's rule-sensitive, since apps generally may not steer users to external purchase. |
| **C. Hybrid** | IAP in-app, plus web purchase for users who find it | Best economics, most compliance surface area. |

**Recommendation: A for launch.** Get approved, ship, learn. Revisit once there's revenue worth optimizing.

Whichever is chosen, **credits granted through IAP must land in the same ledger** as Stripe purchases — same `credit_ledger` table, `reason='purchase'`, with the store transaction id as the idempotency key. **RevenueCat** is the recommended layer here: it validates Apple/Google receipts server-side and gives us a single webhook to consume, rather than us implementing and maintaining two separate receipt-validation paths. That webhook writes to the ledger exactly as the Stripe one does.

Receipt validation happens **server-side**. A client-reported "purchase succeeded" is not a grant.

## Streaming

`/api/v1/chat` returns NDJSON. React Native's `fetch` doesn't expose a streaming body by default, so:

- **Preferred:** `react-native-fetch-api` or `expo/fetch`'s streaming support, which gives a real `ReadableStream` and lets the existing NDJSON parser in `src/scripts/app/chat.ts` be ported nearly verbatim.
- **Fallback:** add a `?stream=false` variant that buffers and returns a single JSON response. Less pleasant UX (a spinner instead of streaming text) but zero client complexity — and worth having anyway as a debugging aid.

Generation takes tens of seconds, so if the app is backgrounded mid-request the connection dies. Pair long generations with a push notification on completion, and make `GET /api/v1/generations` the recovery path so a killed connection never means a lost, already-paid-for image.

## Shared code

Worth extracting into a shared package once mobile starts:

- API client types and the error-code enum
- Skill/mode definitions and their credit costs (currently `GENERATION_MODES` and `THEMES` in `src/lib/doodle-constants.ts`)
- Prompt builders, if generation ever moves partly client-side

Not worth sharing: UI. Astro pages with hand-written CSS and React Native have nothing meaningful in common, and a forced abstraction over both will be worse than two implementations.

## What web must get right first

| Web decision | Why mobile depends on it |
|---|---|
| Bearer tokens in Phase 2 | Otherwise mobile needs a whole second auth path |
| `/api/v1` versioning | Shipped app versions live in users' pockets for months; breaking v1 breaks them |
| Uniform error codes | Shared error handling instead of two divergent mappings |
| Server-authoritative credits | Optimistic local balances are unfixable once they drift |
| Ledger idempotency keys | IAP grants reuse the exact same mechanism as Stripe |
