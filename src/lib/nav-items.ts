/* Single source of truth for the app shell's navigation — consumed by both
   Sidebar.astro (desktop rail) and MobileNav.astro (bottom tab bar) so their
   icons, labels, and ordering can't drift apart the way they previously did
   (MobileNav had hand-copied icons and was missing the Characters tab and
   the "New chat" action entirely). */

export type NavKey =
  | "chat"
  | "characters"
  | "boards"
  | "skills"
  | "showcase"
  | "settings"
  | "roadmap";

export interface NavItem {
  key: NavKey;
  href: string;
  /** Full label — sidebar rows, where width isn't constrained. */
  label: string;
  /** Shorter label for the bottom tab bar, where five items share the width. */
  shortLabel: string;
  /** Hide from the compact mobile tab bar but keep in the desktop rail. */
  mobile?: boolean;
  /** Inline SVG path/shape markup, viewBox 0 0 24 24. */
  icon: string;
  /** If set, this item starts a named section group in the sidebar. */
  section?: string;
}

export const NEW_CHAT_ITEM: NavItem = {
  key: "chat",
  href: "/",
  label: "New chat",
  shortLabel: "Chat",
  icon: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
};

export const NAV_ITEMS: NavItem[] = [
  {
    key: "boards",
    href: "/boards",
    label: "Boards",
    shortLabel: "Boards",
    section: "Library",
    // Two stacked rectangles reading as a set of boards, not a single photo —
    // the old Moodboards icon was a picture frame, which described one image.
    icon: '<rect x="3.5" y="4.5" width="10" height="8" rx="2" stroke="currentColor" stroke-width="1.6"/><rect x="10.5" y="11.5" width="10" height="8" rx="2" stroke="currentColor" stroke-width="1.6"/>',
  },
  {
    key: "characters",
    href: "/characters",
    label: "Characters",
    shortLabel: "Characters",
    icon: '<circle cx="12" cy="8.5" r="3.5" stroke="currentColor" stroke-width="1.6"/><path d="M5 20c1.3-3.8 4.3-5.8 7-5.8s5.7 2 7 5.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  },
  {
    key: "skills",
    href: "/skills",
    label: "Skills",
    shortLabel: "Skills",
    icon: '<circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="16" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M10.4 10.4 13.6 13.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  },
  {
    key: "showcase",
    href: "/showcase",
    label: "Showcase",
    shortLabel: "Clips",
    /* Sits next to Skills because both answer the same question — "what can this
       thing make?" — and it is deliberately IN the mobile tab bar rather than
       desktop-only. 23 of 27 skills output stills, so a phone visitor who never
       sees a clip play has no way to learn that the app animates anything, which
       is the entire reason this page exists. Fifth tab, which is the width this
       bar was designed for (see shortLabel's doc comment above). */
    icon: '<rect x="3.5" y="5" width="17" height="14" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 9.8v4.4l4-2.2-4-2.2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  },
  {
    key: "roadmap",
    href: "/roadmap",
    label: "Roadmap",
    shortLabel: "Roadmap",
    // Desktop rail only: the board is a live multi-user canvas, and a phone tab
    // bar is not where anyone wants to start dragging sticky notes around.
    mobile: false,
    icon: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M8 8.5h3M8 12h5M8 15.5h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  },
  {
    key: "settings",
    href: "/settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" stroke="currentColor" stroke-width="1.8"/>',
  },
];
