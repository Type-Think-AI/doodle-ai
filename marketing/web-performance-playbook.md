# Web Performance Playbook — Doodle AI

> **Who reads this:** every agent and human contributor opening a PR against this repo.
> **When:** before writing UI code, before reviewing, and before merging.

This is a standing reference derived from a verified Lighthouse 13.4.0 audit of
doodleai.art (2026-08-28, mobile emulation, Moto G Power / Slow 4G). Every number
is measured; nothing is estimated. Rules here are **enforceable** — a PR that
violates them must be revised before merge.

Stack: Astro 5, TypeScript, scoped `<style>` (no Tailwind), Cloudflare Workers,
D1 + KV, Better Auth, Mastra agent, PicX API, images on cdn.picxstudio.com.

---

## Non-negotiable rules

### 1 · Performance / Core Web Vitals

**P1 — Image resizing is mandatory.**

Never render a raw `cdn.picxstudio.com` original into a layout box. Always prefix
the path with the Cloudflare Image Resizing transform:

```
/cdn-cgi/image/width={w},format=auto,quality=82/{original-path}
```

Provide a `srcset` with at least three breakpoints:

| Breakpoint | Use case | Measured size (AVIF) |
|---|---|---|
| `width=240` | Small thumbnails, mobile grid | 20 KiB |
| `width=440` | Card thumbnails (362 px box) | 51 KiB |
| `width=640` | Hero / large cards | 95 KiB |

Evidence: 16 skill-card PNGs at 1024×1024 served into 362×362 boxes totalled
13,794 KiB of the 16,923 KiB page weight. The 440 px AVIF is 96.9 % smaller
than the 1,668 KiB original.

Source file: `/Users/yash/Projects/doodle-ai/src/components/app/SkillCard.astro`

**P2 — LCP image must be eager.**

The LCP candidate image **must** carry `loading="eager"` and `fetchpriority="high"`.
Everything below the fold stays `loading="lazy"`.

LCP subpart breakdown from the audit:

| Subpart | Duration |
|---|---|
| Time to first byte | 790 ms |
| Resource load delay | 340 ms |
| Resource load duration | 2,680 ms |
| Element render delay | 13,190 ms |

The 13.19 s render delay was caused entirely by lazy-loading the above-the-fold
first row in `/Users/yash/Projects/doodle-ai/src/pages/index.astro` (20 cards,
all lazy). Total LCP: 36.2 s.

**P3 — Deduplicate in-flight fetches.**

Any module-level async read called from more than one controller during page load
must deduplicate in-flight promises (singleton promise pattern or module-level cache).

Evidence: `getSession()` in `/Users/yash/Projects/doodle-ai/src/scripts/app/auth-client.ts`
had no dedupe, so three callers (`sidebar.ts`, `auth-dialog.ts`, `api-client.ts`)
fired three identical `/api/auth/get-session` requests → 8,389 ms max critical path.

**P4 — No `beforeunload` for state persistence.**

Use `pagehide` instead. Reserve `beforeunload` strictly for genuine unsaved-data
confirmation prompts (a modal the user must see and dismiss).

Evidence: listeners in these files disqualified the page from bfcache:
- `/Users/yash/Projects/doodle-ai/src/scripts/app/home.ts`
- `/Users/yash/Projects/doodle-ai/src/scripts/app/settings.ts`
- `/Users/yash/Projects/doodle-ai/src/scripts/app/chat/index.ts`

---

### 2 · Accessibility

**A1 — Contrast floor for muted text.**

Every muted-text colour token must meet **4.5:1** contrast against `#0f0f0f` for
text under 18 px. Floor value on this background: `#7c7c7c`. Recommended value
for `--text-dimmer`: `#8a8a8a` (5.56:1).

Evidence: `--text-dimmer` was `#666666` → 3.34:1. Failed on ~20 elements:
- `p.home-sub` (14 px)
- `span.skill-card-tagline` (12.5 px)
- `.mobile-nav-link` labels (10.5 px)

**A2 — Accessible names on contenteditable.**

A `role="textbox"` contenteditable **must** have a real `aria-label` or
`aria-labelledby`. `data-*` attributes never provide an accessible name.

Evidence: `/Users/yash/Projects/doodle-ai/src/components/app/PromptComposer.astro`
relied on `data-placeholder` — failed both "ARIA input fields do not have
accessible names" AND "accessibility tree is not well-formed" (agentic audit).

