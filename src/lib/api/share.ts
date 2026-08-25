/* Share-link plumbing shared by POST /projects/:id/share and POST /assets/:id/share.
 *
 * Both routes mint the same row shape and both must render the same public
 * URL, so the token alphabet and the `<origin>/s/<token>` convention live
 * here rather than being written twice and drifting.
 */
import type { ShareLinkDto } from "./dto";
import type { shareLink } from "../../db/schema/product";

/**
 * A URL-safe, unguessable token. 20 base32 characters ≈ 100 bits of entropy
 * from crypto.getRandomValues — the link *is* the credential for an
 * unauthenticated client-review page, so this is deliberately far wider than
 * anything an enumeration sweep could cover (and GET /api/share/:token is
 * IP-rate-limited on top).
 */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** Days -> epoch Date, or null for "never expires". */
export function expiryFromDays(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const days = Math.min(Math.floor(value), 365);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function toShareLinkDto(row: typeof shareLink.$inferSelect, origin: string): ShareLinkDto {
  return {
    id: row.id,
    url: `${origin}/s/${row.token}`,
    scope: row.scope === "asset" ? "asset" : "project",
    allowComments: row.allowComments,
    expiresAt: row.expiresAt?.getTime() ?? null,
    revokedAt: row.revokedAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
  };
}
