/* Chat DOM rendering — message bubbles, thinking spinners, status, skill chip.
   No network IO, no localStorage writes. Pure DOM construction. */

import { setImageSrc } from "../dom-utils";
import { openLightbox } from "../lightbox";
import { addToMoodboard } from "../moodboard";
import { landOnBoard } from "../board-target";
import type { ChatMessage } from "../chat-store";
import { pushToCanvas } from "./canvas";
import {
  VIDEO_SLOW_AFTER_SECONDS,
  VIDEO_STALLED_AFTER_SECONDS,
} from "../../../lib/video/constants";
import { parseSuggestions, renderSuggestions } from "./suggestions";
import { getSkill } from "../../../lib/skills";
import { imageCountForSkill } from "../../../lib/credits/costs";

export const REFINE_PLACEHOLDER = "Ask for a change — thicker outline, warmer paper…";

export function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/* ---- Status & send button sync ---- */

export function setStatus(statusEl: HTMLElement, msg: string, err = false): void {
  statusEl.textContent = msg;
  statusEl.dataset.err = String(err);
}

export function syncSendState(
  sendBtn: HTMLButtonElement,
  sending: boolean,
  uploading: boolean,
): void {
  sendBtn.disabled = sending || uploading;
  const stopBtn = $("chatStopBtn");
  if (stopBtn) stopBtn.hidden = !sending;
  sendBtn.hidden = sending;
}

/* ---- Skill chip ---- */

export function syncSkillChip(
  skillChip: HTMLElement | null,
  skillChipLabel: HTMLElement | null,
  skill: { name: string } | undefined,
): void {
  if (!skillChip || !skillChipLabel) return;
  skillChip.hidden = !skill;
  if (skill) skillChipLabel.textContent = skill.name;
}

/* ---- Message rendering ---- */

export interface RenderContext {
  thread: HTMLElement;
  empty: HTMLElement;
  input: HTMLElement;
  onRemix: (userMsg: ChatMessage) => void;
  onDownload: (url: string) => void;
  /** A suggestion chip was tapped — prefill the composer and send it. */
  onSuggestion: (text: string) => void;
  /** Re-attach a persisted clip on history repaint: pending -> resume polling,
      ok -> show the clip, failed/refunded -> show the failure. Mounts its own
      card row (video cards are separate chat-msg rows, not bubble children). */
  onVideoResume?: (clip: { jobId: string; url?: string; status: string; skillId?: string; posterUrl?: string; queuedAt?: number }, precedingUserMessage: ChatMessage | null) => void;
}

