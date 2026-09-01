/* Watching an animation come back, and keeping its card honest while we wait.
 *
 * HOW LONG THE WAIT ACTUALLY IS. VIDEO_ESTIMATED_SECONDS is 20 (it was 75),
 * measured off four live renders that landed in 4.5-7.6s. So this is a short
 * beat, not a vigil: the card shows a spinner and a truthful clock counting up
 * against that expectation, and nothing else. No progress bar and no percentage
 * — the model reports no progress, so any bar would be an animation pretending
 * to be data. The 30-minute VIDEO_TIMEOUT_MINUTES stays what it is: a backstop
 * for a webhook that never arrives, not a description of the wait.
 *
 * WHY THIS POLLS, AND WHAT IT DOES NOT POLL. The upstream result is pushed, not
 * pulled: PicX POSTs the finished clip exactly once to /api/webhooks/picx, which
 * writes it onto our own `generation` row. This module therefore never talks to
 * PicX, never carries the platform API key, and nothing holds a connection open
 * for the length of a render. It reads OUR row — a single indexed D1 lookup by
 * primary key — which is cheap enough to repeat every few seconds and stays
 * correct even if the tab was closed and reopened halfway through (index.ts
 * re-attaches a `pending` clip on load through this same function).
 *
 * The rejected alternative was streaming the upstream SSE through the chat
 * response: it would pin a Worker invocation to a multi-minute render and lose
 * the clip entirely if the user navigated away.
 */
import { updateThreadVideo, setThreadThumbnail, setThreadTitleIfUnset } from "../chat-store";
import { pushToCanvas, invalidateThreadMediaCache, latestStillUrl } from "./canvas";
import { getSkill } from "../../../lib/skills";
import { renderVideoCard, downloadVideo, type VideoCardHandle } from "./render";
import { VIDEO_ESTIMATED_SECONDS, VIDEO_TIMEOUT_MINUTES } from "../../../lib/video/constants";

interface VideoResponse {
  video?: {
    id: string;
    status: string;
    outputUrl: string | null;
    errorCode: string | null;
    durationSeconds: number | null;
    estimatedSeconds: number;
    /** First-frame still (migration 0018). Non-null only for an 'image'-mode clip. */
    posterUrl?: string | null;
  };
}

/* POLL CADENCE, AND WHY IT IS FASTER THAN IT WAS.
 *
 * Four measured live renders landed in 4.5s, 4.6s, 5.3s and 7.6s. The old first
 * poll at 3s widening by 1.3 meant a 4.5s animation was often only noticed at
 * ~6.9s — half again as long as it actually took, spent staring at a spinner
 * for something already finished. First look at 1.2s and a tighter ceiling put
 * the reveal within about a second of the truth. Each poll is one indexed
 * lookup on our own row, so this costs a handful of cheap reads per animation.
 * It still widens, because a 15s request is allowed and should not be polled at
 * 1.2s for half a minute. */
const FIRST_INTERVAL_MS = 1_200;
const MAX_INTERVAL_MS = 5_000;
const TIMEOUT_MS = VIDEO_TIMEOUT_MINUTES * 60_000;
const TERMINAL = new Set(["ok", "failed", "refunded"]);

/** Live watchers by job id, so nothing can double-poll or outlive its card. */
const active = new Map<string, () => void>();

export interface StartVideoJobOptions {
  thread: HTMLElement;
  threadId: string;
  jobId: string;
  /** The tool's estimate. 0 when re-attaching after a reload — fall back to the default. */
  estimatedSeconds: number;
  /** Re-runs the originating prompt. Null when there is nothing to remix. */
  onRetry: (() => void) | null;
  /** The skill that produced this clip, used to name the thread. Optional: a
   *  reload re-attach may not know it, and a missing name simply skips naming. */
  skillId?: string;
}

/** Tell the shell a clip is in flight / settled.
 *
 *  Needed because on a phone the canvas takes the whole screen and the chat
 *  column carrying the clip's card is `display:none`, so a user watching the
 *  board would otherwise see no sign that anything is happening. */
function announcePhase(phase: "rendering" | "done" | "failed"): void {
  window.dispatchEvent(new CustomEvent("doodleai:clip-phase", { detail: { phase } }));
}

/**
 * Mount a rendering card for `jobId` and watch it to a terminal state.
 *
 * Safe to call twice for the same job (a re-render, or a reload racing the
 * stream): the previous watcher is cancelled first.
 */
