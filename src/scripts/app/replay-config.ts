/**
 * Mixpanel Session Replay configuration for Doodle AI.
 *
 * Kept in its own module because every value here is a deliberate deviation
 * from a Mixpanel default, and the reasons matter more than the values.
 *
 * Docs: https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript/javascript-replay
 */

import type { Config } from "mixpanel-browser";

/** Query flag that force-enables recording on localhost for a manual check. */
const LOCAL_REPLAY_FLAG = "replay";

/** Class name that opts an element out of replay capture (blocked entirely). */
export const REPLAY_BLOCK_CLASS = "mp-block";

/** Class name that masks an element's text/value but keeps its shape. */
export const REPLAY_MASK_CLASS = "mp-mask";

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * How many SDK initializations qualify for capture. 100 = every session.
 *
 * Beta posture: capture everything. The whole point right now is to watch real
 * users hit real friction, and sampling at 10% while traffic is small means
 * most sessions with a bug in them are simply never recorded.
 *
 * Localhost is excluded by default — dev sessions would burn the monthly replay
 * allowance with our own clicking. Append `?replay=1` to record locally when
 * verifying the integration.
 */
export function resolveSessionsPercent(location: Location): number {
  if (!isLocalHost(location.hostname)) return 100;
  const forced = new URLSearchParams(location.search).get(LOCAL_REPLAY_FLAG);
  return forced === "1" || forced === "true" ? 100 : 0;
}

/**
 * Replay capture options.
 *
 * The four "visibility" settings below invert Mixpanel's privacy-first defaults
 * on purpose — the request was to see the product as the user sees it. Note what
 * this does NOT expose: password, email, tel and hidden inputs, plus any input
 * with an autocomplete attribute, are masked by the SDK unconditionally and
 * cannot be unmasked by configuration.
 *
 * Escape hatches are wired up rather than left to a future code change: add
 * `mp-block` to a container to drop it from the replay entirely, or `mp-mask`
 * to keep its shape while hiding its text/value.
 */
export const REPLAY_CONFIG: Partial<Config> = {
  // --- Where the recorder comes from ---------------------------------------

  // Required because we import the `src/loaders/loader-module-with-async-modules`
  // entry to keep rrweb out of our bundle (see mixpanel.ts). That entry is
  // shipped un-built: `src/config.js` still holds the literal build-time token
  // `__MP_RECORDER_FILENAME__`, so the SDK requests
  // https://cdn.mxpnl.com/libs/__MP_RECORDER_FILENAME__ and Chrome rejects it
  // with ERR_BLOCKED_BY_ORB — silently, because the SDK does not surface a
  // failed recorder load. Recording then never starts and every config option
  // below still reads back correctly, which is exactly the failure a
  // config-inspecting test would call green. `recorder_src` is the supported
  // override and this is the same unversioned URL Mixpanel's own CDN snippet
  // uses, so core/recorder patch skew is a combination they support.
  recorder_src: "https://cdn.mxpnl.com/libs/mixpanel-recorder.min.js",

  // --- Visibility -----------------------------------------------------------

  // Default is "img, video", which would replace every generated doodle, every
  // skill card and every uploaded photo with an empty grey box. On an image
  // product that leaves a replay showing nothing but layout, so it is cleared.
  record_block_selector: "",

  // Default true: all on-screen text rendered as ▪▪▪▪. Prompts, agent replies,
  // skill names and error copy are exactly what we need to read to understand a
  // drop-off, so text is visible and only `.mp-mask` is hidden.
  record_mask_all_text: false,
  record_mask_text_selector: [`.${REPLAY_MASK_CLASS}`],

  // Default true: every input masked. The composer textarea is the single most
  // important element on the site; a masked one makes replays useless.
  record_mask_all_inputs: false,
  record_mask_input_selector: [`.${REPLAY_MASK_CLASS}`],

  // The boards and roadmap surfaces are tldraw, i.e. a single <canvas>. Without
  // this those replays are a blank rectangle. Mixpanel flags canvas capture as
  // experimental (rrweb UNSAFE_replayCanvas) and it costs frames — this is the
  // one option to turn off first if replay size or CPU becomes a problem.
  record_canvas: true,

  // Left at the default (false). Inlining every image as a data URI would show
  // doodles even if their URL later 404s, but our output lives on a permanent
  // public CDN (cdn.picxstudio.com), so it is pure payload bloat here.
  record_inline_images: false,

  // --- Debugging signal -----------------------------------------------------

  // Console logs/warnings/errors appear in the replay Activity Feed. Default is
  // already true; pinned so a default change cannot silently remove it.
  record_console: true,

  // Network timings + status codes in the Activity Feed. This is what turns "the
  // user gave up" into "the /api/chat call 500'd at 0:42".
  record_network: true,
  record_network_options: {
    // Only our own API traffic. Recording every img/script/css entry buries the
    // one failed fetch that matters.
    initiatorTypes: ["fetch", "xmlhttprequest"],
    // Analytics and replay ingest talking about itself, plus the poll endpoints
    // that would otherwise dominate the feed.
    ignoreRequestUrls: [
      "api-js\\.mixpanel\\.com",
      "cdn\\.mxpnl\\.com",
      "datafa\\.st",
      "google-analytics\\.com",
      "cloudflareinsights\\.com",
    ],
    // Deliberately empty. Request headers carry the session cookie and
    // Authorization; response bodies carry generated-image payloads. Status code
    // + duration answers the debugging question without storing either.
    recordHeaders: { request: [], response: [] },
    recordBodyUrls: { request: [], response: [] },
    // Capture the page-load waterfall that completed before recording started.
    recordInitialRequests: true,
  },

  // --- Interaction signal ---------------------------------------------------

  // Populates Heatmaps and emits $mp_rage_click / $mp_dead_click. These events
  // are exempt from the plan's event allowance, unlike Autocapture clicks, which
  // is why this is enabled and `autocapture` is not.
  record_heatmap_data: true,

  // --- Segmentation ---------------------------------------------------------

  // Defaults kept explicit: a replay ends after 30 min idle, 24 h max, and no
  // minimum length (short bounces are still captured). record_min_ms is the knob
  // to raise — up to 8000 — if the monthly replay allowance runs short.
  record_idle_timeout_ms: 1_800_000,
  record_max_ms: 86_400_000,
  record_min_ms: 0,
};