**A3 — One `<main>` landmark per page, in the layout.**

Place the `<main>` element in the layout file, not individual page components.

Evidence: `/Users/yash/Projects/doodle-ai/src/layouts/AppShellLayout.astro` used
`<div class="app-shell-main">`. Standalone pages (about, learn, settings, boards,
privacy-policy, terms-of-service, 404) already had `<main>`.

---

### 3 · Best Practices & Security Headers

**B1 — CSP must graduate through Report-Only.**

Do not add `Content-Security-Policy` in enforcement mode without first running it
as `Content-Security-Policy-Report-Only` until the report endpoint is clean.

Current state in `/Users/yash/Projects/doodle-ai/public/_headers`:
- ✅ X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- ✅ HSTS `max-age=31536000; includeSubDomains`
- ❌ CSP enforcement, Cross-Origin-Opener-Policy, Trusted Types (owned by Kai/Nema)

**B2 — HSTS `preload` requires human sign-off.**

It is effectively irreversible for the max-age window (1 year). Do not add it in a
PR without explicit approval from a human maintainer.

---

### 4 · SEO

**S1 — Never infer schema from headings.**

Do not emit `HowTo`, `FAQPage`, or any structured-data type by parsing heading
text. Markup must describe content actually visible on the page.

Evidence: `/Users/yash/Projects/doodle-ai/src/components/article/ArticleSchema.astro`
deliberately refuses to synthesise `HowTo` from H2 headings.

**S2 — Do not remove the existing structured-data surface.**

| Surface | Schema types |
|---|---|
| Global (`src/layouts/AppLayout.astro`) | WebSite + SearchAction, SoftwareApplication, Organization |
| `/skills/` | CollectionPage + ItemList |
| `/skills/[id]` | BreadcrumbList + SoftwareApplication |
| Articles (`src/components/article/ArticleSchema.astro`) | Article + BreadcrumbList + conditional FAQPage |

---

### 5 · Agentic Browsing & WebMCP

**W1 — Use `document.modelContext`, not `navigator.modelContext`.**

`navigator.modelContext` is **deprecated** as of Chrome 150. Code written solely
against `navigator` silently registers nothing on current builds. Correct pattern:

```ts
const mc = (document as any).modelContext ?? (navigator as any).modelContext;
```

Verified against the working implementation in the sibling picx-ai repo.

**W2 — Every tool needs a complete JSON Schema.**

Each tool's `inputSchema` must include `type`, `properties`, and an explicit
`required` array. A bare `{}` schema fails the "WebMCP schemas are valid" audit.

Example of a valid schema:

```json
{
  "type": "object",
  "properties": {
    "prompt": { "type": "string", "description": "What to generate" }
  },
  "required": ["prompt"]
}
```

Evidence: Agentic Browsing score was 2/3; schema validity was the failing check.

**W3 — Never expose dangerous tools.**

Never expose a WebMCP tool that:
- Spends credits (image generation, video generation)
- Reads account data (session, profile, API keys)
- Returns an API key or token

Client-exposed tools run with the visitor's auth context — a malicious agent
could drain credits or exfiltrate secrets.

**W4 — Accessibility is a prerequisite for agentic browsing.**

A broken accessibility tree breaks agent browsing. Rules A2 and A3 are hard
prerequisites for a passing agentic score. The PromptComposer's missing accessible
name failed both categories simultaneously.

---

### 6 · Crawlability & AEO

**C1 — FAQ entries are mandatory for guides.**

Guide and explainer articles **must** ship with at least 3 FAQ entries in
frontmatter (`faq:` field). The zod validator in
`/Users/yash/Projects/doodle-ai/src/content.config.ts` is currently neutered to
`data.faq.length >= 0` with a TODO to raise it to 3. Re-arm it.

Evidence: only 2 of 8 articles declare FAQ frontmatter (`ai-cartoon-generator`,
`photo-to-sticker`). FAQ blocks are what AI Overviews and Perplexity quote.

**C2 — Conditional FAQPage emission must stay conditional.**

`ArticleSchema.astro` only emits FAQPage when `faq.length >= 3` AND the page
renders matching visible content. This prevents mismatched markup (see S1).

---

## Before you open a PR

Run these in order from the repo root. All three must pass.

