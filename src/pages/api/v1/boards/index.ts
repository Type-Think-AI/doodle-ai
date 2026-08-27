import type { APIContext } from "astro";
import { getDb } from "../../../../db/client";
import { board } from "../../../../db/schema/boards";
import { apiError, apiJson, requireOrg } from "../../../../lib/auth/guards";
import { newId, optStr, readJson } from "../../../../lib/api/body";
import { getOrCreateInbox, listBoards, toBoardDetail } from "../../../../lib/boards/queries";
import { BOARD_KINDS, BOARD_VIEW_MODES } from "../../../../db/schema/boards";

export const prerender = false;

const NAME_MAX_LEN = 120;
const DESC_MAX_LEN = 2000;

/**
 * GET /api/v1/boards — all boards the caller owns or is a member of.
 *
 * Each entry includes a 4-item cover mosaic and a total item count.
 * The inbox is always pinned first, and is auto-created if absent.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;

  const db = getDb(context);

  // Ensure the inbox exists before listing.
  await getOrCreateInbox(db, org.user.id, org.orgId);

  const boards = await listBoards(db, org.user.id, org.orgId);
  return apiJson({ boards });
}

/**
 * POST /api/v1/boards — create a custom board.
 *
 * `{ name, description?, viewMode? }`
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;

  const body = await readJson(context.request);
  const name = body ? optStr(body.name) : null;
  if (!name) return apiError("bad_request", "`name` is required.", 400);

  const viewMode = body?.viewMode;
  if (viewMode && !BOARD_VIEW_MODES.includes(viewMode as any)) {
    return apiError("bad_request", "`viewMode` must be 'grid' or 'canvas'.", 400);
  }

  const now = new Date();
  const values = {
    id: newId(),
    organizationId: org.orgId,
    createdBy: org.user.id,
    name: name.slice(0, NAME_MAX_LEN),
    description: optStr(body?.description)?.slice(0, DESC_MAX_LEN) ?? null,
    kind: "custom",
    viewMode: (viewMode as string) ?? "grid",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof board.$inferInsert;

  const db = getDb(context);
  await db.insert(board).values(values);

  return apiJson({ board: toBoardDetail(values as unknown as typeof board.$inferSelect) }, 201);
}
