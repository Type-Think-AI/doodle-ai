/**
 * Compatibility barrel — preserves every existing import path.
 *
 * All query logic now lives in domain modules:
 *   ./shared.ts    — formatting helpers (num, compact, thousands, formatUsd, formatDate, relativeTime, polylinePoints, fillDailyGaps, truncate)
 *   ./overview.ts  — overview totals, charts, funnel, activity feed, attention items
 *   ./users.ts     — user list, detail, segments
 *   ./billing.ts   — ledger, invoices, credit totals, orgs, resolvePersonalOrgId
 *   ./feedback.ts  — feedback list with triage counts
 *   ./projects.ts  — projects, skills, batches, nav badges
 *
 * Consumers continue importing from '../../lib/admin/queries' unchanged.
 */

// Shared helpers
export {
  compact,
  fillDailyGaps,
  formatDate,
  formatUsd,
  num,
  polylinePoints,
  relativeTime,
  thousands,
  truncate,
} from "./shared";
export type { DailyPoint } from "./shared";

// Overview
export {
  getActivationFunnel,
  getCreditsByWeek,
  getGenerationsByDay,
  getNeedsAttention,
  getOverviewTotals,
  getRecentActivity,
  getSkillMix,
} from "./overview";
export type {
  ActivityEvent,
  AttentionItem,
  FunnelStage,
  OverviewTotals,
  SkillMixSlice,
  WeeklyCredits,
} from "./overview";

// Users
export { getUserDetail, listUsers } from "./users";
export type {
  AdminUserDetail,
  AdminUserRow,
  UserListResult,
  UserSegment,
  UserSort,
} from "./users";

// Billing (credits, orgs, invoices)
export {
  getBillingTotals,
  getCreditTotals,
  listInvoices,
  listLedger,
  listOrgs,
  resolvePersonalOrgId,
} from "./billing";
export type {
  AdminInvoiceRow,
  AdminLedgerRow,
  AdminOrgRow,
  BillingTotals,
  CreditTotals,
} from "./billing";

// Feedback
export { listFeedback } from "./feedback";
export type { AdminFeedbackRow } from "./feedback";

// Projects, skills, batches, nav
export {
  getProjectStats,
  getSkillStats,
  listBatches,
  listProjects,
  resolveNavBadges,
} from "./projects";
export type {
  AdminBatchRow,
  AdminProjectRow,
  AdminSkillRow,
  ProjectStats,
} from "./projects";
