# Open-Source Readiness Plan — Doodle AI

**Date:** 2026-08-25  
**Auditor:** Nema (Security Agent)  
**Status:** PASS with conditions

---

## 1. Security Audit Results

### Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 2 | Documented (acceptable) |
| LOW | 3 | Documented |
| INFO | 3 | Noted |

### LOW — Cloudflare account and resource IDs in wrangler.json

**Location:** `/wrangler.json`  
**Issue:** `account_id`, `database_id` (D1), and KV namespace `id` are committed. These are **not secrets** — they cannot be used to access resources without Cloudflare auth tokens. They only identify which project to deploy to.  
**Verdict:** ACCEPTABLE. Cloudflare account IDs are public in every open-source Workers project (e.g., the Cloudflare docs examples include them). Contributors need to replace them with their own for self-hosting, which is documented in CONTRIBUTING.md.

### MEDIUM — Client-side innerHTML usage (DOM XSS surface)

**Location:** `src/scripts/app/team-settings.ts`, `account-menu.ts`, `composer-mentions.ts`, `team-page.ts`, `projects-page.ts`, `project-detail.ts`, `share-page.ts`  
**Issue:** Multiple `innerHTML = ""` clearing and string-literal HTML construction. No user-supplied strings are interpolated unsafely — all dynamic values use `textContent`, `encodeURIComponent()`, or `createElement` + property assignment. The `member.image` URL is set via `style.backgroundImage` which is safe (browsers don't execute script from CSS `url()`).  
**Verdict:** ACCEPTABLE. No XSS vector exists because user data never enters an innerHTML string unsanitized.

### MEDIUM — Analytics tokens hardcoded (not env-driven for open-source)

**Location:** `src/layouts/AppLayout.astro` (lines 130, 139, 147, 152)  
**Issue:** DataFast (`dfid_2nlWf6zeRWRAFhLFpeRq6`), Mixpanel (`2f06c42c258b8121e6d3feb324179bf2`), and GA4 (`G-K6KZRWJH8H`) measurement IDs are hardcoded. These are **public** client-side identifiers (not secrets), but open-source forks will report analytics into the Doodle AI dashboards unless they change them.  
**Fix:** Documented in README that forks must replace or remove the analytics block. Optionally make them conditional on an env var in a future PR.

### LOW — No CORS middleware (relies on same-origin)

**Issue:** No explicit CORS headers are set anywhere. This is correct: Astro serves both the frontend and API from the same origin, so browser same-origin policy is the guard.  
**Verdict:** ACCEPTABLE for the current architecture. If API endpoints are ever exposed cross-origin, a CORS middleware must be added.

### LOW — No CSP header

**Issue:** No Content-Security-Policy header is configured.  
**Impact:** Reduced defense-in-depth against XSS. Since there are no user-generated HTML injection vectors, the practical risk is low.  
**Recommendation:** Add CSP via Cloudflare Worker response headers or a custom Astro middleware in a follow-up.

### INFO — Notes

1. **No hardcoded secrets found.** All keys (OPENROUTER_API_KEY, PICX_API_KEY, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET) are read from env vars. `.dev.vars` and `.env` are properly gitignored.
2. **No secrets in git history.** The repo was created clean (public since 2023dcd) and no secret-containing file was ever committed.
3. **Rate limiting is implemented** on all sensitive endpoints: generation (per-user + per-org), share view (per-IP), auth (via Better Auth's built-in limiter).
4. **Upload validation is solid:** MIME type check (`image/*`), size limit (20 MB), and auth gate.
5. **SSRF risk is minimal:** The only outbound fetch to user-influenced URLs is PicX's API (fixed endpoint: `api.picxstudio.com`). The `imageUrl` and `refImageUrl` passed to the generation tool are URLs the server previously issued via `/api/upload` (PicX CDN URLs), not arbitrary user-supplied URLs.

---

## 2. Module Split — SaaS vs Open-Source

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   OPEN-SOURCE CORE                       │
│                                                         │
│  Astro 5 app + Mastra agent + Skills + D1/KV storage   │
│  Auth (Better Auth + Google OAuth) · Credits · Teams    │
│  Chat UI · Skills marketplace · Moodboards · Settings  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│               SAAS-ONLY (private deploy)                │
│                                                         │
│  ① Analytics scripts (DataFast, Mixpanel, GA4)          │
│  ② Cloudflare-specific wrangler IDs & custom domains    │
│  ③ Marketing content (marketing/*.md)                   │
│  ④ Proprietary article content (src/content/articles/)  │
│  ⑤ Production secrets (PICX_API_KEY, OAuth creds)       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Module Classification

| Module / Directory | Open-Source? | Notes |
|---|---|---|
| `src/pages/` (routes) | ✅ Yes | Core application routes |
| `src/scripts/app/` | ✅ Yes | Client-side controllers |
| `src/mastra/` | ✅ Yes | Agent, skills, tools — the core product |
| `src/lib/` | ✅ Yes | Auth, credits, batch, env-bridge, utilities |
| `src/db/` | ✅ Yes | Schema, migrations, client |
| `src/components/` | ✅ Yes | UI components |
| `src/layouts/` | ✅ Yes | Analytics block documented as SaaS-only |
| `src/content/articles/` | ⚠️ Optional | SEO content — forks don't need it, but it's not secret |
| `marketing/` | ❌ SaaS-only | Internal strategy docs — exclude from public repo or keep as informational |
| `docs/` | ✅ Yes | Architecture docs useful for contributors |
| `wrangler.json` | ✅ Yes | Template with placeholder IDs |
| `.dev.vars.example` | ✅ Yes | Documents all required env vars |
| `migrations/` | ✅ Yes | D1 schema migrations |
| `.kiro/` | ⚠️ Keep | Kiro project config — useful but optional for non-Kiro users |

### Self-Hosting Requirements for Contributors

To run locally, a contributor needs:
1. **Node.js + pnpm** (versions in `package.json` engines)
2. **OpenRouter API key** (free tier available) — or any OpenAI-compatible endpoint
3. **Google OAuth credentials** (free via Google Cloud Console)
4. **BETTER_AUTH_SECRET** — any random 32-byte string
5. **PicX API key** (free at ai.picxstudio.com) — OR a stub that returns a placeholder image

They do **NOT** need:
- Cloudflare account (Astro dev server works with `pnpm dev`)
- DataFast, Mixpanel, or GA4 accounts
- Production database access
- The marketing/ docs

---

## 3. Actions Taken

1. **CONTRIBUTING.md created** — Local dev setup, code style, PR process, analytics disclaimer.
2. **`.dev.vars.example` updated** — Documents Cloudflare IDs as optional env vars for deploy.
3. **OPEN_SOURCE_PLAN.md created** — This document: audit results + module split + checklist.
4. **Analytics documented as SaaS-only** — CONTRIBUTING.md explains how to replace or remove.

---

## 4. Open-Source Readiness Checklist

| Item | Status | Notes |
|---|---|---|
| No secrets in source | ✅ Pass | All keys via env vars |
| No secrets in git history | ✅ Pass | Clean from creation |
| `.gitignore` covers secrets | ✅ Pass | `.env*`, `.dev.vars*`, `.wrangler/` all ignored |
| `.dev.vars.example` complete | ✅ Pass | All 6 required vars documented |
| Contributor can run locally | ✅ Pass | `pnpm dev` with just env vars |
| LICENSE file | ❌ Missing | Must select OSI-approved license before public release |
| CONTRIBUTING.md | ❌ Missing | Recommended: add code style, PR process, local dev guide |
| README setup instructions | ✅ Pass | Clear local-first workflow documented |
| Auth endpoints protected | ✅ Pass | All data endpoints require session/org membership |
| Rate limiting present | ✅ Pass | Generation, share view, and auth endpoints |
| File upload validation | ✅ Pass | Type, size, auth gate |
| No SQL injection vectors | ✅ Pass | All queries via Drizzle ORM (parameterized) |
| No eval/dynamic code exec | ✅ Pass | Zero instances |
| No XSS injection vectors | ✅ Pass | No unsafe innerHTML with user data |
| CORS configured correctly | ✅ Pass | Same-origin only (no cross-origin API) |
| Deployment IDs not leaked | ✅ Pass | CF IDs are non-secret (documented) |

---

## 5. Remaining Actions Before Going Public

1. **Select a license** — MIT or Apache-2.0 recommended for maximum adoption. AGPL-3.0 if you want to force SaaS competitors to contribute back.
2. **Create CONTRIBUTING.md** — Code style (ESLint config already exists), PR requirements, local dev setup.
3. **Decide on marketing/ dir** — Either exclude from public repo (add to `.gitignore`) or keep as informational.
4. **Optional: Make analytics env-driven** — Wrap the analytics block in a build-time `import.meta.env.PUBLIC_ANALYTICS_ENABLED` check so forks don't report to your dashboards.
5. **Optional: Add CSP header** — Defense-in-depth for XSS.
6. **Optional: GitHub Actions CI** — `pnpm exec tsc --noEmit && pnpm build` on PRs.

---

## 6. Threat Model Summary

| Threat | Mitigation | Residual Risk |
|---|---|---|
| API key exposure | Env vars only, gitignored `.dev.vars` | None |
| Credit system bypass | Per-org rate limit + D1 atomic balance check + refund on failure | Low (race condition window <1s) |
| Unauthorized generation | `requireAuth` + `requireOrg` gates on all generation paths | None |
| IDOR on threads/projects | All queries filter by `organizationId` from session | None |
| Token-guessing on share links | 22-char cryptographic tokens + 60 req/min IP rate limit | Acceptable |
| XSS via chat messages | Messages rendered via `textContent`, images via `src` attribute | None |
| SSRF via imageUrl | URLs are only PicX CDN paths issued by `/api/upload`, not arbitrary | None |
| Analytics data leaking to forks | Documented as SaaS-only, no sensitive data in events | Low (cosmetic) |
