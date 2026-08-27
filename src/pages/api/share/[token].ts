import type { APIContext } from "astro";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db/client";
import { organization } from "../../../db/schema/auth";
import { asset, project, shareLink } from "../../../db/schema/product";
import { board, boardItem } from "../../../db/schema/boards";
import { apiError, apiJson, requireOrg } from "../../../lib/auth/guards";
import { kvIncrement } from "../../../lib/kv-counter";
import { isReviewState } from "../../../lib/api/asset-dto";
import type { ReviewState, SharedProjectViewDto } from "../../../lib/api/dto";

export const prerender = false;

/**
 * Draft work is never exposed to a client — only what someone on the team
 * deliberately moved into review or approved. This is the whole reason the
 * share view has its own query rather than reusing the authed asset list.
 */
const VISIBLE_STATES: ReviewState[] = ["in_review", "approved"];

/** Requests per IP per minute against this unauthenticated endpoint. */
const SHARE_VIEWS_PER_MINUTE = 60;

function gone(): Response {
  // One response for "no such token", "revoked" and "expired" alike: a
  // client following a dead link learns only that it is dead, and someone
  // guessing tokens learns nothing about which guesses were close.
  return apiError("not_found", "This link isn't available.", 404);
}

/**
 * GET /api/share/:token — UNAUTHENTICATED, public.
 *
 * Possession of the token is the entire credential (there is no email
 * channel to carry a second factor), so this endpoint is enumerable by
 * construction and is rate-limited by IP with the same kvIncrement() fixed
 * window every other limiter in this codebase uses.
 *
 * It returns image URLs, an org name and a project name — never a member's
 * name or email, never `createdBy`/`reviewedBy`, never a draft.
 */
export async function GET(context: APIContext): Promise<Response> {
  const token = context.params.token;
  if (!token) return gone();

  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  const sessions = env?.SESSIONS;
  if (sessions) {
    const ip = context.request.headers.get("CF-Connecting-IP") ?? "unknown";
    const bucket = Math.floor(Date.now() / 60_000);
    const count = await kvIncrement(sessions, `ratelimit:share:${ip}:${bucket}`, 120);
    if (count > SHARE_VIEWS_PER_MINUTE) {
      return apiError("rate_limited", "Too many requests — try again in a moment.", 429);
    }
  }

  const db = getDb(context);
  const links = await db.select().from(shareLink).where(eq(shareLink.token, token)).limit(1);
  const link = links[0];
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() <= Date.now())) return gone();

  const orgs = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, link.organizationId))
    .limit(1);
  const orgName = orgs[0]?.name ?? "";

  if (link.scope === "board") {
    if (!link.boardId) return gone();
    const boardRows = await db
      .select({ id: board.id, name: board.name, archivedAt: board.archivedAt })
      .from(board)
      .where(eq(board.id, link.boardId))
      .limit(1);
    const boardRow = boardRows[0];
    if (!boardRow) return gone();
    // Archived boards still resolve — the owner archived it, the link was not revoked.

    const items = await db
      .select({
        id: boardItem.id,
        url: boardItem.url,
        note: boardItem.note,
        width: boardItem.width,
        height: boardItem.height,
      })
      .from(boardItem)
      .where(eq(boardItem.boardId, link.boardId))
      .orderBy(desc(boardItem.createdAt));

    return apiJson({
      scope: "board",
      boardName: boardRow.name,
      orgName,
      allowComments: link.allowComments,
      items: items.map((i) => ({
        id: i.id,
        url: i.url,
        note: i.note,
        width: i.width,
        height: i.height,
      })),
    });
  }

  if (link.scope === "asset") {
    if (!link.assetId) return gone();
    const rows = await db
      .select()
      .from(asset)
      .where(and(eq(asset.id, link.assetId), inArray(asset.reviewState, VISIBLE_STATES)))
      .limit(1);
    const row = rows[0];
    if (!row) return gone();
    const view: SharedProjectViewDto = {
      projectName: row.name ?? "Shared image",
      orgName,
      assets: [
        {
          id: row.id,
          url: row.url,
          name: row.name,
          reviewState: isReviewState(row.reviewState) ? row.reviewState : "in_review",
        },
      ],
      allowComments: link.allowComments,
    };
    return apiJson(view);
  }

  if (!link.projectId) return gone();
  const projects = await db.select().from(project).where(eq(project.id, link.projectId)).limit(1);
  const row = projects[0];
  if (!row) return gone();

  const rows = await db
    .select({ id: asset.id, url: asset.url, name: asset.name, reviewState: asset.reviewState })
    .from(asset)
    .where(and(eq(asset.projectId, link.projectId), inArray(asset.reviewState, VISIBLE_STATES)))
    .orderBy(desc(asset.createdAt));

  const view: SharedProjectViewDto = {
    projectName: row.name,
    orgName,
    assets: rows.map((a) => ({
      id: a.id,
      url: a.url,
      name: a.name,
      reviewState: isReviewState(a.reviewState) ? a.reviewState : "in_review",
    })),
    allowComments: link.allowComments,
  };
  return apiJson(view);
}

/**
 * DELETE /api/share/:token — revoke.
 *
 * Revoking stops *this link* resolving. It does not un-publish the images:
 * their PicX CDN URLs are permanent and public by construction. The share
 * dialog says so in as many words; do not soften it here either.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { share: ["revoke"] });
  if (org instanceof Response) return org;
  const token = context.params.token;
  if (!token) return gone();

  const db = getDb(context);
  const revoked = await db
    .update(shareLink)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLink.token, token), eq(shareLink.organizationId, org.orgId)))
    .returning({ id: shareLink.id });

  if (revoked.length === 0) return gone();
  return apiJson({ ok: true });
}
