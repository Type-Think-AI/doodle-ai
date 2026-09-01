/* Watching an image generation.
 *
 * Images are webhook-delivered — the synchronous render was removed on
 * 2026-09-01 — so a turn no longer ends with URLs in hand. The tool returns
 * `queued` with a job id, PicX POSTs each finished frame to
 * /api/webhooks/picx, and this module reads OUR OWN `generation` row until the
 * set is done.
 *
 * It never talks to PicX and never carries the platform key. Each read is one
 * indexed D1 lookup by primary key, which is why polling our row is cheap where
 * polling the provider would not be — and it survives a reload, because the row
 * is the source of truth rather than the open request.
 *
 * A pack skill reveals progressively: the route returns the frames that have
 * landed so far, so 9 images appear as they arrive instead of all at the end.
 */
import { VIDEO_TIMEOUT_MINUTES } from "../../../lib/video/constants";

interface GenerationResponse {
  video?: {
    id: string;
    status: string;
    outputUrl: string | null;
    outputUrls?: string[];
    framesTotal?: number;
    framesPending?: number;
    errorCode: string | null;
  };
}

/* An image render is seconds, not minutes, so this starts tighter than the video
   watcher and widens less. */
const FIRST_INTERVAL_MS = 1_500;
const MAX_INTERVAL_MS = 5_000;
/* Generous ceiling: a 9-frame pack is 9 independent renders and the last one can
   land well after the first. Reuses the video budget rather than inventing a
   second timeout constant. */
const TIMEOUT_MS = VIDEO_TIMEOUT_MINUTES * 60_000;
const TERMINAL = new Set(["ok", "failed", "refunded"]);

const active = new Map<string, () => void>();

export interface StartImageJobOptions {
  jobId: string;
  /** How many images to expect, for the placeholder. */
  frames: number;
  /** Called for each newly delivered image, in frame order. */
  onImage: (url: string) => void;
  /** Terminal failure — the credits are already back by the time this fires. */
  onFailed: (message: string) => void;
  /** Called once the set is complete, delivered or not. */
  onSettled?: () => void;
}

/**
 * Watch one image generation to completion. Safe to call twice for the same job:
 * the previous watcher is cancelled first, so a re-render cannot double-poll.
 */
export function startImageJob(options: StartImageJobOptions): () => void {
  const { jobId, onImage, onFailed } = options;
  active.get(jobId)?.();

  const startedAt = Date.now();
  /* Frames already handed to the caller. The row is re-read in full each tick, so
     without this a pack would re-emit every earlier frame on every poll. */
  const seen = new Set<string>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interval = FIRST_INTERVAL_MS;

  const stop = (): void => {
    stopped = true;
    if (timer) clearTimeout(timer);
    active.delete(jobId);
    options.onSettled?.();
  };

  const emitNew = (urls: string[]): void => {
    for (const url of urls) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      onImage(url);
    }
  };

  const poll = async (): Promise<void> => {
    if (stopped) return;

    if (Date.now() - startedAt > TIMEOUT_MS) {
      /* Deliberately not called a failure: the render may still complete, and if
         it never does the hourly sweep refunds it. Claiming either outcome here
         would be a guess. */
      onFailed(
        `This is taking longer than ${VIDEO_TIMEOUT_MINUTES} minutes, so we stopped watching. ` +
          `If it never finishes, the credits are returned automatically — reload later to check.`,
      );
      stop();
      return;
    }

    try {
      const res = await fetch(`/api/v1/videos/${encodeURIComponent(jobId)}`, {
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) {
        onFailed("We lost track of this generation. Nothing was charged for it.");
        stop();
        return;
      }
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as GenerationResponse;
        const row = data.video;
        if (row) {
          // Reveal whatever has landed, even while siblings are still rendering.
          emitNew(row.outputUrls ?? (row.outputUrl ? [row.outputUrl] : []));
          if (TERMINAL.has(row.status)) {
            if (row.status !== "ok" && seen.size === 0) {
              onFailed("That didn't come out. Your credits were refunded — want to try again?");
            }
            stop();
            return;
          }
        }
      }
    } catch {
      /* A dropped request is not a failed generation — keep waiting. */
    }

    interval = Math.min(Math.round(interval * 1.25), MAX_INTERVAL_MS);
    timer = setTimeout(poll, interval);
  };

  timer = setTimeout(poll, FIRST_INTERVAL_MS);
  active.set(jobId, stop);
  return stop;
}

/** Stop every watcher, so no timer outlives the page it belongs to. */
export function stopAllImageJobs(): void {
  for (const stop of [...active.values()]) stop();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", stopAllImageJobs);
  document.addEventListener("astro:before-swap", stopAllImageJobs);
}
