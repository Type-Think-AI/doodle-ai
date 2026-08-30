/*
 * DataFast bot-traffic tracking — SERVER-SIDE, dependency-free.
 *
 * WHAT THIS IS (AND IS NOT)
 *
 * This reports to DataFast's "Bot traffic" card *when AI assistants and
 * search crawlers request our pages* — Googlebot, GPTBot, ClaudeBot,
 * PerplexityBot, etc. It is an OBSERVABILITY signal: it shows which bots
 * discover the site and which URLs they fetch (including ones they expected
 * to find but got a 404 on). It does NOT generate human traffic, and human
 * pageviews never appear in that card — those are handled by the browser
 * `script.js` tag in AppLayout.astro. See:
 *   https://datafa.st/docs/bot-traffic-tracking
 *
 * WHY A DIRECT HTTPS POST INSTEAD OF THE @datafast/ai-crawl PACKAGE
 *
 * The npm package targets Node/Vercel/Pages shapes and pulls its own
 * runtime-detection code. This app has repeatedly been burned by npm
 * packages that drag in Node-only deps (execa, native binaries) that fail to
 * bundle on Cloudflare Workers (see astro.config.mjs `external` lists). The
 * doc documents the raw POST to /api/ai-crawls as a first-class integration
 * for exactly this "any backend" case, and it is ~30 lines. DataFast does the
 * crawler classification server-side from the User-Agent, so all we owe it is
 * the URL + UA + source IP.
 *
 * WHY IT NEVER BLOCKS THE RESPONSE
 *
 * "The tracking request is best-effort and should not slow down your site."
 * We build the payload synchronously, then fire the fetch inside the Worker's
 * ctx.waitUntil() so the page response returns immediately and the POST
 * finishes in the background. A network failure or timeout is swallowed — a
 * broken analytics endpoint must never break a pageview.
 *
 * WHY WE PRE-FILTER FOR CRAWLERS LOCALLY
 *
 * DataFast reclassifies server-side, but sending it every human pageview
 * would be pure waste (bandwidth + their ingestion). We do a cheap UA
 * substring check first and only POST when the UA looks like a bot. The
 * canonical crawler list lives on DataFast's servers; this local list is only
 * a bandwidth pre-filter, so it can be conservative.
 */

/** DataFast website tracking ID — the same PUBLIC id used by the browser
 *  script.js tag in AppLayout.astro. Not a secret. */
const DATAFAST_WEBSITE_ID = "dfid_2nlWf6zeRWRAFhLFpeRq6";

/** The production hostname DataFast validates the reported href against. */
const TRACKED_DOMAIN = "doodleai.art";

const DATAFAST_ENDPOINT = "https://datafa.st/api/ai-crawls";

/** Cheap local pre-filter. DataFast does the authoritative classification;
 *  this only decides whether it is worth a POST at all. Lowercased UA. */
const CRAWLER_HINTS = [
  "bot",
  "crawler",
  "spider",
  "chatgpt",
  "gptbot",
  "oai-searchbot",
  "claude",
  "anthropic",
  "perplexity",
  "bing",
  "google",
  "duckduck",
  "applebot",
  "bytespider",
  "ccbot",
  "gemini",
  "vertex",
  "meta-external",
  "amazonbot",
  "yandex",
];

function looksLikeCrawler(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_HINTS.some((hint) => ua.includes(hint));
}

/**
 * Report a single request to DataFast bot traffic IF it looks like a crawler.
 *
 * Call it fire-and-forget from middleware: it returns a promise you hand to
 * ctx.waitUntil(), or nothing at all if the request is not a crawler (so the
 * caller can skip waitUntil entirely). NEVER await it in the request path.
 *
 * @param request The incoming Request (Web standard — Astro's context.request).
 * @returns A background promise to pass to ctx.waitUntil(), or null if there
 *          is nothing to send (non-crawler UA, or unsupported request shape).
 */
export function trackDataFastBotRequest(request: Request): Promise<void> | null {
  // Only GET/HEAD are page/asset reads a crawler would make; skip everything
  // else so we never accidentally report a form POST or an API mutation.
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!looksLikeCrawler(userAgent)) return null;

  const url = new URL(request.url);

  // Report the canonical PUBLIC origin, not whatever internal host the Worker
  // sees. DataFast validates the href hostname against the configured website,
  // so a preview/worker.dev host would be rejected — pin it to the tracked
  // domain. Path is preserved so "/free-trial 404" style content signals work.
  // Query string is deliberately dropped to avoid leaking tokens/PII, exactly
  // as the DataFast PHP reference example does.
  const href = `https://${TRACKED_DOMAIN}${url.pathname}`;

  // Cloudflare puts the real client IP in CF-Connecting-IP. This Worker only
  // ever receives traffic through Cloudflare's edge, so that header is
  // trustworthy here (the doc's warning about spoofable X-Forwarded-For does
  // not apply — we read CF-Connecting-IP, which the edge sets and clients
  // cannot forge). It lets DataFast verify the crawler against published IP
  // ranges. Optional — omitted cleanly if absent.
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    undefined;

  const payload = {
    websiteId: DATAFAST_WEBSITE_ID,
    domain: TRACKED_DOMAIN,
    href,
    ai: {
      userAgent,
      ...(ip ? { ip } : {}),
      source: "server_middleware" as const,
    },
  };

  // Best-effort: short timeout, swallow every failure. A dead analytics
  // endpoint must never surface as an error on a real pageview.
  return (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      try {
        await fetch(DATAFAST_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // Intentionally silent — bot tracking is non-critical and must not
      // affect the request it is observing.
    }
  })();
}
