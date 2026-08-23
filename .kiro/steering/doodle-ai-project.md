# Doodle AI project steering

## Scope and boundaries

- This project is `/Users/yash/picx/doodlebooth-agent`.
- The legacy project at `/Users/yash/picx/doodlebooth` is out of scope and must not be edited, deployed, or renamed from this workspace.
- Preserve unrelated uncommitted recovery work. Do not reset, clean, overwrite, or blindly apply a stash.
- Do not commit or push without explicit user instruction.

## Product and architecture

Doodle AI is a chat-first Astro 5 + TypeScript application. It uses Mastra for the conversational agent, Agent Skills packages under `src/mastra/skills/`, PicX for image generation and managed uploads, client-side localStorage for conversation state, and a separate Cloudflare Worker deployment configured as `doodleai-agent`.

Skills are authored once in `SKILL.md`, parsed at build time, attached to the Mastra agent when runnable, and exposed in the UI catalog. A runnable skill must have a matching generation mode and prompt branch; validation must continue to fail the build when those sources drift.

## Kiro configuration policy

- Shared project configuration belongs in `.kiro/agents/`, `.kiro/steering/`, and, when intentionally added, `.kiro/specs/` or `.kiro/settings/mcp.json`.
- `.kiro/agents/doodle-ai.md` is the project custom agent. It converts the reusable part of the former Claude permissions into Kiro capability rules.
- Machine-local CLI settings at `.kiro/settings/cli.json` are ignored and must not be treated as team configuration. Kiro documents CLI settings as user-scoped at `~/.kiro/settings/cli.json`.
- Kiro permissions are user/workspace policy and must not be used to smuggle secrets or silently authorize production changes.
- Do not copy Claude settings, permission allowlists, or an MCP name into Kiro without a valid Kiro schema and server definition.

## Validation

Use the least expensive relevant check first, then the affected build:

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm exec wrangler deploy --dry-run
```

Never put real API keys in tracked files. Local secrets belong in `.dev.vars`, which is ignored.

## Hackathon evidence

The repository should retain clear, truthful evidence of how Kiro supported development: project steering, the custom agent, reproducible setup instructions, and the final public repository. Submission claims must distinguish completed repository work from outstanding items such as a live demo URL, a public demonstration video, or current eligibility under a future ruleset.