export function renderMessage(
  ctx: RenderContext,
  msg: ChatMessage,
  precedingUserMessage: ChatMessage | null,
  /* On a history repaint, persisted clips are re-mounted as their own card rows
     (resume polling / show result). On the LIVE turn the card was already
     mounted by onVideo during the stream, so pass false to avoid a duplicate. */
  resumeVideos = true,
): { hasResult: boolean } {
  ctx.empty.hidden = true;
  const wrap = document.createElement("div");
  wrap.className = `chat-msg chat-msg-${msg.role}`;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  let hasResult = false;

  if (msg.imageUrl && !msg.images) {
    const img = document.createElement("img");
    img.className = "chat-bubble-photo";
    img.alt = "Attached photo";
    img.style.cursor = "pointer";
    setImageSrc(img, msg.imageUrl);
    img.addEventListener("click", () => openLightbox([msg.imageUrl!], msg.imageUrl!));
    bubble.appendChild(img);
  }

  /* Assistant replies are contracted to end with a numbered follow-up list
     (see the agent's "Post-generation suggestions" section). Split it off so
     the prose stays in the bubble and the list becomes tappable chips — until
     this existed the user had to retype a prompt we already generated. */
  const parsed = msg.role === "assistant" ? parseSuggestions(msg.content ?? "") : null;
  const bodyText = parsed ? parsed.body : msg.content;

  if (bodyText) {
    const p = document.createElement("p");
    p.style.margin = "0";
    p.textContent = bodyText;
    bubble.appendChild(p);
  }

  if (msg.images && msg.images.length > 0) {
    hasResult = true;
    ctx.input.dataset.placeholder = REFINE_PLACEHOLDER;

    const grid = document.createElement("div");
    grid.className = "chat-bubble-images";

    if (precedingUserMessage?.imageUrl) {
      const sourceCell = document.createElement("div");
      sourceCell.className = "chat-bubble-image-wrap chat-bubble-image-source";
      sourceCell.style.cursor = "pointer";
      const sourceImg = document.createElement("img");
      sourceImg.alt = "Source photo";
      sourceImg.loading = "lazy";
      setImageSrc(sourceImg, precedingUserMessage.imageUrl);
      sourceCell.appendChild(sourceImg);
      const sourceTag = document.createElement("span");
      sourceTag.className = "chat-bubble-image-tag";
      sourceTag.textContent = "Source";
      sourceCell.appendChild(sourceTag);
      sourceCell.addEventListener("click", () =>
        openLightbox([precedingUserMessage!.imageUrl!], precedingUserMessage!.imageUrl!),
      );
      grid.appendChild(sourceCell);
    }

    msg.images.forEach((url) => {
      const cell = document.createElement("div");
      cell.className = "chat-bubble-image-wrap";
      const img = document.createElement("img");
      img.alt = "Generated doodle";
      img.loading = "lazy";
      setImageSrc(img, url);
      cell.appendChild(img);

      /* Per-image download. The bubble-level button can only ever reach one
         URL, so on a 6-panel collage or a sticker sheet the other five results
         had no way out of the app. stopPropagation preserves the cell's own
         click-to-lightbox behaviour. */
      const cellDownload = document.createElement("button");
      cellDownload.type = "button";
      cellDownload.className = "chat-bubble-image-action";
      cellDownload.textContent = "↓";
      cellDownload.title = "Download this doodle";
      cellDownload.setAttribute("aria-label", "Download this doodle");
      cellDownload.addEventListener("click", (event) => {
        event.stopPropagation();
        ctx.onDownload(url);
      });
      cell.appendChild(cellDownload);

      cell.addEventListener("click", () => openLightbox(msg.images!, url));
      grid.appendChild(cell);
    });
    bubble.appendChild(grid);

    const actions = document.createElement("div");
    actions.className = "chat-bubble-actions";

    if (precedingUserMessage) {
      const remixBtn = document.createElement("button");
      remixBtn.type = "button";
      remixBtn.textContent = "Remix";
      remixBtn.addEventListener("click", () => ctx.onRemix(precedingUserMessage));
      actions.appendChild(remixBtn);
    }

    const images = msg.images;
    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.textContent = images.length > 1 ? `Download all ${images.length}` : "Download";
    downloadBtn.addEventListener("click", () => {
      /* Staggered: browsers treat a burst of synchronous programmatic
         downloads as a popup flood and silently drop all but the first. */
      images.forEach((url, i) => window.setTimeout(() => ctx.onDownload(url), i * 350));
    });
    actions.appendChild(downloadBtn);

    bubble.appendChild(actions);

    // Dual-write, deliberately. addToMoodboard keeps the localStorage mirror
    // that signed-out users and @mention autocomplete read from; landOnBoard
    // puts the image on a real board (the Inbox, or the board this chat was
    // opened from) so it is findable, movable and shareable. The legacy
    // moodboard_item table is retained for one release, so both run.
    msg.images.forEach((url) => {
      addToMoodboard(url);
      landOnBoard(url);
    });
  }

  if (parsed && parsed.suggestions.length > 0) {
    const row = renderSuggestions(parsed.suggestions, ctx.onSuggestion);
    if (row) bubble.appendChild(row);
  }

  wrap.appendChild(bubble);
  ctx.thread.appendChild(wrap);
  ctx.thread.scrollTop = ctx.thread.scrollHeight;

  // Persisted clips render as their own card rows after this message's bubble.
  if (msg.videos && msg.videos.length > 0) {
    hasResult = true;
    if (resumeVideos && ctx.onVideoResume) {
      msg.videos.forEach((clip) => ctx.onVideoResume!(clip, precedingUserMessage));
    }
  }

  return { hasResult };
}

