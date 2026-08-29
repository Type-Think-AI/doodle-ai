# WebMCP upstream spec watcher

`scripts/webmcp-spec-watch.mjs` + `.github/workflows/webmcp-spec-watch.yml` watch
the upstream WebMCP standard and turn any change into a **reviewable proposal**
for this repo. They never touch our application code.

## Why this exists

Doodle AI ships live WebMCP tools (see `docs/webmcp-agent-testing-brief.md` and
`src/components/agentic/`). Those tools depend on a moving standard defined in
[`webmachinelearning/webmcp`](https://github.com/webmachinelearning/webmcp). If
an interface member is renamed or an annotation's meaning shifts, our tools can
silently break — or a new capability (e.g. `outputSchema`) can become worth
adopting. This watcher catches both, daily, without a human having to remember
to check.

## What it watches

Against `webmachinelearning/webmcp` (default branch), each run collects:

- **Latest commit** — sha, first line of the message, date, URL.
- **Content hashes** of six files:
  `index.bs`, `README.md`, `declarative-api-explainer.md`,
  `implementation-status.md`, `security-privacy-questionnaire.md`,
  `docs/service-workers.md`.
- **WebIDL identifier set** extracted from `index.bs` — interface / dictionary /
  enum / member names. This is the delta that can break our tools.
- **Open issues and PRs updated in the last 24h** (title, number, URL) — context
  only, not baselined.
- **Releases / tags**, if the repo publishes any.

Reads use the public GitHub REST API. No token is required for public reads;
`GITHUB_TOKEN` (auto-provided in Actions) is used when present to raise the rate
limit.

## Baseline & diffing

The last-seen durable state is committed to
`docs/webmcp-upstream/upstream-state.json`. Each run diffs the live state against
that baseline:

- **First run ever** (no baseline file) reports `NEW_BASELINE` and does **not**
  pretend everything changed. It just records the starting point.
- Later runs compare shas, file hashes, and the IDL name set.

The transient 24h issue/PR activity is intentionally **not** stored in the
baseline, so the state file does not churn on every run.

## Classification

| Status | Meaning |
|---|---|
| `NEW_BASELINE` | First run. Baseline recorded, nothing to act on. |
| `NO_CHANGE` | Head sha and every watched hash match the baseline. |
| `DOCS_ONLY` | A watched doc changed, but not the spec or status/guidance files. |
| `GUIDANCE_CHANGE` | `implementation-status.md` (browser support) or `declarative-api-explainer.md` moved. |
| `SPEC_CHANGE` | `index.bs` — the normative spec — changed. Highest attention. |
| `COMMIT_ONLY` | New commit(s) upstream, but none of our watched files moved. |

Independent **categories** are also attached (a change can be several at once):
`SPEC_CHANGE`, `IMPL_STATUS_CHANGE`, `DECLARATIVE_API_GUIDANCE`, `DOCS_ONLY`,
`POSSIBLE_BREAKAGE`, `OPPORTUNITY`.

For a `SPEC_CHANGE`, the report lists **IDL identifiers added and removed**
versus the previous fetch — the concrete names that could affect our tools. IDL
extraction is a heuristic name-set diff, not a full WebIDL parse; treat it as a
pointer to read the real diff, not as ground truth.

## Cross-check against our code (suggestions only)

The watcher greps our own surface —
`src/components/agentic/WebMcpTools.astro`,
`src/components/agentic/tools-content.ts`, and `scripts/webmcp-smoke.mjs` — for
the members we rely on (`document.modelContext`, `registerTool`, `getTools`,
`executeTool`, `inputSchema`, `annotations.readOnlyHint`,
`annotations.untrustedContentHint`, `toolchange`, `exposedTo`, `AbortSignal`).

- **Possible breakage:** a member we use is absent from the current upstream IDL
  name set → flagged as `POSSIBLE_BREAKAGE`, with the caveat that the extractor
  is heuristic and must be verified manually.
- **Opportunity:** upstream introduces a member we do not use yet
  (`outputSchema`, `elicitation`, `progress`, `skills`, service-worker
  discovery) → listed with the file that would most likely need editing, as an
  *opportunity*, not a to-do.

Both are **suggestions**. The watcher does not edit code.

## Why auto-code-update is deliberately refused

A spec change is a human decision. A rename in `index.bs` can be cosmetic, can
be a genuine breaking change, or can be a proposal that never lands in a browser.
Auto-rewriting our tools — or auto-merging — would:

- act on a heuristic name diff that can misread the spec,
- change a live agent surface with no review,
- and race the human judgement the brief's hard rules require (no tool spends
  credits, writable tools only against staging, etc.).

