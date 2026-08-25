import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { creditBalanceOrg } from "../../../../db/schema/billing";
import { apiError, apiJson, requireOrg } from "../../../../lib/auth/guards";
import { createAuth } from "../../../../lib/auth";
import { newId, optStr, readJson } from "../../../../lib/api/body";
import { listOrgsForUser, orgDtoFor } from "../../../../lib/org/list";
import { transfer } from "../../../../lib/credits";
import type { OrgDto } from "../../../../lib/api/dto";

export const prerender = false;

const NAME_MAX_LEN = 60;

/** GET /api/v1/orgs — every team the caller belongs to (the switcher payload). */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;

  const db = getDb(context);
  const orgs = await listOrgsForUser(db, org.user.id);
  return apiJson({ orgs, activeOrgId: org.orgId });
}

/**
 * POST /api/v1/orgs — "Give your team a name".
 *
 * `transferCredits` seeds the new team from the creator's personal org
 * (`org_<userId>`, the deterministic id the signup hook and the backfill
 * migration both use): `true` moves the whole personal balance, a number
 * moves exactly that many. A failed transfer is reported but never rolls the
 * org back — the team exists either way, and credits can be moved later from
 * /team/settings.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const { user } = org;

  const body = (await readJson(context.request)) ?? {};
  const name = optStr(body.name)?.slice(0, NAME_MAX_LEN);
  if (!name) return apiError("bad_request", "Give the team a name.", 400);

  const auth = await createAuth(context);
  let created: { id: string } | null;
  try {
    created = (await auth.api.createOrganization({
      body: {
        name,
        slug: slugify(name),
        // `isPersonal` is deliberately not passed: it is declared with
        // `input: false` in the plugin config (src/lib/auth/index.ts), so the
        // endpoint refuses client-supplied values and falls back to its
        // `defaultValue: false` — which is exactly what a team created
        // through the UI should be. Only the signup hook and the backfill
        // migration ever set it true.
        keepCurrentActiveOrganization: true,
      },
      headers: context.request.headers,
    })) as { id: string } | null;
  } catch (err) {
    return apiError("create_failed", messageOf(err, "Couldn't create that team."), 400);
  }
  if (!created?.id) return apiError("create_failed", "Couldn't create that team.", 500);

  const db = getDb(context);

  const amount = await resolveTransferAmount(db, body.transferCredits, `org_${user.id}`);
  let transferError: string | null = null;
  if (amount > 0) {
    const result = await transfer(db, {
      fromOrgId: `org_${user.id}`,
      toOrgId: created.id,
      amount,
      userId: user.id,
      transferId: newId(),
    });
    if (!result.ok) transferError = "Not enough credits in your personal balance — the team was created without them.";
  }

  try {
    await auth.api.setActiveOrganization({
      body: { organizationId: created.id },
      headers: context.request.headers,
    });
  } catch {
    // The team exists; failing to make it active is recoverable from the
    // switcher, so it isn't worth failing the whole request over.
  }

  const dto = await orgDtoFor(db, user.id, created.id);
  return apiJson({ org: dto ?? fallbackDto(created.id, name), ...(transferError ? { warning: transferError } : {}) }, 201);
}

async function resolveTransferAmount(
  db: ReturnType<typeof getDb>,
  raw: unknown,
  personalOrgId: string,
): Promise<number> {
  if (raw === true) {
    const rows = await db
      .select({ balance: creditBalanceOrg.balance })
      .from(creditBalanceOrg)
      .where(eq(creditBalanceOrg.organizationId, personalOrgId));
    return Math.max(0, rows[0]?.balance ?? 0);
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 0;
}

/**
 * Better Auth requires a unique slug and has no "derive one for me" mode, so
 * the name is normalised and given a short random suffix — two teams called
 * "Acme" must both be creatable.
 */
function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "team";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

function messageOf(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}

function fallbackDto(id: string, name: string): OrgDto {
  return { id, name, slug: id, role: "owner", isPersonal: false, balance: 0, memberCount: 1 };
}
