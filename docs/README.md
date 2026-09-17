# Doodle AI docs

Front door for architecture, services, and plans. **Code on `dev` is the source of truth**; older docs may still describe a target state.

## Start here

| Doc | What it is |
|---|---|
| [architecture/overview.md](./architecture/overview.md) | Thin system diagram as shipped on `dev` |
| [architecture/services.md](./architecture/services.md) | Worker bindings, secrets (names only), vendors |
| [architecture/tech-stack.md](./architecture/tech-stack.md) | Stack as of `package.json` + `wrangler.json`, plus drift vs the older canonical note |

## Platform

| Doc | What it is |
|---|---|
| [architecture.md](./architecture.md) | Deep ledger, schema, and API design |
| [tech-stack.md](./tech-stack.md) | Canonical stack decision record (some versions lag `dev`) |
| [secrets.md](./secrets.md) | Secrets Store vs `.dev.vars`; never commit values |
| [deploys.md](./deploys.md) | `doodleai.art` / `dev.doodleai.art` migrate-then-deploy |
| [roadmap.md](./roadmap.md) | SaaS migration phases; Stripe still planned |

## Talk / voice

On **`dev` today:** Cloudflare `@cloudflare/voice` via Durable Object `VoiceRoom` (code + `VOICE_ROOM` binding). Plan: [voice-mode-plan.md](./voice-mode-plan.md) — its own “proposed” status line lags the Worker.

**Grok Voice (fal S2S) + our `/mcp`:** not on `dev`. Plans live on [PR #7](https://github.com/Type-Think-AI/doodle-ai/pull/7) (`docs/grok-voice-realtime-plan.md`, `docs/mcp-doodle-tools.md`). Link those files here when they land on `dev`. Do not merge PR #7 from this corpus work.

## WebMCP, SEO, product briefs

**WebMCP** — [webmcp.md](./webmcp.md) · [webmcp-testing.md](./webmcp-testing.md) · [webmcp-agent-testing-brief.md](./webmcp-agent-testing-brief.md) · [webmcp-lane-brief.md](./webmcp-lane-brief.md) · [webmcp-spec-watch.md](./webmcp-spec-watch.md)

**SEO / content** — [seo-keyword-pages-spec.md](./seo-keyword-pages-spec.md) · [seo-task-list.md](./seo-task-list.md) · [seo-tools-and-thumbnails-plan.md](./seo-tools-and-thumbnails-plan.md) · [content-inventory.md](./content-inventory.md) · [doorway-consolidation-plan.md](./doorway-consolidation-plan.md) · [tool-pages-plan.md](./tool-pages-plan.md)

**Product / later** — [anime-expansion-brief.md](./anime-expansion-brief.md) · [anime-positioning.md](./anime-positioning.md) · [anime-style-research.md](./anime-style-research.md) · [doodle-to-video-plan.md](./doodle-to-video-plan.md) · [video-integration.md](./video-integration.md) · [channel-connectors-plan.md](./channel-connectors-plan.md) · [agent-canvas-control-plan.md](./agent-canvas-control-plan.md) · [mobile-strategy.md](./mobile-strategy.md)

**Housekeeping** — [optimization-backlog.md](./optimization-backlog.md) · [refactor-plan.md](./refactor-plan.md) · [file-size-policy-audit.md](./file-size-policy-audit.md) · [skills-research-2026-08.md](./skills-research-2026-08.md)

## Agents

| Doc | What it is |
|---|---|
| [agents/doodle-cto.md](./agents/doodle-cto.md) | Doodle CTO: architecture, infra, and plan-first workflow |