So the most this pipeline ever does is: produce a diff summary, a proposed action
checklist, and open/update one GitHub issue. Application code changes always go
through a normal, reviewed PR by a person.

## Deploys are out of scope

This pipeline **only watches upstream**. It never builds and never deploys.
Deploys are owned by Cloudflare Workers Builds (git-triggered, configured in the
Cloudflare dashboard). Duplicating a deploy step here would create a second,
conflicting pipeline — the workflow comments say so explicitly.

## Running it locally

Requires Node 22+. No install step (dependency-free).

```bash
# Human-readable report to stdout; does NOT write the baseline.
node scripts/webmcp-spec-watch.mjs --dry-run

# Machine-readable JSON (what CI consumes).
node scripts/webmcp-spec-watch.mjs --json --dry-run

# Advance the local baseline after reviewing a change.
node scripts/webmcp-spec-watch.mjs --write-state

# Raise the rate limit with a token (optional for public reads).
GITHUB_TOKEN=ghp_xxx node scripts/webmcp-spec-watch.mjs --dry-run
```

Flags:

- `--json` — emit only the JSON report.
- `--dry-run` — do everything except persist the baseline.
- `--write-state` — persist the fetched state as the new baseline (ignored under
  `--dry-run`).

Exit code `0` means the run succeeded (whether or not anything changed); `1`
means a fatal error (network, parse). CI treats non-zero as a failed run, not as
"no change".

## The scheduled job

`.github/workflows/webmcp-spec-watch.yml` runs at **06:15 UTC daily** (a
low-traffic hour, offset from the top-of-hour scheduler spike) plus
`workflow_dispatch`. It has the minimum permission block —
`contents: write` (only to commit the one baseline file) and `issues: write`.

Each run:

1. Runs the watcher with `--json --write-state`.
2. If `shouldFileIssue` is true, opens or updates a **single deduplicated
   issue** matched by the stable title prefix `[webmcp-watch]` (updates the body
   in place and adds a comment rather than spamming new issues).
3. Commits the advanced `upstream-state.json` — guarded to run only on schedule,
   only on the canonical repo (never a fork), and only when the file changed.

## How to act on an issue it files

When you see a `[webmcp-watch]` issue:

1. Read the changed-files list and open the upstream diff for each.
2. If it is a `SPEC_CHANGE`, check the added/removed IDL identifiers against the
   verified surface in `docs/webmcp-agent-testing-brief.md`. Confirm no member
   we rely on was renamed or removed.
3. If a relied-on member changed, update
   `src/components/agentic/WebMcpTools.astro` and
   `src/components/agentic/tools-content.ts` **manually, in a reviewed PR**, then
   re-run `scripts/webmcp-smoke.mjs` against Chrome Canary.
4. For an `IMPL_STATUS_CHANGE`, verify whether browser support moved and update
   any claims in our docs.
5. For an `OPPORTUNITY`, decide whether the new member earns adoption — it is not
   an obligation.
6. Update `docs/webmcp-agent-testing-brief.md` if the verified surface changed.
7. Close the issue once reviewed. The baseline advances automatically on the
   next scheduled run, so the same change will not re-file.
