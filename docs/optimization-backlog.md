# Doodle AI — Optimization & Enhancement Backlog

Generated 2026-08-27 against `dev` @ `46ae9fa`. Planning document only: nothing here has been executed.

Baseline facts this plan is built on:

- No tracked asset exceeds 500 KB; largest image is `public/icon-512.png` (~18 KB). Repo weight is **not** the problem.
- Largest client chunk is tldraw: **1,696 kB raw / 515 kB gzip**, loaded via `RoadmapBoard`/`DoodleCanvas`.
- No test framework or test directory exists. Only `pnpm smoke` (131 static assertions) and `pnpm lint`.
- 25 source files still exceed the agreed size policy (page 150 / component 300 / controller 300 / lib 250 / CSS 400).
- Build emits recurring advisories: Cloudflare `sharp` unsupported at runtime, Mastra Node built-ins auto-externalized, chunk-size warning.

Priority key: **P0** correctness/risk · **P1** high user-visible or high leverage · **P2** structural quality · **P3** nice-to-have.
Size key: S ≈ <2h · M ≈ half day · L ≈ 1–2 days.

---

## A. Verification & safety net (do before deep refactors)

| ID | Task | Why | Size | Priority |
|---|---|---|---|---|
| A1 | Live browser verification pass of the refactored chat route `/c/[id]`: streaming, retry, upload, camera, mentions, skill chip, canvas image placement, stop button | The chat controller and page were restructured and have never been exercised in a browser since | M | P0 |
| A2 | Live verification of refactored admin overview + user drawer (charts render, credit grant, role change) | 636 lines were moved out of `OverviewPage.astro` into 8 new components | S | P0 |
| A3 | Introduce a real test runner (Vitest) with jsdom for DOM-facing modules | Nothing currently prevents a silent regression in `chat/`, `chat-store`, `composer-mentions` | M | P0 |
| A4 | Characterization tests for `src/lib/credits/index.ts`: grant/spend/refund/transfer, idempotency replay, negative-amount rejection, insufficient balance | Money path. Must be pinned before anyone refactors it | L | P0 |
| A5 | Characterization tests for `src/lib/batch/run.ts` (status guards, partial failure, refund) and `src/pages/api/webhooks/picx.ts` (signature, replay, stale timestamp) | Both have race-condition history | M | P0 |
| A6 | Screenshot regression baselines at 375 / 390 / 430 / tablet / desktop for home, chat, skills, settings, admin overview | Makes every later UI refactor provably safe | M | P1 |
| A7 | Wire `pnpm check` (build + tsc + wrangler dry-run) into a documented pre-push ritual, and add `lint` to it | Checks exist but are not sequenced anywhere | S | P2 |

---

## B. Bundle & runtime performance

| ID | Task | Why | Size | Priority |
|---|---|---|---|---|
| B1 | Route-split tldraw so it never loads outside `/roadmap*` and the canvas-open chat state | 515 kB gzip is the single largest performance defect in the app | L | P1 |
| B2 | Audit `client:*` directives on all islands; downgrade to `client:visible` / `client:idle` where mount-on-load isn't required | Reduces hydration cost on first paint | M | P1 |
| B3 | Add explicit `manualChunks` for tldraw + Mastra-adjacent vendor code to stop the 500 kB warning being noise | Restores signal to the build output | M | P2 |
| B4 | Resolve the Cloudflare `sharp` advisory: either set `imageService: "compile"` for prerendered pages or document why it is intentionally off | Build warns on every run; unclear which is intended | S | P2 |
| B5 | Declare the Mastra/Node built-in externals explicitly in `astro.config.mjs` instead of relying on Vite auto-externalization | ~40 warnings per build hide real regressions; a future Mastra bump can silently break the Worker | M | P2 |
| B6 | Measure and record real Core Web Vitals (LCP/CLS/INP) for `/`, `/c/[id]`, `/skills`, `/learn` before and after B1–B2 | No baseline exists, so improvements are currently unprovable | M | P1 |
| B7 | Audit long chat threads for scroll/paint cost; extend `content-visibility` usage and cap eagerly-rendered messages | Long threads are the worst-case runtime path | M | P2 |
| B8 | Review `src/scripts/app/*.ts` minified-style one-liner controllers (`project-detail.ts`, `share-page.ts`, `team-page.ts`, `team-settings.ts`) for dead work and re-render churn | These are dense single-line files; likely redundant DOM rebuilds | M | P2 |

