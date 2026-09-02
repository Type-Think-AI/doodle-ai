/* Sanitised error responses for /api/**.
 *
 * There is exactly one rule this module exists to enforce: an UNEXPECTED
 * exception never describes itself to the client. A caught `err` carries
 * whatever the thrower felt like saying — an upstream provider's raw response
 * body, a driver's SQL fragment, a table or column name, an env var name, a
 * file path from a bundled stack — and every one of those is reconnaissance a
 * client has no business receiving.
 *
 * So the real error goes to `console.error` (the existing server-side pattern,
 * visible in `wrangler tail`), and the client gets two things instead:
 *
 *   - a STABLE machine `code`, which is what both the web client and the
 *     future mobile client branch on (see docs/mobile-strategy.md);
 *   - a human-readable `message` written HERE, by us, at the call site — never
 *     derived from the exception.
 *
 * The wire shape is unchanged and deliberately not re-implemented: the nested
 * envelope is built by `apiError` in src/lib/auth/guards.ts, which is the one
 * envelope constructor the whole API already shares. This module is a
 * sanitising layer in front of it, not a second contract.
 *
 * Scope note — this is for UNEXPECTED failures only. A deliberate, user-facing
 * validation refusal ("A team needs at least one owner.", "This team still
 * holds 3 credits.") is authored copy, not a leak, and keeps calling `apiError`
 * directly.
 */

import { apiError } from "../auth/guards";

/**
 * Which error shape the route already puts on the wire.
 *
 * `"nested"` — `{ error: { code, message } }`. The /api/v1, /api/admin and
 *              /api/share contract; what api-client.ts's `ApiErrorBody` and
 *              every `body.error?.message` call site in src/scripts read.
 * `"flat"`   — `{ error: "message" }`. The older shape /api/upload, /api/chat
 *              and /api/agent use; their callers read `data.error` as a string.
 *
 * Both are listed because both exist in shipped clients. Neither is being
 * migrated here — an error-leak audit is the wrong change to fold a wire
 * break into.
 */
export type ErrorEnvelope = "nested" | "flat";

export interface SafeErrorInit {
  /** Stable, machine-readable. Clients branch on this, never on `message`. */
  code: string;
  /** Safe, human-readable, authored at the call site. Never from the error. */
  message: string;
  /** The status the route already returned for this failure. Preserved as-is. */
  status: number;
  /** Defaults to the /api/v1 nested envelope. */
  envelope?: ErrorEnvelope;
}

/**
 * Log the real failure server-side, return a sanitised response to the client.
 *
 *   try {
 *     await auth.api.createOrganization({ ... });
 *   } catch (err) {
 *     return safeError("POST /api/v1/orgs", err, {
 *       code: "create_failed",
 *       message: "Couldn't create that team.",
 *       status: 400,
 *     });
 *   }
 *
 * `scope` is a "METHOD /path" tag so a line in `wrangler tail` identifies the
 * route without a stack. `cause` is logged and otherwise never read — nothing
 * derived from it reaches the response.
 *
 * There is deliberately no `details` parameter. `apiError` supports one and
 * several routes use it for figures the client needs (a credit balance, the
 * role that was insufficient), but those are intentional payloads on
 * intentional refusals. Threading a details bag through the sanitiser would
 * reopen the exact hole it closes.
 */
export function safeError(scope: string, cause: unknown, init: SafeErrorInit): Response {
  // The one place the untruncated truth is written down. Passing `cause`
  // itself, not a string, so the runtime prints the stack when it has one.
  console.error(`${scope} failed [${init.code}]:`, cause);

  if (init.envelope === "flat") {
    return new Response(JSON.stringify({ error: init.message }), {
      status: init.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return apiError(init.code, init.message, init.status);
}

/** What an unrecognisable stored error string collapses to. */
const DEFAULT_ERROR_CODE = "generation_failed";

/**
 * A stable machine code, or null — for the `errorCode` column on `generation`
 * and `batch_item` rows on their way OUT to a client.
 *
 * That column is written by four producers with two different disciplines.
 * Three write a fixed token (`admin_canceled`, `sweep_stuck_running`,
 * `reconcile_stuck_pending`). The other two — the PicX webhook and the
 * generation tool — write `error_message` / a caught error's message, sliced
 * to 200 chars: free-form text from upstream, or from us, that was never
 * written for a client to read.
 *
 * Storing it is fine and useful; the admin media drawer shows it verbatim and
 * that is the point of keeping it. Serving it to the owning team over
 * /api/v1/batches or /api/v1/videos/:id is the leak, so the filter lives at
 * the read boundary rather than at the write: an allow-list on SHAPE, letting
 * through only what looks like a machine code and collapsing everything else.
 *
 * A snake_case token carries no internal detail by construction — no spaces,
 * no punctuation, no slashes or colons for a path or URL to survive in, and no
 * uppercase for a SHOUTED env var name to pass as. Anything with prose in it
 * fails the test and becomes `generation_failed`.
 */
export function safeErrorCode(
  raw: string | null | undefined,
  fallback: string = DEFAULT_ERROR_CODE,
): string | null {
  if (!raw) return null;
  return /^[a-z][a-z0-9_]{0,63}$/.test(raw) ? raw : fallback;
}