/* ---- Streaming/thinking bubble ---- */

export interface StreamingBubble {
  wrap: HTMLElement;
  setText: (text: string) => void;
  /** Name the step in progress, e.g. "Drawing…" / "Arranging the canvas…". */
  setPhase: (label: string) => void;
  /**
   * Image generation has started for `skillId` — reserve the real image box.
   * Separate from setPhase because this is not a label change: it reshapes the
   * bubble into the layout the result will occupy.
   */
  setDrawing: (skillId: string | undefined) => void;
}

export function renderThinking(thread: HTMLElement): StreamingBubble {
  const wrap = document.createElement("div");
  wrap.className = "chat-msg chat-msg-assistant";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble chat-bubble-thinking";
  const spinner = document.createElement("span");
  spinner.className = "chat-thinking-spinner";
  const label = document.createElement("span");
  label.textContent = "Thinking…";
  bubble.appendChild(spinner);
  bubble.appendChild(label);
  wrap.appendChild(bubble);
  thread.appendChild(wrap);
  thread.scrollTop = thread.scrollHeight;

  let streaming = false;
  let elapsedTimer: number | null = null;
  return {
    wrap,
    /**
     * Swap the small "Drawing…" pill for a placeholder the SIZE AND SHAPE of the
     * images that are coming.
     *
     * The pill was honest but useless: a 5-15 second wait showed a 40px chip in
     * a wide empty thread, so the reply appeared to arrive from nowhere and the
     * layout jumped when it did. Reserving the real box up front means the
     * arriving image drops into a space already the right shape — no reflow, and
     * the wait reads as "an image is being made here" rather than "something is
     * happening somewhere".
     *
     * Sized from the skill itself (aspect ratio and frame count), so a 9-frame
     * expression pack reserves nine tiles and a 3:2 collage reserves a landscape
     * one. Both are read from the same functions that priced and generated the
     * run, so the placeholder cannot disagree with what turns up.
     *
     * There is no progress bar because there is no progress to report: PicX
     * returns one image per call with no intermediate signal, so a filling bar
     * would be an animation pretending to be data. An elapsed clock is what we
     * actually know.
     */
    setDrawing(skillId: string | undefined) {
      if (streaming) return;
      const skill = skillId ? getSkill(skillId) : undefined;
      const ratio = skill?.aspectRatio === "3:2" ? "3 / 2" : "1 / 1";
      let count = 1;
      try {
        // Guarded: a video skill has no frame count and throws by design, and an
        // unknown id would too. Either way one tile is the right fallback.
        if (skillId && skill?.kind !== "video") count = imageCountForSkill(skillId);
      } catch {
        count = 1;
      }

      bubble.className = "chat-bubble chat-bubble-drawing";
      bubble.textContent = "";

      const head = document.createElement("div");
      head.className = "chat-drawing-head";
      const headSpinner = document.createElement("span");
      headSpinner.className = "chat-thinking-spinner";
      headSpinner.setAttribute("aria-hidden", "true");
      const headLabel = document.createElement("span");
      headLabel.setAttribute("role", "status");
      head.appendChild(headSpinner);
      head.appendChild(headLabel);
      bubble.appendChild(head);

      const grid = document.createElement("div");
      // The SAME grid class the finished images use, so the tiles land in the
      // identical columns rather than a second layout that approximates them.
      grid.className = "chat-bubble-images";
      for (let i = 0; i < count; i++) {
        const cell = document.createElement("div");
        cell.className = "chat-skeleton-cell";
        cell.style.aspectRatio = ratio;
        grid.appendChild(cell);
      }
      bubble.appendChild(grid);

      const started = Date.now();
      const noun = count > 1 ? `${count} doodles` : "your doodle";
      const tick = (): void => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        headLabel.textContent = seconds < 2 ? `Drawing ${noun}…` : `Drawing ${noun}… ${seconds}s`;
      };
      tick();
      if (elapsedTimer !== null) window.clearInterval(elapsedTimer);
      elapsedTimer = window.setInterval(tick, 1000);
      thread.scrollTop = thread.scrollHeight;
    },
    setText(text: string) {
      if (!text) return;
      if (!streaming) {
        streaming = true;
        // Prose has started, so the skeleton's elapsed clock is done — leaving it
        // running would keep counting behind a bubble that no longer shows it.
        if (elapsedTimer !== null) {
          window.clearInterval(elapsedTimer);
          elapsedTimer = null;
        }
        bubble.className = "chat-bubble chat-bubble-streaming";
        bubble.textContent = "";
      }
      bubble.textContent = text;
      thread.scrollTop = thread.scrollHeight;
    },
    setPhase(phaseLabel: string) {
      /* Once prose has started streaming the bubble IS the reply, so a phase
         update would overwrite the user's answer. Tool calls normally precede
         the final text, so in practice the label is seen. */
      if (streaming) return;
      label.textContent = phaseLabel;
    },
  };
}

