import { RequestContext } from "@mastra/core/request-context";
import { drizzle } from "drizzle-orm/d1";
import { schema, type Db } from "../../db/client";
import { readSecret } from "../secrets";
import { EMPTY_DIGEST, type CanvasDigest } from "../canvas/ops";

/**
 * The exact key/value shape the doodle agent's tools read off the
 * RequestContext. Declared once here so the HTTP chat path
 * (`src/pages/api/chat.ts`) and the voice Durable Object build an *identical*
 * context — this module is the single source of truth for that shape, so the
 * two entry points can never drift (a tool that works over HTTP works over
 * voice, and a new context key added for a tool is added in one place).
 */
export interface VoiceRequestContextShape {
  platformPicxKey?: string;
  styleId?: string;
  /* Art family (doodle / anime styles). Optional and additive: unset resolves
     to an empty hint, so a caller that never sends it is unchanged. */
  familyId?: string;
  userId: string;
  organizationId: string;
  projectId?: string;
  canvasDigest?: CanvasDigest;
  db: Db;
  sessions?: KVNamespace;
  /**
   * Public origin of THIS deployment. `generate-video.ts` builds its webhook
   * callback URL from it, and refuses to spend a credit when it is not a
   * public https origin — a clip PicX cannot deliver would sit pending until
   * the sweep refunded it, which reads to the user as a silent failure.
   */
  publicOrigin?: string;
}

/** Everything the voice DO must supply to build a context the tools accept. */
export interface BuildVoiceRequestContextParams {
  /** The Durable Object's bindings — a DO holds `env` directly, not an APIContext. */
  env: Env;
  userId: string;
  organizationId: string;
  styleId?: string;
  familyId?: string;
  projectId?: string;
  /** Serialized canvas digest; parsing/validation is the caller's job. Defaults to an empty board. */
  canvasDigest?: CanvasDigest;
  /**
   * Public https origin the voice session's webhooks should call back on. A DO
   * has no incoming request URL to derive this from, so the caller passes it
   * (or `PICX_CALLBACK_ORIGIN` is used, matching the HTTP path's precedence).
   */
  publicOrigin?: string;
}

/**
 * Build the RequestContext the doodle agent runs with, for the voice Durable
 * Object.
 *
 * This mirrors the `new RequestContext<{...}>([...])` that
 * `src/pages/api/chat.ts` builds inline, key-for-key, so that a generation
 * driven by voice reaches the tools with the same platform PicX key, credit
 * scoping, canvas digest, db handle and callback origin as one driven by the
 * HTTP chat endpoint. The one difference is the *source* of the bindings: a DO
 * is handed `env` directly, so the D1 client is built from `env.DB` (rather
 * than `getDb(context)`, which needs an APIContext), the SESSIONS KV comes off
 * `env.SESSIONS`, and the PicX key / callback origin are read off `env` via the
 * same `readSecret` accessor that accepts both per-Worker and Secrets Store
 * shapes.
 *
 * NOTE: `chat.ts` still builds its own context inline today; a later refactor
 * can have it call this. This lane only introduces the shared seam.
 */
export async function buildVoiceRequestContext(
  params: BuildVoiceRequestContextParams,
): Promise<RequestContext<VoiceRequestContextShape>> {
  const { env, userId, organizationId, styleId, familyId, projectId } = params;
  const canvasDigest = params.canvasDigest ?? EMPTY_DIGEST;

  // PICX_API_KEY may be a Secrets Store binding, so resolve it to a plain
  // string here — RequestContext carries plain values, not thunks. Same as
  // chat.ts, which resolves it before constructing the context.
  const platformPicxKey = await readSecret(env.PICX_API_KEY, "PICX_API_KEY");

  // A DO has no request origin, so PICX_CALLBACK_ORIGIN (if set) wins, then the
  // explicit `publicOrigin` the caller supplies. There is deliberately no
  // `new URL(request.url).origin` fallback here — there is no request.
  const publicOrigin =
    (await readSecret(env.PICX_CALLBACK_ORIGIN, "PICX_CALLBACK_ORIGIN"))?.trim() ||
    params.publicOrigin;

  // Build the Drizzle client straight off the DO's D1 binding — the DO
  // equivalent of getDb(context), which resolves the same env.DB out of an
  // APIContext's locals.
  const db: Db = drizzle(env.DB, { schema });

  return new RequestContext<VoiceRequestContextShape>([
    ["platformPicxKey", platformPicxKey],
    ["styleId", styleId],
    ["familyId", familyId],
    ["userId", userId],
    ["organizationId", organizationId],
    ["projectId", projectId],
    ["canvasDigest", canvasDigest],
    ["db", db],
    // Same SESSIONS KV binding Better Auth uses as secondaryStorage — passed
    // through so generate-doodle.ts can rate-limit generations per user and
    // per org without a second KV namespace.
    ["sessions", env.SESSIONS],
    ["publicOrigin", publicOrigin],
  ]);
}