```bash
pnpm exec tsc --noEmit        # type-check (catches bad imports, schema drift)
pnpm lint                      # ESLint + Astro check
pnpm build                     # full Cloudflare Workers build
```

**Lint false-alarm check:** if `pnpm lint` reports thousands of errors with huge
line numbers, suspect generated build artifacts being scanned (`.wrangler/tmp`).
Fix the ignore list — do not mass-edit source.

**Image check (manual):** verify every new `<img>` or CSS `background-image`
referencing `cdn.picxstudio.com` goes through `/cdn-cgi/image/...` with an
appropriate width. Raw originals are never acceptable.

**Accessibility spot-check:** any new interactive element with a `role` attribute
must have a matching `aria-label` or `aria-labelledby`. Any new colour token used
for text must be contrast-checked against `#0f0f0f`.

---

## Reading an audit report

> **~⅓ of a typical Lighthouse run is contaminated.** Act on nothing until you
> confirm the flagged resource originates from this app.

### Known contamination sources

| Source | Recognition pattern | Action |
|---|---|---|
| Browser extensions (CSS Peeper, etc.) | Injected JS/CSS not `grep`-able in repo; long tasks attributed to `extension://`; 533 KiB + 2.5 s main-thread in this run | Ignore. Re-run in incognito, clean profile. |
| Ad blockers | Console errors: `datafa.st`, `cloudflareinsights`, `cdn.mxpnl.com` with `ERR_BLOCKED_BY_CLIENT` | Ignore — third-party analytics, not app code. |
| Phantom preconnect recommendations | Lighthouse suggests preconnecting to a domain with zero `grep` hits in the repo (e.g. `fonts.googleapis.com` when using system font stack) | Ignore — extension-injected webfonts. |
| Agentic Browsing category crashes | `scoreDisplayMode: error` on entire category; present in one run, absent in another | Category is pre-release and unstable. Discard errored run; re-run mobile. |

### Procedure

1. Run with `--output=json` to distinguish an *errored* audit (crash, no score) from a *failed* audit (real finding with a score of 0).
2. `grep -r` the repo for any flagged resource or URL before filing a fix.
3. Use mobile emulation (Moto G Power / Slow 4G) as the canonical baseline. Desktop and alternate throttling produce incomparable numbers.
4. If an entire audit category shows `Error!`, do not treat individual audits from that category as actionable.

---

## Measured reference numbers

Baseline from 2026-08-28 mobile audit. Use these to distinguish real regressions
from run-to-run noise (±5 % for timing metrics, ±3 points for scores).

| Metric | Baseline | Target | Notes |
|---|---|---|---|
| Performance score | 54 | ≥ 80 | Dominated by image weight |
| Accessibility score | 91 | ≥ 95 | Contrast + landmarks |
| Best Practices score | 77 | ≥ 90 | Headers + bfcache |
| SEO score | 100 | 100 | Maintain |
| Agentic Browsing | 2/3 | 3/3 | Schema validity + a11y tree |
| LCP | 36.2 s | < 2.5 s | After image fix: expect < 3 s |
| Speed Index | 24.5 s | < 4 s | Tracks image payload directly |
| Total page weight | 16,923 KiB | < 2,500 KiB | 13,794 KiB is images alone |
| TTFB | 790 ms | < 800 ms | Already acceptable |
| LCP resource load delay | 340 ms | < 400 ms | Already acceptable |
| LCP resource load duration | 2,680 ms | < 1,500 ms | Shrinks with image resizing |
| LCP element render delay | 13,190 ms | < 500 ms | Eager + fetchpriority fixes this |
| Critical path (max) | 8,389 ms | < 2,000 ms | Session request deduplication |
| Image: original (1024 px WebP) | 1,668 KiB | — | Do not serve |
| Image: 640 px AVIF | 95 KiB | — | Hero / large cards |
| Image: 440 px AVIF | 51 KiB | — | Card thumbnails (362 px box) |
| Image: 240 px AVIF | 20 KiB | — | Small thumbnails |
| Contrast: `--text-dimmer` on `#0f0f0f` | 3.34:1 | ≥ 4.5:1 | Floor: `#7c7c7c` |
| FAQ frontmatter coverage | 2/8 articles | 8/8 | ≥ 3 entries per guide |

---

*Last updated: 2026-08-28. Update this table after each verified audit run.*
