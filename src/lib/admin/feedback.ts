/**
 * Admin feedback queries — list, counts, triage status.
 */
import { count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { organization, user } from "../../db/schema/auth";
import { feedback } from "../../db/schema/product";
import { num } from "./shared";

/* ------------------------------------------------------------------ *
 * Feedback
 * ------------------------------------------------------------------ */

export interface AdminFeedbackRow {
  id: string;
  text: string;
  status: string;
  createdAt: Date;
  triagedAt: Date | null;
  userName: string;
  userEmail: string;
  userImage: string | null;
  orgName: string | null;
  triagedByName: string | null;
}

export async function listFeedback(
  db: Db,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: AdminFeedbackRow[]; counts: Record<string, number> }> {
  const { status, limit = 50, offset = 0 } = opts;

  const triager = sql<string | null>`(
    SELECT ${user.name} FROM ${user} WHERE ${user.id} = ${feedback.triagedBy}
  )`;

  const rows = await db
    .select({
      id: feedback.id,
      text: feedback.text,
      status: feedback.status,
      createdAt: feedback.createdAt,
      triagedAt: feedback.triagedAt,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
      orgName: organization.name,
      triagedByName: triager.as("triaged_by_name"),
    })
    .from(feedback)
    .innerJoin(user, eq(feedback.userId, user.id))
    .leftJoin(organization, eq(feedback.organizationId, organization.id))
    .where(status && status !== "all" ? eq(feedback.status, status) : undefined)
    .orderBy(desc(feedback.createdAt))
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ status: feedback.status, n: count() })
    .from(feedback)
    .groupBy(feedback.status);

  const counts: Record<string, number> = { all: 0, new: 0, reviewing: 0, resolved: 0, wont_fix: 0 };
  for (const r of countRows) {
    counts[r.status] = num(r.n);
    counts.all += num(r.n);
  }

  return {
    rows: rows.map((r) => ({
      ...r,
      orgName: r.orgName ?? null,
      triagedByName: r.triagedByName ?? null,
    })),
    counts,
  };
}
