/* Frozen response shapes for the B2B team layer's API surface.
 *
 * This file exists so the API routes and the UI can be built in parallel
 * without either side blocking on the other — every route that returns one
 * of these types should import it from here rather than re-declaring an
 * inline shape, and every client-side controller should treat this file as
 * the source of truth for what a fetch() call returns.
 *
 * Timestamps are epoch milliseconds on the wire (matching ThreadDto,
 * MoodboardItemDto, etc. in the existing src/pages/api/v1/*.ts routes) —
 * never a Date, never an ISO string.
 */

export type OrgRole = "owner" | "producer" | "artist" | "reviewer" | "client";

export interface OrgDto {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  isPersonal: boolean;
  balance: number;
  memberCount: number;
}

export interface MemberDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: OrgRole;
  /** Sum of this member's `generation`-reason spend over the last 30 days. */
  spend30d: number;
  joinedAt: number;
}

export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

export interface InvitationDto {
  id: string;
  email: string;
  role: OrgRole;
  status: InvitationStatus;
  /** Present only in the response to the route that created it — a link isn't stored, it's derived. */
  inviteUrl?: string;
  createdAt: number;
  expiresAt: number;
}

export interface InviteLinkDto {
  id: string;
  url: string;
  role: OrgRole;
  maxUses: number | null;
  uses: number;
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

export type ProjectStatus = "active" | "archived";

export interface ProjectDto {
  id: string;
  name: string;
  brief: string | null;
  status: ProjectStatus;
  assetCount: number;
  createdAt: number;
  updatedAt: number;
}

export type AssetKind = "generation" | "reference" | "upload";
export type ReviewState = "draft" | "in_review" | "changes_requested" | "approved";

export interface AssetDto {
  id: string;
  url: string;
  kind: AssetKind;
  name: string | null;
  projectId: string | null;
  reviewState: ReviewState;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdBy: string;
  createdAt: number;
}

export type ShareScope = "project" | "asset";

export interface ShareLinkDto {
  id: string;
  url: string;
  scope: ShareScope;
  allowComments: boolean;
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

/** The public, unauthenticated view returned by GET /s/:token. Never includes member emails or names. */
export interface SharedProjectViewDto {
  projectName: string;
  orgName: string;
  assets: { id: string; url: string; name: string | null; reviewState: ReviewState }[];
  allowComments: boolean;
}

export type BatchJobStatus = "queued" | "running" | "done" | "failed" | "canceled";
export type BatchItemStatus = "queued" | "running" | "ok" | "failed" | "canceled";

export interface BatchItemDto {
  idx: number;
  status: BatchItemStatus;
  outputUrl: string | null;
  errorCode: string | null;
}

export interface BatchDto {
  id: string;
  status: BatchJobStatus;
  skillId: string;
  variantCount: number;
  creditsReserved: number;
  items: BatchItemDto[];
  createdAt: number;
  completedAt: number | null;
}

/** GET /api/v1/me — the single hydration call for both api-client.ts and sidebar.ts. */
export interface MeDto {
  user: { id: string; email: string; name: string; image: string | null; emailVerified: boolean };
  org: OrgDto;
  orgs: OrgDto[];
}
