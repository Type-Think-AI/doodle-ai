/* Request-body plumbing shared by the /api/v1 routes.
 *
 * Deliberately hand-rolled rather than zod: the payloads here are flat
 * mirrors of the localStorage shapes, and the routes need to coerce and clamp
 * (title length, page size) as much as validate. Anything richer than this
 * should reach for zod, which is already a dependency.
 */

/** Parse a JSON body, or null if it is absent/malformed — never throws. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function optStr(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : null;
}

export function strArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((v): v is string => typeof v === "string");
  return out.length > 0 ? out : null;
}

/** Timestamps cross the wire as epoch ms; the schema stores them as Dates. */
export function toDate(value: unknown, fallback: number): Date {
  return new Date(typeof value === "number" && Number.isFinite(value) ? value : fallback);
}

/** A positive integer query param, clamped — used for page sizes and cursors. */
export function intParam(url: URL, name: string, fallback: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function newId(): string {
  return crypto.randomUUID();
}
