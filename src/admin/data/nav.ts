/* Admin navigation and page copy.
 *
 * Moved out of ./dummy.ts because none of it is placeholder data — these are
 * the console's real routes. `dummy.ts` still re-exports NAV and PAGE_COPY
 * from here so nothing that imported them from there breaks, but new code
 * should import from this file: anything left in dummy.ts is, by convention,
 * fake and destined for a SampleBadge.
 *
 * `badge` is deliberately absent from every item. The old NAV hardcoded
 * "4.8k" on Users and "3" on Marketing, which looked like live counts and
 * were not. Real counts are resolved per-request by resolveNavBadges() in
 * src/lib/admin/queries.ts and merged in by the Sidebar, so a badge either
 * shows a true number or shows nothing.
 */

export interface AdminNavItem {
  key: string;
  label: string;
  href: string;
  /** Hidden from 'support' — pages whose whole purpose is a privileged action. */
  adminOnly?: boolean;
}

export interface AdminNavGroup {
  group: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    group: "Monitor",
    items: [{ key: "overview", label: "Overview", href: "/admin" }],
  },
  {
    group: "People",
    items: [
      { key: "users", label: "Users", href: "/admin/users" },
      { key: "orgs", label: "Teams", href: "/admin/orgs" },
      { key: "projects", label: "Projects", href: "/admin/projects" },
    ],
  },
  {
    group: "Platform",
    items: [
      { key: "skills", label: "Skills", href: "/admin/skills" },
      { key: "credits", label: "Credits", href: "/admin/credits" },
      { key: "batches", label: "Batch jobs", href: "/admin/batches" },
    ],
  },
  {
    group: "Business",
    items: [
      { key: "billing", label: "Billing", href: "/admin/billing" },
      { key: "marketing", label: "Marketing", href: "/admin/marketing" },
    ],
  },
  {
    group: "System",
    items: [
      { key: "feedback", label: "Feedback", href: "/admin/feedback" },
      { key: "audit", label: "Audit log", href: "/admin/audit-log", adminOnly: true },
    ],
  },
];

export const ADMIN_PAGE_COPY: Record<string, { title: string; subtitle: string }> = {
  overview: { title: "Overview", subtitle: "Growth, usage, and platform health at a glance." },
  users: { title: "Users", subtitle: "Everyone who has signed up to Doodle AI." },
  orgs: { title: "Teams", subtitle: "Every organization, its members, and its credit pool." },
  projects: { title: "Projects", subtitle: "Every project created across all teams." },
  skills: { title: "Skills", subtitle: "AI doodle skills available on the platform." },
  credits: { title: "Credits", subtitle: "Issued vs. used credits, and manual grants." },
  batches: { title: "Batch jobs", subtitle: "Variant runs, their items, and anything stuck." },
  billing: { title: "Billing", subtitle: "Subscriptions, invoices, and revenue." },
  marketing: { title: "Marketing", subtitle: "Articles, SEO performance, and campaigns." },
  feedback: { title: "Feedback", subtitle: "What users told us, and what we did about it." },
  audit: { title: "Audit log", subtitle: "Every privileged admin action, append-only." },
};

/** Icon keys the Sidebar has an SVG for. Any new nav item needs one added there. */
export const ADMIN_NAV_KEYS = ADMIN_NAV.flatMap((g) => g.items.map((i) => i.key));
