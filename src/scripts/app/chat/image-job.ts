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
import { describeGenerationFailure } from "./generation-error";

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
/**
 * How long to keep watching before telling the user we stopped.
 *
 * This used to reuse VIDEO_TIMEOUT_MINUTES (30) "rather than inventing a second
 * timeout constant", which was the wrong economy: a clip legitimately renders for
 * tens of minutes, an image is seconds, and the file's own comment two lines up
 * said so. The result was a spinner observed counting past 545 seconds with 21
 * more minutes to go and no error in sight.
 *
 * 8 minutes is deliberately just under the server's own 10-minute stuck-pending
 * threshold (STUCK_PENDING_MINUTES in src/lib/credits/reconcile.ts). Sitting
 * below it means the user is told something before the sweep is even eligible to
 * act, so the interface is never the last to know.
 *
 * A 9-frame pack is 9 independent renders and the last can land well after the
 * first, which is what the generous side of this budget is for.
 */
const IMAGE_TIMEOUT_MINUTES = 8;
const TIMEOUT_MS = IMAGE_TIMEOUT_MINUTES * 60_000;
const TERMINAL = new Set(["ok", "failed", "refunded"]);

const active = new Map<string, () => void>();
/* Kept separate from `active`: a page teardown must stop watchers SILENTLY,
   whereas a user pressing stop needs a message. Same jobs, two exits. */
const cancels = new Map<string, () => void>();

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
    cancels.delete(jobId);
    options.onSettled?.();
  };

  /* Stopping because the USER asked, which is a different thing from the page
     going away: it needs a line on screen, or pressing stop just freezes the
     spinner at whatever second it had reached. Deliberately does not claim a
     refund — the work may well still land, and the sweep settles the money either
     way, so promising anything here would be a guess. */
  const cancel = (): void => {
    if (stopped) return;
    if (seen.size === 0) {
      onFailed(
        "Stopped. If it had already started, your credits come back automatically when it settles.",
      );
    }
    stop();
  };
  cancels.set(jobId, cancel);

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
        `This is taking longer than ${IMAGE_TIMEOUT_MINUTES} minutes, so we stopped waiting. ` +
          `If it never finishes, your credits come back automatically — reload later to check.`,
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
              /* The row has always carried WHY this failed and the read route has
                 always returned it; this is the first thing to actually read it,
                 so an unreadable photo no longer reads as a generic flop with
                 "try again" as the only advice. */
              onFailed(
                describeGenerationFailure(row.errorCode, row.status === "refunded").message,
              );
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

/** Stop every watcher silently, so no timer outlives the page it belongs to. */
export function stopAllImageJobs(): void {
  for (const stop of [...active.values()]) stop();
  cancels.clear();
}

/**
 * Stop every watcher BECAUSE THE USER ASKED, leaving a line on screen for each.
 *
 * This is what the composer's stop button needs. Before this it only called
 * `sendState.activeAbort.abort()`, which cuts the response stream and does
 * nothing whatsoever to this poll loop — the loop reads our own D1 row over a
 * separate request, so the spinner kept counting after stop was pressed.
 */
export function cancelAllImageJobs(): void {
  for (const cancel of [...cancels.values()]) cancel();
  cancels.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", stopAllImageJobs);
  document.addEventListener("astro:before-swap", stopAllImageJobs);
}