---

## C. Frontend quality, accessibility, mobile

| ID | Task | Why | Size | Priority |
|---|---|---|---|---|
| C1 | Replace `innerHTML` string assembly in `project-detail.ts`, `share-page.ts`, `team-page.ts`, `team-settings.ts` with DOM construction or escaped templating | Renders server/user-derived values; XSS-adjacent and hard to review | M | P0 |
| C2 | Full keyboard + focus-trap audit of `AuthDialog`, `FeedbackDialog`, `TeamNameDialog`, `InviteTeamDialog`, `Lightbox`, camera dialog | Dialogs are the most common a11y failure point | M | P1 |
| C3 | `prefers-reduced-motion` pass across composer, marquee footer, sidebar transitions, roadmap board | Currently unverified | S | P1 |
| C4 | Touch-target and 16px input audit on mobile for composer, sidebar, admin tables | Prevents iOS zoom and mis-taps | S | P1 |
| C5 | Empty / loading / error state review for moodboards, characters, projects, skills, admin tables | Honest states are a stated design requirement | M | P2 |
| C6 | Consistency pass on neutral dark tokens; remove any residual hardcoded hex in favour of tokens | Design-target compliance and future theming | M | P2 |
| C7 | Resolve the persisted stale roadmap sticky notes via a **controlled** migration that only removes known seed shapes and never user-created notes | Visible defect; must not destroy user data | M | P1 |
| C8 | Verify chat/canvas theme boundary in a live browser and delete the temporary explicit-surface workaround if the cascade now suffices | Workaround was added under time pressure | S | P1 |

---

## D. Structural / file-size policy debt

Remaining violations, largest first. Each task means "split with wiring complete, no orphan files".

| ID | Task | LOC now | Size | Priority |
|---|---|---:|---|---|
| D1 | Split `src/components/Footer.astro` (shell still holds subcomponents + styles) | 708 | M | P2 |
| D2 | Split `src/components/app/RoadmapBoard.tsx` into board setup / shape seeding / authorization / UI chrome | 534 | L | P2 |
| D3 | Extract shared admin primitives (drawer shell, stat row, confirm-form) then reduce `admin/components/UserDrawer.astro` | 516 | L | P2 |
| D4 | Split `admin/components/Sidebar.astro`; move the inline SVG `ICONS` map into `src/admin/data/icons.ts` and share it with the mobile drawer | 486 | M | P2 |
| D5 | Reduce `src/components/app/composer/composer-styles.css` below 400 by scope (shell / toolbar / attachments / responsive) | 484 | S | P2 |
| D6 | Split `src/components/app/Sidebar.astro` (mostly scoped + `:global` CSS — extract stylesheet, keep globals load-bearing) | 460 | M | P2 |
| D7 | Split `src/components/app/AuthDialog.astro` (carousel vs auth flow already separated in script — mirror that in markup/styles) | 431 | M | P2 |
| D8 | Split `src/db/schema/product.ts` by domain aggregate | 409 | M | P3 |
| D9 | Split `src/mastra/tools/generate-doodle.ts` (prompt building vs provider call vs credit/refund bookkeeping) | 379 | M | P2 |
| D10 | Split `src/components/app/DoodleCanvas.tsx` (mount lifecycle / image queue / toolbar) | 379 | M | P2 |
| D11 | Split `src/layouts/ArticleLayout.astro` and `src/components/Navbar.astro` | 343 / 339 | M | P3 |
| D12 | Split `src/lib/doodle-constants.ts` by concern (modes, prompts, limits, storage keys) | 336 | M | P2 |
| D13 | Reduce `src/lib/credits/index.ts` **only after A4 lands** | 338 | M | P2 |
| D14 | Reduce `src/lib/admin/overview.ts`, `src/lib/auth/index.ts`, `src/lib/batch/run.ts` below 250 | 316 / 292 / 280 | M | P3 |
| D15 | Reduce `src/scripts/app/chat/index.ts`, `chat/api-turn.ts`, `chat-store.ts`, `composer-mentions.ts`, `sidebar.ts` below 300 | 342–288 | M | P2 |
| D16 | Split remaining admin pages: `CreditsPage`, `BillingPage`, `SkillsPage`, `UsersPage` | 338–260 | L | P3 |
| D17 | Split remaining oversized pages: `settings.astro`, `learn/index.astro`, `characters.astro`, `terms-of-service.astro` | 210–157 | M | P3 |
| D18 | Add an automated file-size policy check script and run it in `pnpm check` so the policy stops drifting | — | S | P1 |

