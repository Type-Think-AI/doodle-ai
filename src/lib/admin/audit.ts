/* The admin audit trail.
 *
 * Every mutating /api/admin endpoint calls `recordAudit` in the same request
 * that performs the action. The table is append-only — nothing in this file
 * updates or deletes a row, by the same reasoning as the credit ledger.
 *
 * Deliberately NOT best-effort-with-a-swallowed-error for the actions that
 * move credits or change roles: if the audit write fails there, the caller
 * should know the action happened without a record, rather than discovering
 * the gap months later during an incident. `recordAudit` therefore throws,
 * and each call site decides whether that is fatal. See the note on ordering
 * in POST /api/admin/credits/grant.
 */
import type { APIContext } from "astro";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { adminAuditLog, user } from "../../db/schema/auth";

export type AuditAction =
  | "credits.grant"
  | "user.role.change"
  | "skill.state.change"
  | "feedback.triage"
  | "org.limits.change"
  // Pushing URLs to IndexNow reaches a third party under this host's identity
  // and spends a shared rate-limit budget, so it is audited like any other
  // privileged action. The forced variant is a separate action rather than a
  // flag in `detail`: it is the one that can plausibly earn a 429, and it should
  // be greppable in the log without opening every row.
  | "seo.indexnow.sync"
  | "seo.indexnow.sync.force"
  // Reading Bing index status spends a third-party API budget and writes
  // verdicts, so it is audited like the push side.
  | "seo.bing.refresh";

export interface AuditWrite {
  actorUserId: string;
  action: AuditAction;
  /** 'seo' targets a sync batch id rather than a row in one of the other tables. */
  targetType?: "user" | "organization" | "skill" | "generation" | "feedback" | "seo";
  targetId?: string;
  detail?: Record<string, unknown>;
  /** Taken from CF-Connecting-IP; see `clientIp`. */
  ipAddress?: string | null;
}

export async function recordAudit(db: Db, write: AuditWrite): Promise<void> {
  await db.insert(adminAuditLog).values({
    id: `aud_${crypto.randomUUID()}`,
    actorUserId: write.actorUserId,
    action: write.action,
    targetType: write.targetType ?? null,
    targetId: write.targetId ?? null,
    detail: write.detail ?? null,
    ipAddress: write.ipAddress ?? null,
    createdAt: new Date(),
  });
}

/**
 * The caller's IP as Cloudflare sees it.
 *
 * `CF-Connecting-IP` is set by the edge and cannot be spoofed by the client,
 * unlike `X-Forwarded-For` which is a client-supplied header anyone can
 * write. Only the former is trusted here; the fallback exists for `astro dev`
 * where neither is present.
 */
export function clientIp(context: APIContext): string | null {
  return context.request.headers.get("CF-Connecting-IP") ?? null;
}

export interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
}

/**
 * LEFT JOIN, not INNER: `actor_user_id` has no foreign key (see
 * migrations/0009) precisely so the trail survives the actor's account being
 * deleted. An INNER JOIN would hide exactly the rows most worth keeping.
 */
export async function listAudit(db: Db, limit = 100, offset = 0): Promise<AuditRow[]> {
  const rows = await db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetId: adminAuditLog.targetId,
      detail: adminAuditLog.detail,
      ipAddress: adminAuditLog.ipAddress,
      createdAt: adminAuditLog.createdAt,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(adminAuditLog)
    .leftJoin(user, eq(adminAuditLog.actorUserId, user.id))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...r,
    detail: (r.detail as Record<string, unknown> | null) ?? null,
    actorName: r.actorName ?? null,
    actorEmail: r.actorEmail ?? null,
  }));
}

/** Human-readable one-liner for the audit table's description column. */
export function describeAudit(row: AuditRow): string {
  const d = row.detail ?? {};
  switch (row.action) {
    case "credits.grant":
      return `Granted ${d.amount ?? "?"} credits to ${d.targetEmail ?? row.targetId} (${d.orgId ?? "unknown org"})`;
    case "user.role.change":
      return `Changed ${d.targetEmail ?? row.targetId} from ${d.from ?? "?"} to ${d.to ?? "?"}`;
    case "skill.state.change":
      return `Set ${row.targetId} to ${d.state ?? "?"}${d.featured ? " (featured)" : ""}`;
    case "feedback.triage":
      return `Marked feedback ${row.targetId} as ${d.status ?? "?"}`;
    case "org.limits.change":
      return `Updated limits for ${d.orgName ?? row.targetId}`;
    default:
      return row.action;
  }
}