export function startVideoJob(options: StartVideoJobOptions): VideoCardHandle {
  const { thread, threadId, jobId, onRetry } = options;
  active.get(jobId)?.();

  const estimatedSeconds = options.estimatedSeconds > 0 ? options.estimatedSeconds : VIDEO_ESTIMATED_SECONDS;

  /* The source doodle, captured BEFORE the clip lands — once it does, the
     animation is itself in the thread's media and "the newest still" would have
     to skip past it. This is NOT the poster: the backend sends a real first
     frame (migration 0018) and that wins. It is only the sidebar thumbnail
     fallback for a clip whose mode produced no first frame, because the sidebar
     paints with img.src and an mp4 there is a broken-image icon. */
  const sourceStillUrl = latestStillUrl(threadId);

  const card = renderVideoCard(
    thread,
    { phase: "rendering", estimatedSeconds },
    { onRetry, onDownload: (url) => void downloadVideo(url) },
  );
  announcePhase("rendering");

  const startedAt = Date.now();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interval = FIRST_INTERVAL_MS;

  const stop = (): void => {
    stopped = true;
    if (timer) clearTimeout(timer);
    active.delete(jobId);
  };

  const fail = (reason: string, status: string): void => {
    card.render({ phase: "failed", reason });
    updateThreadVideo(threadId, jobId, { status });
    announcePhase("failed");
    stop();
  };

  /* The shared failure card in render.ts appends "Your credits were refunded."
   * to EVERY failure, unconditionally. That is true for the normal failure
   * terminal — the webhook refunds and writes status 'refunded' in the same
   * breath — but it is NOT true for the two cases below:
   *
   *   • the job row is gone (404): nothing was ever charged to refund;
   *   • we stopped watching after the timeout: the animation may still be
   *     working, and the hourly sweep is what refunds it if it never lands.
   *
   * Leaving the line there would tell the user their credits are already back
   * when they may not be. render.ts is not this lane's file, so the line is
   * removed from the card after painting rather than edited at its source. If
   * that class ever disappears this quietly does nothing, which is the safe
   * direction: the reason text below stands on its own either way. */
  const failWithoutRefundClaim = (reason: string, status: string): void => {
    fail(reason, status);
    card.el.querySelector(".chat-video-refund")?.remove();
  };

  const poll = async (): Promise<void> => {
    if (stopped) return;

    // The card was removed from the thread (navigation, thread switch). Stop
    // rather than keep a timer alive for an element nobody can see.
    if (!card.el.isConnected) {
      stop();
      return;
    }

    if (Date.now() - startedAt > TIMEOUT_MS) {
      // Deliberately NOT reported as a failure: the job may still complete
      // server-side, and if it truly never arrives the hourly sweep refunds it.
      // Saying "failed" here would be a guess, and saying "refunded" would be a
      // promise we cannot keep yet.
      failWithoutRefundClaim(
        `This usually takes a few seconds, and it has been ${VIDEO_TIMEOUT_MINUTES} minutes, so we stopped waiting here. ` +
          `If it never arrives, your credits come back on their own — open this again later to check.`,
        "pending",
      );
      return;
    }

    try {
      const res = await fetch(`/api/v1/videos/${encodeURIComponent(jobId)}`, {
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) {
        // Gone, or never ours. Stop rather than hammer a URL that cannot resolve.
        failWithoutRefundClaim("We lost track of this one. Nothing was charged for it.", "failed");
        return;
      }
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as VideoResponse;
        const video = data.video;
        if (video && TERMINAL.has(video.status)) {
          if (video.status === "ok" && video.outputUrl) {
            // posterUrl (migration 0018) is the clip's first frame, present only
            // for an 'image'-mode clip; undefined for reference/text, where the
            // card simply has no poster and shows the mp4's own first frame once
            // it loads. Threaded through the card, the store and the board.
            const posterUrl = video.posterUrl ?? undefined;
            card.render({ phase: "done", url: video.outputUrl, posterUrl });
            updateThreadVideo(threadId, jobId, { status: "ok", url: video.outputUrl, posterUrl });
            /* This is the ONLY moment the finished animation exists client-side,
               so it is where it reaches the board. The still path pushes from the
               stream's `image` event, but a clip has no URL then — only a job id
               — so nothing was ever dispatched for it and the canvas stayed
               images-only. The media cache is invalidated first because it was
               built before this clip had a url and would otherwise keep serving a
               list that omits it on the next collect. */
            invalidateThreadMediaCache();
            pushToCanvas([{ url: video.outputUrl, isVideo: true, posterUrl }]);

            /* Name the thread off the animation. Only the image path did this, so
               a thread whose only result was an animation stayed "New chat" with
               a blank tile forever. Prefer the clip's real first frame, fall back
               to the source doodle, and if there is neither (text-to-animation,
               no first frame) still take the NAME and leave the tile empty —
               an mp4 in the sidebar's img.src paints a broken-image icon. */
            const skillName = options.skillId ? getSkill(options.skillId)?.name : undefined;
            if (skillName) {
              const tile = posterUrl ?? sourceStillUrl;
              if (tile) setThreadThumbnail(threadId, tile, skillName);
              else setThreadTitleIfUnset(threadId, skillName);
            }

            announcePhase("done");
            stop();
          } else {
            // 'refunded' is the normal failure terminal — the webhook puts the
            // credits back in the same write that marks the row, so the card's
            // refund line is kept here and says so plainly rather than leaving
            // the user wondering whether they paid for nothing.
            fail("That didn't come out.", video.status);
          }
          return;
        }
      }
    } catch {
      /* A dropped request is not a failed clip — keep waiting. */
    }

    interval = Math.min(Math.round(interval * 1.35), MAX_INTERVAL_MS);
    timer = setTimeout(poll, interval);
  };

  timer = setTimeout(poll, FIRST_INTERVAL_MS);
  active.set(jobId, stop);
  return card;
}

/** Stop every watcher. Called on navigation so no timer outlives its card. */
export function stopAllVideoJobs(): void {
  for (const stop of [...active.values()]) stop();
}

if (typeof window !== "undefined") {
  // Astro view transitions swap the DOM without a full reload, so a card's
  // watcher would otherwise keep polling for a page nobody is looking at.
  window.addEventListener("beforeunload", stopAllVideoJobs);
  document.addEventListener("astro:before-swap", stopAllVideoJobs);
}
