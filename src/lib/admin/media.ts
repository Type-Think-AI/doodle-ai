/**
 * Admin media queries — the generated-image gallery.
 *
 * Lists rows from `generation` joined to `user`, filtered by status / skill /
 * free-text, newest first, paginated. Chip counts are computed with real
 * queries (never hardcoded), and a single-row detail lookup drives the drawer.
 *
 * Imports directly from the domain modules, NOT the queries barrel, so this
 * module stays self-contained and adds nothing to that barrel's export surface.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { user } from "../../db/schema/auth";
import { generation } from "../../db/schema/product";
import { GENERATION_MODES } from "../doodle-constants";
import { num } from "./shared";

/** The four outcome buckets the status chips filter on. `all` is the no-filter case. */
export type MediaStatusFilter = "all" | "ok" | "failed" | "pending";

/** DB `status` values that the "Failed" chip should include (failed + refunded). */
const FAILED_STATUSES = ["failed", "refunded"] as const;

export interface AdminMediaRow {
  id: string;
  skillId: string;
  styleId: string | null;
  status: string;
  outputUrl: string | null;
  prompt: string;
  creditsCharged: number;
  createdAt: Date;
  userName: string;
  userEmail: string;
}

export interface MediaListResult {
  rows: AdminMediaRow[];
  total: number;
  statusCounts: Record<MediaStatusFilter, number>;
  /** Per-skill counts under the CURRENT status + search filter, so the skill chips stay honest. */
  skillCounts: Record<string, number>;
}

/** Full detail for one generation, for the drawer. */
export interface AdminMediaDetail {
  id: string;
  skillId: string;
  styleId: string | null;
  status: string;
  prompt: string;
  outputUrl: string | null;
  /** Parsed from the `outputUrls` JSON *string* column, defensively. Empty when absent/malformed. */
  outputUrls: string[];
  sourceAssetUrl: string | null;
  refAssetUrl: string | null;
  creditsCharged: number;
  errorCode: string | null;
  createdAt: Date;
  completedAt: Date | null;
  /** completedAt - createdAt in milliseconds, or null when still pending. */
  durationMs: number | null;
  userId: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
}

/** Map a status-filter chip to the SQL predicate over `generation.status`. */
function statusPredicate(filter: MediaStatusFilter) {
  if (filter === "all") return undefined;
  if (filter === "failed") return sql`${generation.status} IN ('failed', 'refunded')`;
  return eq(generation.status, filter);
}

/**
 * The media gallery list.
 *
 * A single indexed join `generation` -> `user` (one user per generation, so no
 * row multiplication). Chip counts run as a small `db.batch` of aggregates
 * rather than being derived from the page slice, which would only ever reflect
 * the 48 visible rows.
 */