---

## E. Backend, data, and API hardening (hand off to Alex where noted)

| ID | Task | Why | Size | Priority |
|---|---|---|---|---|
| E1 | Rate-limit audit across auth, generation, batch, invite, upload, and admin mutation endpoints | Generation and invite paths are cost-bearing | M | P1 |
| E2 | Confirm every admin/API query is scoped by org/user and add tests for cross-tenant denial | Multi-tenant isolation is the highest-severity failure class | L | P0 |
| E3 | Error-response audit: ensure no internal detail or stack leaks to clients on any `/api/**` route | Smoke covers `/api/chat` only | M | P1 |
| E4 | Upload validation review: MIME sniffing, byte ceiling, filename handling, and rejection UX | User-facing and abuse-facing | M | P1 |
| E5 | Index review for the hottest D1 queries behind admin overview, threads, and ledger reads | Admin overview aggregates a lot | M | P2 |
| E6 | Decide server-side conversation memory (D1/KV + `@mastra/memory`) or explicitly keep it client-side and document why | Currently an implicit architectural gap | L | P3 |
| E7 | Variant generation (3 results per run) as designed, including credit accounting | Named in README as not built | L | P3 |

---

## F. SEO, content, and discoverability

| ID | Task | Why | Size | Priority |
|---|---|---|---|---|
| F1 | Execute the existing `docs/seo-task-list.md` backlog and reconcile it with this plan | Already written, not yet run to completion | L | P2 |
| F2 | Structured-data validation pass (Organization, WebSite, Article, Breadcrumb) against live output | Schema exists; correctness unverified | M | P2 |
| F3 | Sitemap/robots consistency check: no noindex URLs, no redirects, accurate `lastmod` | Cheap, high signal | S | P2 |
| F4 | Internal-link and anchor-text audit on learn/skills clusters | Existing content, unrealised value | M | P3 |

---

## G. Repo hygiene & developer experience

| ID | Task | Why | Size | Priority |
|---|---|---|---|---|
| G1 | Choose and add an OSI license (still an open hackathon blocker) | Blocks submission | S | P1 |
| G2 | Document the local-first setup, validation ritual, and refactor policy in one contributor entry point | Instructions are spread across README/steering | M | P2 |
| G3 | Add a lightweight CI workflow running lint + tsc + build + smoke (+ new tests) | Currently all validation is manual | M | P2 |
| G4 | Prune any remaining rollback/duplicate files and add an "unused asset" check to the size script | Prevents dead files reaccumulating | S | P3 |
| G5 | Push `dev` to origin and review the accumulated 15-commit diff | Local-only work is a single-machine risk | S | P1 |

---

## Suggested execution order

1. **Wave 1 — safety net:** A1, A2, A3, A4, A5, D18, G5
2. **Wave 2 — real user impact:** B1, B2, B6, C1, C2, C7, C8, E1, E2
3. **Wave 3 — structure:** D5, D15, D9, D12, D1, D4, D10, plus A6
4. **Wave 4 — breadth:** remaining D items, E3–E5, F1–F3, G1–G3
5. **Wave 5 — new capability:** E6, E7, F4, D16, D17

Rules for every wave: isolated worktrees, no lane touching another lane's files, wiring must be complete before integration, `tsc` + `build` + `smoke` (+ tests once A3 lands) before merge, one consolidated commit per wave, no push or deploy without explicit approval.
