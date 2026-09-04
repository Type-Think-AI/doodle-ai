/* Voice capability token — the auth boundary for the voice WebSocket.
 *
 * The browser opens the voice socket directly to the Durable Object (via
 * @cloudflare/voice's useVoiceAgent), which never sees the Better Auth session
 * cookie the way an Astro API route does. So the browser first calls a
 * server route (POST /api/voice/token) that resolves the session with
 * requireOrg and mints a SHORT-LIVED, signed capability token carrying the
 * resolved userId + orgId. The token rides on the socket as a `?token=` query
 * param; VoiceRoom.beforeCallStart verifies it and refuses the call otherwise.
 *
 * The token is bearer — anyone holding it can start a call as that user until
 * it expires — so it is deliberately short-lived (minutes) and only ever minted
 * for an already-authenticated caller. HMAC-SHA256 over BETTER_AUTH_SECRET,
 * mirroring the crypto.subtle pattern in src/pages/api/webhooks/picx.ts.
 */

import { readSecret } from "../secrets";

export interface VoiceTokenClaims {
  /** Authenticated user id. */
  uid: string;
  /** Active organization id (whose credits a generation would spend). */
  oid: string;
  /** Unix seconds expiry. */
  exp: number;
}

/** Token lifetime — long enough to open a call, short enough to limit replay. */
const TOKEN_TTL_SECONDS = 120;

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Constant-time compare of two equal-length byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Resolve the signing secret. Reuses BETTER_AUTH_SECRET — the same trust root
 * that signs the session this token stands in for. Throws if unset so a
 * misconfigured deploy fails loudly rather than minting unsigned tokens.
 */
async function resolveSecret(env: Env): Promise<string> {
  const secret = await readSecret(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET");
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not configured; cannot sign voice tokens.");
  return secret;
}

/** Mint a signed `<payload>.<mac>` token for an authenticated caller. */
export async function mintVoiceToken(
  env: Env,
  claims: { uid: string; oid: string },
): Promise<string> {
  const secret = await resolveSecret(env);
  const full: VoiceTokenClaims = {
    uid: claims.uid,
    oid: claims.oid,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(new Uint8Array(mac))}`;
}

/**
 * Verify a token and return its claims, or null if invalid/expired/tampered.
 * Never throws on bad input — a malformed token is simply rejected.
 */
export async function verifyVoiceToken(env: Env, token: string | null | undefined): Promise<VoiceTokenClaims | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const macPart = token.slice(dot + 1);

  let secret: string;
  try {
    secret = await resolveSecret(env);
  } catch {
    return null;
  }

  try {
    const key = await hmacKey(secret);
    const expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
    );
    const provided = b64urlDecode(macPart);
    if (!timingSafeEqual(expected, provided)) return null;

    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as VoiceTokenClaims;
    if (typeof claims.uid !== "string" || typeof claims.oid !== "string" || typeof claims.exp !== "number") {
      return null;
    }
    if (claims.exp < Math.floor(Date.now() / 1000)) return null; // expired
    return claims;
  } catch {
    return null;
  }
}
