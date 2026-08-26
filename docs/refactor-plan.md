# Doodle AI Code Refactoring Programme

**Status:** Plan and inventory complete — implementation not started.
**Scope:** `/Users/yash/Projects/doodle-ai/src` and supporting configuration only.
**Safety rule:** no production deployment, push, reset, clean, or broad automated rewrite during refactoring.

## Current baseline

- 787 tracked files in the repository overview; approximately 35,040 lines of prioritized source.
- 611 files are low-priority/generated/support files and must not be treated as application code.
- `pnpm exec tsc --noEmit` currently passes.
- `pnpm build` previously passed.
- Branch `dev` is four commits ahead of `origin/dev`; those commits are intentionally not pushed yet.
- There are no automated test files or test script today.

### Exclude from refactoring

- `worker-configuration.d.ts` — generated Cloudflare declarations.
- `.design-import/support.js` — generated design-import runtime.
- `dist/`, `.astro/`, `.wrangler/`, `node_modules/` — build/runtime artifacts.
- `public/sw.js` unless a service-worker defect is found.
- `scripts/generate-*` unless the task specifically concerns content generation.

## Hotspot inventory

| Area | Current hotspot | Risk | First refactor target |
|---|---:|---|---|
| Browser chat | `src/scripts/app/chat.ts` — 816 LOC | Highest coupling: DOM, persistence, API, generation, canvas | Extract API client, message rendering, canvas bridge, turn state |
| Prompt UI | `src/components/app/PromptComposer.astro` — 853 LOC | Markup, styles, upload, mentions, skill selection are interleaved | Extract style sheet, attachment controls, skill picker, composer state |
| Admin data | `src/lib/admin/queries.ts` — 1,273 LOC | Large query surface and high regression blast radius | Split by domain: overview, users, billing, feedback, projects |
| App chrome | `src/components/Footer.astro` — 805 LOC; Sidebar 460 LOC | Visual markup and responsive CSS are hard to change safely | Extract nav groups, legal links, mobile/footer variants, shared tokens |
| Admin pages | Overview 773 LOC; UserDrawer 516 LOC; Sidebar 486 LOC | Repeated admin layout and inline scripts/styles | Create shared admin primitives before page-by-page extraction |
| Generation | `src/mastra/tools/generate-doodle.ts` — 379 LOC; constants 336 LOC | Prompt modes, credit settlement, provider request mixed | Separate prompt builders, provider adapter, credit transaction boundary |
| Credits | `src/lib/credits/index.ts` — 338 LOC | Financial correctness; must not be casually rewritten | Characterization tests first, then pure calculation extraction |
| API routes | 40+ routes | Repeated auth/error/DTO patterns | Standardize only after route behavior tests exist |

## Refactor principles

1. **Characterize before changing.** Capture current behavior with focused tests or request-level fixtures before moving code.
2. **One ownership boundary per agent.** Agents may add new files and edit their assigned module, but may not rewrite shared auth, DB schema, CSS tokens, or package configuration without coordination.
3. **Move, do not redesign.** The first pass changes file boundaries and imports; behavior changes happen in separate commits.
4. **No giant “cleanup” commit.** Every wave must leave typecheck/build green and produce a small reviewable commit.
5. **Generated files are not architecture.** Keep generated declarations and design runtime out of the LOC count.
6. **Preserve public contracts.** API paths, DTO shapes, localStorage keys, event names, skill IDs, auth semantics, and database schema remain stable.
7. **Serial integration.** Parallel agents can inspect or work in isolated directories, but shared files are integrated one wave at a time.

## Agent plan

Ten agents can be used, but not ten simultaneous writers in the same working tree. Use two waves of five, with a human/integration gate between them. Host memory is tight, so prefer four active implementation agents plus one reviewer.

### Wave 0 — baseline and contracts (one owner)

**Agent 0 / Teo — QA baseline**
- Add the test runner only if approved by the repo owner; otherwise create fixture/checklist files without changing dependencies.
- Record typecheck, build, route inventory, event names, localStorage keys, and API DTO shapes.
- Identify behavior that must remain unchanged.

Deliverable: `docs/refactor-baseline.md` and focused regression fixtures.

### Wave 1 — isolated extraction work