export async function listMedia(
  db: Db,
  opts: { status?: MediaStatusFilter; skill?: string; q?: string; limit?: number; offset?: number } = {},
): Promise<MediaListResult> {
  const { status = "all", limit = 48, offset = 0 } = opts;
  const skill = opts.skill && (GENERATION_MODES as readonly string[]).includes(opts.skill) ? opts.skill : undefined;
  const q = opts.q?.trim().toLowerCase() || undefined;

  // Shared predicates. The status/skill/search filters constrain both the page
  // slice and the skill-chip counts; the status-chip counts deliberately ignore
  // the status filter (so each status chip shows its own total under the other
  // active filters), matching the UsersPage segment-count convention.
  const searchPredicate = q
    ? sql`(LOWER(${generation.prompt}) LIKE ${`%${q}%`} OR LOWER(${user.email}) LIKE ${`%${q}%`})`
    : undefined;
  const skillPredicate = skill ? eq(generation.skillId, skill) : undefined;

  const listFilters = [statusPredicate(status), skillPredicate, searchPredicate].filter(Boolean);
  const listWhere = listFilters.length > 0 ? and(...listFilters) : undefined;

  const rows = await db
    .select({
      id: generation.id,
      skillId: generation.skillId,
      styleId: generation.styleId,
      status: generation.status,
      outputUrl: generation.outputUrl,
      prompt: generation.prompt,
      creditsCharged: generation.creditsCharged,
      createdAt: generation.createdAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(generation)
    .innerJoin(user, eq(generation.userId, user.id))
    .where(listWhere)
    .orderBy(desc(generation.createdAt))
    .limit(limit)
    .offset(offset);

  // `total` counts the CURRENT filter (drives pagination). Status-chip counts
  // hold skill+search fixed but vary the status, so each chip is its own bucket.
  const statusScope = [skillPredicate, searchPredicate].filter(Boolean);
  const statusScopeWhere = (extra: ReturnType<typeof statusPredicate>) => {
    const parts = [...statusScope, extra].filter(Boolean);
    return parts.length > 0 ? and(...parts) : undefined;
  };

  const [totalRows, allRows, okRows, failedRows, pendingRows] = await db.batch([
    db.select({ n: count() }).from(generation).innerJoin(user, eq(generation.userId, user.id)).where(listWhere),
    db
      .select({ n: count() })
      .from(generation)
      .innerJoin(user, eq(generation.userId, user.id))
      .where(statusScopeWhere(undefined)),
    db
      .select({ n: count() })
      .from(generation)
      .innerJoin(user, eq(generation.userId, user.id))
      .where(statusScopeWhere(eq(generation.status, "ok"))),
    db
      .select({ n: count() })
      .from(generation)
      .innerJoin(user, eq(generation.userId, user.id))
      .where(statusScopeWhere(sql`${generation.status} IN ('failed', 'refunded')`)),
    db
      .select({ n: count() })
      .from(generation)
      .innerJoin(user, eq(generation.userId, user.id))
      .where(statusScopeWhere(eq(generation.status, "pending"))),
  ]);

  // Skill-chip counts: honour the full current filter set EXCEPT the skill one
  // (so picking a skill doesn't zero out the other skill chips), grouped by skill.
  const skillScope = [statusPredicate(status), searchPredicate].filter(Boolean);
  const skillScopeWhere = skillScope.length > 0 ? and(...skillScope) : undefined;
  const skillRows = await db
    .select({ skillId: generation.skillId, n: count() })
    .from(generation)
    .innerJoin(user, eq(generation.userId, user.id))
    .where(skillScopeWhere)
    .groupBy(generation.skillId);

  const skillCounts: Record<string, number> = {};
  for (const r of skillRows) skillCounts[r.skillId] = num(r.n);

  return {
    rows,
    total: num(totalRows[0]?.n),
    statusCounts: {
      all: num(allRows[0]?.n),
      ok: num(okRows[0]?.n),
      failed: num(failedRows[0]?.n),
      pending: num(pendingRows[0]?.n),
    },
    skillCounts,
  };
}

/** Defensively parse the `outputUrls` JSON *string* column into an array of URLs. */
function parseOutputUrls(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

export async function getMediaDetail(db: Db, generationId: string): Promise<AdminMediaDetail | null> {
  const rows = await db
    .select({
      id: generation.id,
      skillId: generation.skillId,
      styleId: generation.styleId,
      status: generation.status,
      prompt: generation.prompt,
      outputUrl: generation.outputUrl,
      outputUrls: generation.outputUrls,
      sourceAssetUrl: generation.sourceAssetUrl,
      refAssetUrl: generation.refAssetUrl,
      creditsCharged: generation.creditsCharged,
      errorCode: generation.errorCode,
      createdAt: generation.createdAt,
      completedAt: generation.completedAt,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(generation)
    .innerJoin(user, eq(generation.userId, user.id))
    .where(eq(generation.id, generationId))
    .limit(1);

  const found = rows[0];
  if (!found) return null;

  const durationMs =
    found.completedAt && found.createdAt ? found.completedAt.getTime() - found.createdAt.getTime() : null;

  return {
    id: found.id,
    skillId: found.skillId,
    styleId: found.styleId,
    status: found.status,
    prompt: found.prompt,
    outputUrl: found.outputUrl,
    outputUrls: parseOutputUrls(found.outputUrls),
    sourceAssetUrl: found.sourceAssetUrl,
    refAssetUrl: found.refAssetUrl,
    creditsCharged: num(found.creditsCharged),
    errorCode: found.errorCode,
    createdAt: found.createdAt,
    completedAt: found.completedAt,
    durationMs: durationMs !== null && durationMs >= 0 ? durationMs : null,
    userId: found.userId,
    userName: found.userName,
    userEmail: found.userEmail,
    userImage: found.userImage,
  };
}

/** "1.4s" / "820ms" / "1m 03s" — human-readable generation duration for the drawer. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}