/* ---- Error bubble ---- */

/**
 * A failed turn used to vanish: the thinking bubble was removed and the reason
 * appeared in the status line under the composer, leaving the thread looking
 * like nothing happened and no way forward but retyping. This keeps the failure
 * in place and offers the retry path that `remix()` already implements.
 */
export function renderError(
  thread: HTMLElement,
  message: string,
  onRetry: (() => void) | null,
): void {
  const wrap = document.createElement("div");
  wrap.className = "chat-msg chat-msg-assistant";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble chat-bubble-error";
  bubble.setAttribute("role", "alert");

  const p = document.createElement("p");
  p.style.margin = "0";
  p.textContent = message;
  bubble.appendChild(p);

  if (onRetry) {
    const actions = document.createElement("div");
    actions.className = "chat-bubble-actions";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => {
      // One shot — a dead retry button after the row is replaced reads as broken.
      wrap.remove();
      onRetry();
    });
    actions.appendChild(retry);
    bubble.appendChild(actions);
  }

  wrap.appendChild(bubble);
  thread.appendChild(wrap);
  thread.scrollTop = thread.scrollHeight;
}

/* ---- Out-of-credits call to action ---- */

/**
 * Credit exhaustion arrives as agent PROSE (the tool returns a status and the
 * model explains it), so the highest-intent moment in the product — someone who
 * wants another doodle and cannot have one — used to terminate in a sentence
 * with nothing to click. The upgrade dialog already exists and is wired from
 * settings, the credit packs and the sidebar hint; this is the fourth entry
 * point, in the place the wall is actually hit.
 */
export function renderCreditsCta(thread: HTMLElement): void {
  const wrap = document.createElement("div");
  wrap.className = "chat-msg chat-msg-assistant chat-msg-cta";
  const actions = document.createElement("div");
  actions.className = "chat-bubble-actions chat-credits-cta";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "chat-credits-cta-btn";
  button.textContent = "Get more credits";
  button.addEventListener("click", () => {
    window.dispatchEvent(
      new CustomEvent("doodleai:open-upgrade-contact", { detail: { pack: "more credits" } }),
    );
  });

  actions.appendChild(button);
  wrap.appendChild(actions);
  thread.appendChild(wrap);
  thread.scrollTop = thread.scrollHeight;
}

/**
 * A wait a person can read at a glance.
 *
 * Past a minute, raw seconds stop being legible — "247s" makes you do division
 * to find out you have been waiting four minutes. Switches to minutes once there
 * is more than one, and stays in whole units because a stalled render does not
 * need decimal precision.
 */
