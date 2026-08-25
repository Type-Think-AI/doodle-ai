/* Access control for the team/organization layer.
 *
 * Vocabulary warning: Better Auth's `organization` plugin has its own,
 * different concept called a "team" — a sub-group *inside* an organization
 * (`team` / `team_member` tables, `activeTeamId`). We never enable that
 * (`teams: { enabled: true }` stays off in src/lib/auth/index.ts). In this
 * codebase and in the product, "team" means the Better Auth
 * **organization** — one paying account, its members, its shared credit
 * pool. Keep that straight when reading the plugin's own docs.
 *
 * Roles are the five from marketing/b2b.md §"Product C — Studio Workspace":
 * owner, producer, artist, reviewer, client. The plugin's own default role
 * set (owner/admin/member) does not apply here — `member.role` must always
 * be one of the five below; nothing in this file falls back to the
 * plugin's literal `"member"` default, so every invite/join call site must
 * pass `role` explicitly.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, ownerAc } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  project: ["create", "read", "update", "delete"],
  generation: ["create"],
  asset: ["create", "read", "update", "delete"],
  reference: ["create", "read", "update", "delete"],
  review: ["submit", "approve", "request-changes"],
  share: ["create", "revoke"],
  credits: ["read", "transfer"],
  batch: ["create", "cancel"],
} as const;

export const ac = createAccessControl(statement);

/** Owner: everything, including org delete and moving credits between orgs. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  project: ["create", "read", "update", "delete"],
  generation: ["create"],
  asset: ["create", "read", "update", "delete"],
  reference: ["create", "read", "update", "delete"],
  review: ["submit", "approve", "request-changes"],
  share: ["create", "revoke"],
  credits: ["read", "transfer"],
  batch: ["create", "cancel"],
});

/** Producer: runs the studio day-to-day. Everything but org delete/transfer. */
export const producer = ac.newRole({
  ...adminAc.statements,
  project: ["create", "read", "update", "delete"],
  generation: ["create"],
  asset: ["create", "read", "update", "delete"],
  reference: ["create", "read", "update", "delete"],
  review: ["submit", "approve", "request-changes"],
  share: ["create", "revoke"],
  credits: ["read"],
  batch: ["create", "cancel"],
});

/** Artist: generates and submits work, can't manage members or billing. */
export const artist = ac.newRole({
  project: ["read"],
  generation: ["create"],
  asset: ["create", "read", "update"],
  reference: ["create", "read"],
  review: ["submit"],
  batch: ["create", "cancel"],
  credits: ["read"],
});

/** Reviewer: internal QA — approves or requests changes, never generates. */
export const reviewer = ac.newRole({
  project: ["read"],
  asset: ["read"],
  reference: ["read"],
  review: ["approve", "request-changes"],
  credits: ["read"],
});

/** Client: external stakeholder — read + approve only. No credits visibility. */
export const client = ac.newRole({
  project: ["read"],
  asset: ["read"],
  review: ["approve", "request-changes"],
});

export const roles = { owner, producer, artist, reviewer, client } as const;

export type OrgRole = keyof typeof roles;

export const ORG_ROLES: OrgRole[] = ["owner", "producer", "artist", "reviewer", "client"];

export function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as string[]).includes(value);
}
