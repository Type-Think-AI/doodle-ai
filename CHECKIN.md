# Doodle AI refactor check-in

## 2026-08-27

- **Theme alignment:** 20 min. Updated tldraw canvas theme to follow `html[data-theme]`, replaced hardcoded chat-canvas background, and softened roadmap category colour drift. Commit `5ad1c29`.
- **Refactor discovery:** 15 min. Mapped 787 tracked files / ~35k source LOC. Identified the highest-risk monoliths: `src/lib/admin/queries.ts` (1,273 LOC), `src/components/app/PromptComposer.astro` (853), `src/scripts/app/chat.ts` (816), `src/components/Footer.astro` (805), and `src/admin/pages/OverviewPage.astro` (773).

## Refactor programme status

Planning only. No production deployment or push performed.
- **Defect wave — Zara/Alex:** 10 min. Integrated roadmap tldraw background token fix and added status predicates to generation refund and batch-item failure updates. Zara identified pre-existing Astro virtual-module typecheck noise in the detached lane; final main-tree validation pending remaining agents.
- **Defect wave — Sara:** 15 min. Added lazy/async image loading, cached canvas image-size probes, cached thread-image collection, and `content-visibility` for long chat histories. Added `pnpm smoke` script; smoke suite passes 131/131.
- **Build gate:** 5 min. `pnpm build` passes; Vite reports the known 1.7MB tldraw client chunk and existing externalization warnings. No build failure.