function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 2) return rest ? `1 min ${rest}s` : "1 min";
  return `${minutes} min`;
}

/* ---- Video card ----
   Async clips are rendered by their own card, not the image grid: there is no
   url at first (the job is queued upstream and resolves by webhook into our D1
   row), and an mp4 in an <img> paints a broken-image icon — so DONE uses a real
   <video>. States: QUEUED/RENDERING (elapsed + estimate, no fake progress bar),
   DONE (muted/loop/playsinline/controls + download), FAILED (reason + retry). */

export type VideoCardState =
  /** `startedAt` is when the job was QUEUED (epoch ms), not when this card was
   *  mounted. They differ after a reload, and using mount time made the clock
   *  restart at 0 and under-report a long wait — the opposite of honest. */
  | { phase: "rendering"; estimatedSeconds: number; startedAt: number }
  | { phase: "done"; url: string; posterUrl?: string }
  | { phase: "failed"; reason: string };

export interface VideoCardHandle {
  /** Root element, so the poller can detect it leaving the DOM. */
  el: HTMLElement;
  /** Replace the card's contents for a new state (queued -> done/failed). */
  render: (state: VideoCardState) => void;
}

/**
 * Build a video card and mount it. `onRetry` re-runs the originating prompt
 * (remix), `onDownload` fetches the clip as a file. The returned handle lets
 * the poller swap RENDERING -> DONE/FAILED without rebuilding the row.
 */
