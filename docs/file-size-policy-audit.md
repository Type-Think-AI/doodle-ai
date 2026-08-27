# File-size policy audit

Generated from tracked application source on 2026-08-27 using the project thresholds:

- Astro page: max 150 LOC
- Astro component: max 300 LOC
- TypeScript controller: max 300 LOC
- TypeScript library module: max 250 LOC
- CSS: max 400 LOC

Generated/support artifacts are excluded from refactor priority.

## Summary

| Category | Violations |
|---|---:|
| Astro pages | 5 |
| Astro components | 10 |
| TypeScript controllers | 4 |
| TypeScript library modules | 7 |
| CSS | 1 |
| **Total** | **27** |

## Astro pages over 150 LOC

| LOC | Over | File |
|---:|---:|---|
| 437 | +287 | `/Users/yash/Projects/doodle-ai/src/pages/c/[id].astro` |
| 210 | +60 | `/Users/yash/Projects/doodle-ai/src/pages/settings.astro` |
| 195 | +45 | `/Users/yash/Projects/doodle-ai/src/pages/learn/index.astro` |
| 169 | +19 | `/Users/yash/Projects/doodle-ai/src/pages/characters.astro` |
| 157 | +7 | `/Users/yash/Projects/doodle-ai/src/pages/terms-of-service.astro` |

## Astro components over 300 LOC

| LOC | Over | File |
|---:|---:|---|
| 773 | +473 | `/Users/yash/Projects/doodle-ai/src/admin/pages/OverviewPage.astro` |
| 708 | +408 | `/Users/yash/Projects/doodle-ai/src/components/Footer.astro` |
| 516 | +216 | `/Users/yash/Projects/doodle-ai/src/admin/components/UserDrawer.astro` |
| 486 | +186 | `/Users/yash/Projects/doodle-ai/src/admin/components/Sidebar.astro` |
| 460 | +160 | `/Users/yash/Projects/doodle-ai/src/components/app/Sidebar.astro` |
| 431 | +131 | `/Users/yash/Projects/doodle-ai/src/components/app/AuthDialog.astro` |
| 343 | +43 | `/Users/yash/Projects/doodle-ai/src/layouts/ArticleLayout.astro` |
| 339 | +39 | `/Users/yash/Projects/doodle-ai/src/components/Navbar.astro` |
| 338 | +38 | `/Users/yash/Projects/doodle-ai/src/admin/pages/CreditsPage.astro` |
| 333 | +33 | `/Users/yash/Projects/doodle-ai/src/admin/pages/BillingPage.astro` |

## TypeScript controllers over 300 LOC

| LOC | Over | File | Note |
|---:|---:|---|---|
| 827 | +527 | `/Users/yash/Projects/doodle-ai/src/scripts/app/chat.ts` | Legacy monolith; new `chat/` modules now exist |
| 342 | +42 | `/Users/yash/Projects/doodle-ai/src/scripts/app/chat/index.ts` | New orchestrator; extract wiring further if needed |
| 318 | +18 | `/Users/yash/Projects/doodle-ai/src/scripts/app/composer-mentions.ts` | Split trigger detection/popover/rendering |
| 306 | +6 | `/Users/yash/Projects/doodle-ai/src/scripts/app/chat-store.ts` | Split storage schema and CRUD |

## TypeScript library modules over 250 LOC

| LOC | Over | File |
|---:|---:|---|
| 338 | +88 | `/Users/yash/Projects/doodle-ai/src/lib/credits/index.ts` |
| 336 | +86 | `/Users/yash/Projects/doodle-ai/src/lib/doodle-constants.ts` |
| 316 | +66 | `/Users/yash/Projects/doodle-ai/src/lib/admin/overview.ts` |
| 292 | +42 | `/Users/yash/Projects/doodle-ai/src/lib/auth/index.ts` |
| 280 | +30 | `/Users/yash/Projects/doodle-ai/src/lib/batch/run.ts` |
| 272 | +22 | `/Users/yash/Projects/doodle-ai/src/lib/admin/projects.ts` |
| 272 | +22 | `/Users/yash/Projects/doodle-ai/src/lib/admin/users.ts` |

## CSS files over 400 LOC

| LOC | Over | File |
|---:|---:|---|
| 563 | +163 | `/Users/yash/Projects/doodle-ai/src/components/app/composer/composer-styles.css` |

## Exclusions

- `/Users/yash/Projects/doodle-ai/worker-configuration.d.ts` — generated Cloudflare declarations.
- `/Users/yash/Projects/doodle-ai/.design-import/support.js` — generated design-import runtime.
- Build output, dependency folders, and other ignored artifacts.

## Recommended next order

1. Delete or archive the legacy `/Users/yash/Projects/doodle-ai/src/scripts/app/chat.ts` after browser verification of `chat/index.ts`.
2. Extract `/Users/yash/Projects/doodle-ai/src/pages/c/[id].astro` into page layout and chat/canvas components.
3. Split `/Users/yash/Projects/doodle-ai/src/admin/pages/OverviewPage.astro` into data loader, metric grid, charts, and activity sections.
4. Extract `/Users/yash/Projects/doodle-ai/src/admin/components/UserDrawer.astro` and admin sidebars into shared primitives.
5. Split credits, constants, auth, and batch library modules only after characterization tests cover their behavior.
6. Split the composer stylesheet by component scope after confirming Astro CSS loading and cascade behavior.

The thresholds are reviewability targets, not a reason to fragment cohesive code. Every extraction must preserve routes, DOM IDs, event names, storage keys, auth, credit, and database behavior.
