/* POST /api/voice/token — mint a short-lived voice capability token.
 *
 * The voice WebSocket connects straight to the VoiceRoom Durable Object, which
 * cannot read the Better Auth session cookie the way an API route can. So the
 * browser calls this route first: requireOrg resolves the authenticated user
 * and their active org (enforcing the same generation permission the chat path
 * uses), and we hand back a signed token the browser passes on the socket. The
 * DO verifies that token in beforeCallStart. No session = no token = no call.
 */

import type { APIContext } from "astro";
import { requireOrg } from "../../../lib/auth/guards";
import { mintVoiceToken } from "../../../lib/voice/token";

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  // Same gate the HTTP chat path uses — an unauthenticated or non-member
  // caller, or one whose role can't create generations, never gets a token.
  const org = await requireOrg(context, { generation: ["create"] });
  if (org instanceof Response) return org;

  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env) {
    return new Response(JSON.stringify({ error: "runtime_unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = await mintVoiceToken(env, { uid: org.user.id, oid: org.orgId });
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