export function renderVideoCard(
  thread: HTMLElement,
  initial: VideoCardState,
  handlers: { onRetry: (() => void) | null; onDownload: (url: string) => void },
): VideoCardHandle {
  const wrap = document.createElement("div");
  wrap.className = "chat-msg chat-msg-assistant";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble chat-video-card";
  wrap.appendChild(bubble);
  thread.appendChild(wrap);
  thread.scrollTop = thread.scrollHeight;

  let elapsedTimer: number | null = null;
  function stopElapsed(): void {
    if (elapsedTimer !== null) {
      window.clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  function paint(state: VideoCardState): void {
    stopElapsed();
    bubble.textContent = "";
    bubble.dataset.phase = state.phase;

    if (state.phase === "rendering") {
      const row = document.createElement("div");
      row.className = "chat-video-progress";
      const spinner = document.createElement("span");
      spinner.className = "chat-video-spinner";
      spinner.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "chat-video-progress-label";
      label.setAttribute("role", "status");
      row.appendChild(spinner);
      row.appendChild(label);
      bubble.appendChild(row);

      /* Counted from when the job was QUEUED, so a reload shows the real wait
         instead of starting over at 0. */
      const started = state.startedAt;
      const tick = (): void => {
        const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));

        /* Still no progress bar and still no percentage — the provider reports
           no progress, so any bar would be an animation pretending to be data.
           What DOES change is the sentence, because "usually under 20s" stops
           being information the moment we are past 20s and becomes a claim the
           screen is actively contradicting. Three honest bands:

           within estimate — the normal case, state the expectation;
           slow           — drop the expectation, say plainly it is running long;
           stalled        — say it may take a while AND that they can leave, which
                            is true: the clip arrives by webhook onto our own row
                            and the thread re-attaches to it on next load.

           `data-wait` is exposed so CSS can calm the spinner down in the later
           bands without this function knowing anything about styling. */
        let text: string;
        let band: "normal" | "slow" | "stalled";
        if (elapsed >= VIDEO_STALLED_AFTER_SECONDS) {
          band = "stalled";
          text =
            `Still working on it — ${formatWait(elapsed)} so far. ` +
            `This one is taking much longer than usual. You can close this and come back; ` +
            `it will be here when it is ready.`;
        } else if (elapsed >= VIDEO_SLOW_AFTER_SECONDS) {
          band = "slow";
          text = `Still working on it — ${formatWait(elapsed)} so far, longer than it usually takes.`;
        } else {
          band = "normal";
          text = `Bringing your doodle to life… ${elapsed}s (usually under ${state.estimatedSeconds}s)`;
        }
        label.textContent = text;
        bubble.dataset.wait = band;
      };
      tick();
      elapsedTimer = window.setInterval(tick, 1000);
    } else if (state.phase === "done") {
      const video = document.createElement("video");
      video.className = "chat-video-el";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.controls = true;
      video.preload = "metadata";
      if (state.posterUrl) video.poster = state.posterUrl;
      // <source> not src=: lets the browser skip a type it can't play instead
      // of showing a broken element, same reasoning as never using <img>.
      const source = document.createElement("source");
      source.src = state.url;
      source.type = "video/mp4";
      video.appendChild(source);
      bubble.appendChild(video);
      // Autoplay only where motion is welcome; reduced-motion users get a
      // paused clip with controls (CSS also disables the pulse). Failure to
      // autoplay is fine — controls are always present.
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        video.autoplay = true;
        void video.play().catch(() => {});
      }

      /* A finished animation used to offer Download and nothing else, which made
         it a dead end: the clip could not be viewed larger than this ~30%-wide
         column, and it could not be put on the board beside the doodle it came
         from. Both destinations exist now, so both are offered. `url` is captured
         per-state rather than read from a closure over `initial`, so these still
         point at the right clip after a rendering -> done repaint. */
      const doneUrl = state.url;
      // Poster (migration 0018) carried onto the lightbox and canvas items too,
      // captured per-state alongside doneUrl so a rendering -> done repaint keeps
      // them pointing at the right clip. undefined for reference/text clips.
      const donePoster = state.posterUrl;
      const actions = document.createElement("div");
      actions.className = "chat-bubble-actions";

      const view = document.createElement("button");
      view.type = "button";
      view.textContent = "View";
      view.addEventListener("click", () =>
        openLightbox([{ url: doneUrl, isVideo: true, posterUrl: donePoster }], doneUrl),
      );
      actions.appendChild(view);

      const toCanvas = document.createElement("button");
      toCanvas.type = "button";
      toCanvas.textContent = "Add to canvas";
      toCanvas.addEventListener("click", () => {
        pushToCanvas([{ url: doneUrl, isVideo: true, posterUrl: donePoster }]);
        // The board may be closed (the user dismissed it), so make the button's
        // effect visible rather than silently succeeding somewhere off-screen.
        window.dispatchEvent(new Event("doodleai:canvas-open"));
      });
      actions.appendChild(toCanvas);

      const download = document.createElement("button");
      download.type = "button";
      download.textContent = "Download";
      download.addEventListener("click", () => handlers.onDownload(doneUrl));
      actions.appendChild(download);

      bubble.appendChild(actions);
    } else {
      // failed
      bubble.classList.add("chat-video-failed");
      bubble.setAttribute("role", "alert");
      const p = document.createElement("p");
      p.className = "chat-video-reason";
      p.textContent = state.reason;
      bubble.appendChild(p);
      const refund = document.createElement("p");
      refund.className = "chat-video-refund";
      refund.textContent = "Your credits were refunded.";
      bubble.appendChild(refund);
      if (handlers.onRetry) {
        const actions = document.createElement("div");
        actions.className = "chat-bubble-actions";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Try again";
        retry.addEventListener("click", () => handlers.onRetry!());
        actions.appendChild(retry);
        bubble.appendChild(actions);
      }
    }
    thread.scrollTop = thread.scrollHeight;
  }

  paint(initial);
  return { el: wrap, render: paint };
}

/* ---- Download helper ---- */

export async function downloadImage(url: string): Promise<void> {
  await downloadFile(url, "doodleai-doodle.png");
}

export async function downloadVideo(url: string): Promise<void> {
  await downloadFile(url, "doodleai-clip.mp4");
}

async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    const objUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename;
    link.href = objUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    const link = document.createElement("a");
    link.download = filename;
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}
