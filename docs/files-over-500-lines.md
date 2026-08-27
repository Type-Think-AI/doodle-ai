# Files over 500 lines

Generated from tracked files on 2026-08-27 with a line-count threshold of `> 500`.

## Summary

- **9 tracked files** exceed 500 lines when generated/support files are included.
- **7 application source files** exceed 500 lines after excluding generated/support files.
- The application source total for these 7 files is **5,581 lines**.
- `worker-configuration.d.ts` and `.design-import/support.js` are excluded from refactor prioritization because they are generated/support artifacts.

## Application source files requiring refactor attention

| Lines | File | Area | Priority |
|---:|---|---|---|
| 1,273 | `/Users/yash/Projects/doodle-ai/src/lib/admin/queries.ts` | Admin data/query layer | P0 |
| 853 | `/Users/yash/Projects/doodle-ai/src/components/app/PromptComposer.astro` | Prompt composer UI | P0 |
| 827 | `/Users/yash/Projects/doodle-ai/src/scripts/app/chat.ts` | Chat controller, persistence, rendering, canvas bridge | P0 |
| 805 | `/Users/yash/Projects/doodle-ai/src/components/Footer.astro` | Footer markup and responsive styling | P1 |
| 773 | `/Users/yash/Projects/doodle-ai/src/admin/pages/OverviewPage.astro` | Admin overview page | P1 |
| 534 | `/Users/yash/Projects/doodle-ai/src/components/app/RoadmapBoard.tsx` | Roadmap seed/sync/render logic | P1 |
| 516 | `/Users/yash/Projects/doodle-ai/src/admin/components/UserDrawer.astro` | Admin user drawer and credit controls | P1 |

## Generated/support files over 500 lines

| Lines | File | Treatment |
|---:|---|---|
| 13,558 | `/Users/yash/Projects/doodle-ai/worker-configuration.d.ts` | Generated Cloudflare declarations; do not manually refactor |
| 1,911 | `/Users/yash/Projects/doodle-ai/.design-import/support.js` | Generated design-import runtime; do not manually refactor |

## Recommended refactor order

1. `src/scripts/app/chat.ts` — highest coupling and largest interactive risk. Extract state, API, rendering, persistence, and canvas bridge.
2. `src/components/app/PromptComposer.astro` — split attachment controls, skill picker, mentions, action row, and styles while preserving public IDs/props.
3. `src/lib/admin/queries.ts` — split into overview, users, billing, feedback, and projects query modules behind a compatibility barrel.
4. `src/components/Footer.astro` — separate semantic sections and responsive style ownership.
5. `src/admin/pages/OverviewPage.astro` — extract metrics, charts, and data-loading boundaries after admin query split.
6. `src/components/app/RoadmapBoard.tsx` — separate seed data, permissions, sync transport, and rendering; preserve persisted tldraw shapes.
7. `src/admin/components/UserDrawer.astro` — extract credit operations, user summary, and drawer shell after shared admin primitives exist.

Refactor one file family at a time. Preserve API contracts, localStorage keys, browser event names, auth/credit behavior, and tldraw persistence. Run typecheck after each extraction and build after each wave.