**Agent 1 / Sara — chat browser controller**
- Extract `chat.ts` into `chat-controller.ts`, `chat-state.ts`, `chat-renderer.ts`, `chat-canvas-bridge.ts`, and `chat-api.ts`.
- Preserve event names and localStorage keys.
- Do not change the UI design or API behavior.

**Agent 2 — prompt composer**
- Split `PromptComposer.astro` into attachment controls, skill picker, mention surface, action row, and shared style module.
- Preserve form field IDs and `PromptComposer` public props.
- Validate mobile composer at 375, 390, and 430px.

**Agent 3 — admin queries**
- Split `src/lib/admin/queries.ts` into `overview.ts`, `users.ts`, `billing.ts`, `feedback.ts`, `projects.ts`, and shared query helpers.
- Preserve exported function names through a compatibility barrel during migration.

**Agent 4 — generation/credits**
- First add characterization tests for credit spend/refund/idempotency and generation mode prompt selection.
- Then extract pure prompt builders and provider request construction.
- Do not alter credit amounts, webhook correlation, or refund behavior.

**Agent 5 — app shell**
- Extract footer/sidebar/navbar subcomponents and shared responsive style sections.
- Preserve navigation URLs, accessibility labels, collapse state, and theme tokens.
- Do not modify global palette tokens in this wave.

### Wave 2 — dependent extraction work

**Agent 6 — API route conventions**
- Extract route response/error/body helpers only after baseline tests exist.
- Migrate one route family at a time: threads, projects/assets, orgs, batches.
- Preserve auth and org permission checks exactly.

**Agent 7 — admin component system**
- Create shared admin table, metric, drawer, button, and pagination primitives.
- Migrate one admin page at a time; no broad template rewrite.

**Agent 8 — client storage/sync**
- Separate localStorage schema, server mirror, optimistic queue, and hydration logic in `api-client.ts` and `chat-store.ts`.
- Preserve migration behavior for signed-out and signed-in users.

**Agent 9 — roadmap/canvas boundary**
- Split roadmap seed data, board permissions, sync transport, and canvas image placement.
- Keep tldraw mounting rules intact; do not mount inside `display:none`.
- Add smoke coverage for theme synchronization and canvas event delivery.

**Agent 10 / reviewer — integration and defect sweep**
- Review imports, circular dependencies, duplicate exports, dead code, and public contract changes.
- Run targeted typecheck, lint on changed files, build, and route smoke checks.
- Produce a release-readiness report; do not deploy.

## Integration gates

After every agent or extraction batch:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint <changed-files>
git diff --check
```

After each wave:

```bash
pnpm build
pnpm exec wrangler deploy --dry-run
```

Before any production action:

- Review the complete diff and generated-file changes.
- Run browser verification at 375px, 390px, 430px, tablet, and desktop.
- Verify sign-in, chat generation, credits/refunds, canvas, projects, team permissions, share links, roadmap, and admin flows.
- Confirm secrets are not present in tracked files.
- Obtain explicit approval for push and deployment.

## Recommended execution order

1. Commit or preserve the current clean baseline — already done in commits `52064bf`, `a104d61`, `6ad39e1`, and `5ad1c29`.
2. Create a refactor worktree/branch from `dev` for implementation; keep `dev` deployable.
3. Run Wave 0 baseline.
4. Run Wave 1 agents in isolated worktrees, not the same directory.
5. Integrate and validate each extraction in dependency order: chat → composer → admin queries → generation/credits → shell.
6. Run Wave 2 only after Wave 1 is green.
7. Perform a final defect sweep and visual QA.
8. Push only after explicit approval; deploy only after a successful dry run and explicit approval.

## Definition of done

- No behavior regressions in auth, credits, generation, webhooks, projects, team permissions, canvas, or share links.
- Largest browser modules reduced below ~350 LOC where practical, with cohesive modules and compatibility barrels where needed.
- No new circular dependencies.
- No generated files or secrets added.
- Focused tests cover credits, webhook signature/correlation, skill loading, API contracts, storage migration, and canvas events.
- Typecheck, changed-file lint, build, dry-run deploy, and responsive browser smoke checks pass.
- Each refactor unit has its own commit and check-in entry with actual time spent.
