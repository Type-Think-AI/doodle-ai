/**
 * A fixed-window counter on top of Workers KV, shared by every rate limiter
 * in this codebase (Better Auth's own `rateLimit.storage: "secondary-storage"`
 * in src/lib/auth/index.ts, and the per-user generation limit in
 * src/mastra/tools/generate-doodle.ts) so there is exactly one
 * read-modify-write implementation to reason about, not one per call site.
 *
 * KV has no atomic increment primitive, so this is a plain read followed by
 * a write — two concurrent increments for the same key can race and
 * under-count by one. That's an accepted trade-off for a rate limiter: the
 * failure mode is "occasionally allows one extra request through," never
 * "blocks a request that should have been allowed," and it avoids needing a
 * Durable Object just to count.
 */
export async function kvIncrement(kv: KVNamespace, key: string, ttlSeconds: number): Promise<number> {
  const current = await kv.get(key);
  const next = (current ? Number.parseInt(current, 10) : 0) + 1;
  await kv.put(key, String(next), { expirationTtl: ttlSeconds });
  return next;
}
