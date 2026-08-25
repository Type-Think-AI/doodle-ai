/**
 * One accessor for both kinds of secret this Worker can be given.
 *
 * Cloudflare offers two mechanisms, and this project uses both at once —
 * deliberately, not as a migration halfway house:
 *
 *  - **Per-Worker secrets** (`wrangler secret put`, and `.dev.vars` locally).
 *    These arrive on `env` as plain strings. This is the only shape that
 *    works under `astro dev`, because Secrets Store bindings created with
 *    `--remote` are not readable from local development.
 *
 *  - **Secrets Store bindings** (`secrets_store_secrets` in wrangler.json).
 *    Account-level secrets, defined once and bound into any number of
 *    Workers, so prod and staging share one source of truth instead of two
 *    drifting copies of `wrangler secret put`. These arrive on `env` as an
 *    object with an async `get()`.
 *
 * Reading both through this function means the call sites don't care which
 * one is configured, and switching a secret from one mechanism to the other
 * is a wrangler.json change with no code change. It also makes the migration
 * reversible: if a Secrets Store binding is wrong, dropping back to
 * `wrangler secret put` for that one secret is enough to recover.
 *
 * Precedence note: a Secrets Store binding and a per-Worker secret cannot
 * share a name on the same Worker — Cloudflare rejects the deploy — so there
 * is no ambiguity to resolve here, only two shapes to accept.
 */

/** The Secrets Store binding shape (`env.MY_SECRET.get()`). */
export interface SecretsStoreBinding {
  get(): Promise<string>;
}

/** Either shape a secret can arrive in, or nothing at all. */
export type SecretLike = string | SecretsStoreBinding | undefined | null;

function isSecretsStoreBinding(value: unknown): value is SecretsStoreBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SecretsStoreBinding).get === "function"
  );
}

/**
 * Resolve a secret to a trimmed string, or `undefined` if it is absent or
 * blank. Never throws: a Secrets Store `get()` that fails (binding present
 * but the secret was deleted from the store, or the Worker lost access to
 * it) resolves to `undefined`, so callers keep their existing "not
 * configured" branch instead of gaining a new crash path. The failure is
 * logged rather than swallowed silently, because a broken binding looks
 * exactly like a missing secret from the outside and that is a genuinely
 * confusing thing to debug from a 503.
 */
export async function readSecret(source: SecretLike, name?: string): Promise<string | undefined> {
  if (!source) return undefined;

  if (typeof source === "string") {
    return source.trim() || undefined;
  }

  if (isSecretsStoreBinding(source)) {
    try {
      const value = await source.get();
      return typeof value === "string" ? value.trim() || undefined : undefined;
    } catch (error) {
      console.error(
        `Secrets Store binding${name ? ` for ${name}` : ""} failed to resolve. ` +
          `Check that the secret still exists in the store and that the Worker ` +
          `binding points at it.`,
        error,
      );
      return undefined;
    }
  }

  return undefined;
}

/**
 * Resolve several secrets in one pass. Runs the `get()` calls concurrently,
 * so binding N secrets costs one round trip rather than N sequential ones —
 * which matters on the auth path, where three are needed before Better Auth
 * can be constructed at all.
 */
export async function readSecrets<K extends string>(
  sources: Record<K, SecretLike>,
): Promise<Record<K, string | undefined>> {
  const names = Object.keys(sources) as K[];
  const values = await Promise.all(names.map((name) => readSecret(sources[name], name)));
  return Object.fromEntries(names.map((name, i) => [name, values[i]])) as Record<
    K,
    string | undefined
  >;
}
