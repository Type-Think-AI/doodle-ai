/**
 * WebSocket entry point for the roadmap board: GET /api/roadmap/connect/:room
 *
 * This route is the security boundary for the whole board. It resolves who the
 * caller is, converts that into a tldraw sync permission pair, and hands the
 * socket to the room's Durable Object. The DO never re-derives permissions —
 * see the note on `RoadmapRoom.connect`.
 *
 * Room ids are validated against an allow-list rather than taken from the URL,
 * because a Durable Object id is derived from a name: accepting arbitrary names
 * would let anyone mint unlimited rooms (and unlimited SQLite storage) just by
 * hitting this endpoint with new strings.
 */
import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../../../db/schema";
import { optionalAuth } from "../../../../lib/auth/guards";
import { ROADMAP_PERMISSIONS, resolveTier } from "../../../../roadmap/access";

export const prerender = false;

/**
 * The boards that exist. One for now; kept as a set so adding a second board
 * (say a per-release wall) is a one-line change rather than an invitation to
 * accept any id.
 */
const ROOMS = new Set(["public-v6", "team-v1"]);

export async function GET(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env?.ROADMAP_ROOM) {
    // astro dev runs on Vite, not workerd, so there is no Durable Object
    // namespace to reach. Say so plainly instead of failing as a broken socket.
    return new Response(
      "Roadmap sync requires the Workers runtime — run `pnpm dev` (wrangler), not `pnpm dev:local`.",
      { status: 503 },
    );
  }

  const roomId = context.params.room ?? "";
  if (!ROOMS.has(roomId)) return new Response("Unknown room", { status: 404 });

  if (context.request.headers.get("upgrade") !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }

  /* Identity -> tier. A signed-out visitor still gets a socket, at the 'view'
     tier: the roadmap is public and readable without an account, which is the
     point of building in the open. What they do not get is any write path. */
  const user = await optionalAuth(context);

  let platformRole: string | null = null;
  if (user) {
    // Read the role from D1 rather than the session, matching
    // src/lib/auth/admin-guard.ts: a demoted maintainer must lose edit access
    // immediately, not whenever their session next refreshes.
    const db = drizzle(env.DB, { schema });
    const row = await db
      .select({ platformRole: schema.user.platformRole })
      .from(schema.user)
      .where(eq(schema.user.id, user.id))
      .get();
    platformRole = row?.platformRole ?? null;
  }

  const tier = resolveTier(user?.id ?? null, platformRole);
  const { isReadonly, objectAccess } = ROADMAP_PERMISSIONS[tier];
  /* A session id identifies one browser TAB to the sync protocol, not one user.
     Signed-in users get a per-tab id prefixed with their user id so presence can
     be attributed; anonymous viewers get an opaque random one. Never the bare
     user id: two tabs sharing a session id fight over a single sync session. */
  const sessionId = `${user?.id ?? "anon"}:${crypto.randomUUID()}`;

  const stub = env.ROADMAP_ROOM.get(env.ROADMAP_ROOM.idFromName(roomId));

  /* A brand-new Request, NOT a forward of the caller's.
   *
   * Two reasons, both load-bearing:
   *  - a WebSocket cannot cross Durable Object RPC (DataCloneError), so the
   *    socket has to come back from the DO's own fetch handler;
   *  - because none of the client's headers are copied here, the permission
   *    headers below cannot be spoofed from a browser. Forwarding
   *    `context.request` would hand an attacker a way to set
   *    x-roadmap-readonly: false on their own connection.
   */
  return stub.fetch(
    new Request("https://roadmap.internal/connect", {
      headers: {
        upgrade: "websocket",
        "x-roadmap-session": sessionId,
        "x-roadmap-readonly": String(isReadonly),
        "x-roadmap-object-access": objectAccess,
        /* Identity for the per-record ownership authorizer. Sent here, and only
           here, because this is the one place that has actually authenticated
           the caller — the DO must never re-derive it, and the browser cannot
           inject it (see the note above about building a fresh Request). */
        "x-roadmap-user": user?.id ?? "",
        "x-roadmap-admin": String(tier === "edit"),
      },
    }),
  );
}
