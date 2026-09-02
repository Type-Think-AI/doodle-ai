/* Canvas bridge — tldraw split-panel management, image queue, and resize.
   Communicates with the React island via CustomEvents on window and the
   __doodleCanvasQueue backlog array. No network IO. */

import { loadThread } from "../chat-store";
import type { CanvasOp, CanvasDigest } from "../../../lib/canvas/ops";
import {
  normalizeCanvasMedia,
  type CanvasMediaInput,
  type CanvasMediaItem,
} from "../../../lib/canvas/media";

/* ---- Thread media collection ---- */

let _threadMediaCache: CanvasMediaItem[] | null = null;

/**
 * Everything in a thread that belongs on the board, in the order it was made.
 *
 * Walks each message once and emits its still(s) followed by its animation(s),
 * so a turn that produced a doodle and then animated it reads left-to-right in
 * that order on the canvas rather than having all the stills bunched first.
 *
 * A clip is included ONLY once it has actually landed (`status === "ok"` and a
 * url). The other states must not reach the board: a `pending` clip has no url
 * at all, and a `failed`/`refunded` one would otherwise be placed as a shape
 * pointing at nothing — a permanent broken tile for a generation the user was
 * already refunded for.
 */
export function collectThreadMedia(threadId: string): CanvasMediaItem[] {
  if (_threadMediaCache) return _threadMediaCache;
  const items: CanvasMediaItem[] = [];
  for (const msg of loadThread(threadId)) {
    if (msg.imageUrl) items.push({ url: msg.imageUrl, isVideo: false });
    if (msg.images) {
      for (const url of msg.images) items.push({ url, isVideo: false });
    }
    if (msg.videos) {
      for (const clip of msg.videos) {
        // posterUrl (migration 0018) is carried through for the lightbox, which
        // paints it before playback; the tldraw canvas ignores it (its video
        // asset has no poster field — see lib/canvas/media.ts).
        if (clip.status === "ok" && clip.url)
          items.push({ url: clip.url, isVideo: true, posterUrl: clip.posterUrl });
      }
    }
  }
  _threadMediaCache = items;
  return items;
}

export function invalidateThreadMediaCache(): void {
  _threadMediaCache = null;
}

/**
 * The newest still in a thread, or undefined if it holds only animations.
 *
 * Used as an animation's poster frame and as the thread's sidebar thumbnail. For
 * the dominant path — animating a doodle you just made — this IS the honest
 * first frame. For a text-to-animation with no source doodle it returns
 * undefined, and callers must leave the poster empty rather than substitute an
 * unrelated image: a poster showing something the animation does not contain is
 * worse than a black frame.
 */
export function latestStillUrl(threadId: string): string | undefined {
  const stills = collectThreadMedia(threadId).filter((item) => !item.isVideo);
  return stills.length ? stills[stills.length - 1]!.url : undefined;
}

/* ---- Push to canvas island ---- */

declare global {
  interface Window {
    /** Pre-hydration media backlog. Typed as the widened input on purpose: a
     *  cached older chat bundle still writes bare URL strings into this array,
     *  and the island normalises whatever it finds rather than dropping it. */
    __doodleCanvasQueue?: CanvasMediaInput[];
    /** Ops backlog for pre-hydration delivery — mirrors __doodleCanvasQueue's
     *  role for images. The React island drains this on mount. */
    __doodleCanvasOpsQueue?: CanvasOp[];
    /** Latest canvas digest, written by the digest builder in DoodleCanvas.tsx
     *  and read by api-turn.ts to send up with each chat request. */
    __doodleCanvasDigest?: CanvasDigest;
  }
}

/**
 * Hand media to the board.
 *
 * Both channels are written for the same reason they always were: the backlog
 * covers the window before the ~1MB island has hydrated, the event covers the
 * hot path afterwards. The island dedupes, so writing both is harmless.
 *
 * `detail.items` is the current payload. `detail.urls` is still emitted
 * alongside it, carrying only the stills, so any listener built against the old
 * string-array contract keeps working instead of receiving an mp4 it would try
 * to render as an image.
 */
export function pushToCanvas(media: readonly CanvasMediaInput[]): void {
  const items = normalizeCanvasMedia(media);
  if (!items.length) return;
  const queue = (window.__doodleCanvasQueue ??= []);
  queue.push(...items);
  window.dispatchEvent(
    new CustomEvent("doodleai:canvas-add", {
      detail: { items, urls: items.filter((i) => !i.isVideo).map((i) => i.url) },
    }),
  );
  const hint = document.getElementById("canvasEmptyHint");
  if (hint) hint.hidden = true;
}

/** Forward agent canvas ops to the React island. Both channels are needed:
 *  - The backlog covers the pre-hydration window (~1MB island loads AFTER the
 *    first stream events arrive — this exact bug already happened with images).
 *  - The event covers the hot path once the island is mounted. */
export function pushCanvasOps(ops: CanvasOp[], label?: string): void {
  if (!ops.length) return;
  const queue = (window.__doodleCanvasOpsQueue ??= []);
  queue.push(...ops);
  window.dispatchEvent(new CustomEvent("doodleai:canvas-ops", { detail: { ops, label } }));
}

/* ---- Whiteboard state ---- */

export interface WhiteboardState {
  on: boolean;
  dismissed: boolean;
}

export function createWhiteboardState(isMobile: boolean): WhiteboardState {
  return { on: !isMobile, dismissed: false };
}

export function setWhiteboard(
  state: WhiteboardState,
  on: boolean,
  chatSplit: HTMLElement | null,
  canvasPanel: HTMLElement | null,
  whiteboardToggle: HTMLButtonElement | null,
  threadId: string,
): void {
  state.on = on;
  chatSplit?.setAttribute("data-whiteboard", String(on));
  whiteboardToggle?.setAttribute("aria-pressed", String(on));
  if (on) {
    window.dispatchEvent(new Event("doodleai:sidebar-collapse"));
    pushToCanvas(collectThreadMedia(threadId));
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("doodleai:canvas-open"));
      window.dispatchEvent(new Event("resize"));
    });
  } else {
    window.dispatchEvent(new Event("doodleai:sidebar-expand"));
  }
}

/* ---- Split resize ---- */

const SPLIT_KEY = "doodleai-chat-split";
const SPLIT_MIN = 20;
const SPLIT_MAX = 65;

function applySplit(chatSplit: HTMLElement, pct: number): void {
  const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
  chatSplit.style.setProperty("--chat-split-w", `${clamped}%`);
}

function persistSplit(chatSplit: HTMLElement): void {
  const current = chatSplit.style.getPropertyValue("--chat-split-w");
  if (!current) return;
  try {
    localStorage.setItem(SPLIT_KEY, current.trim());
  } catch {
    /* storage unavailable */
  }
}

export function restoreSplit(chatSplit: HTMLElement): void {
  try {
    const stored = parseFloat(localStorage.getItem(SPLIT_KEY) ?? "");
    if (Number.isFinite(stored)) applySplit(chatSplit, stored);
  } catch {
    /* CSS default applies */
  }
}

export function initSplitResize(
  splitHandle: HTMLElement,
  chatSplit: HTMLElement,
  whiteboardState: WhiteboardState,
): void {
  splitHandle.addEventListener("pointerdown", (event) => {
    if (!whiteboardState.on) return;
    event.preventDefault();
    chatSplit.setAttribute("data-resizing", "true");
    splitHandle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = chatSplit.getBoundingClientRect();
      if (!rect.width) return;
      applySplit(chatSplit, ((moveEvent.clientX - rect.left) / rect.width) * 100);
    };
    const onUp = () => {
      chatSplit.removeAttribute("data-resizing");
      splitHandle.removeEventListener("pointermove", onMove);
      splitHandle.removeEventListener("pointerup", onUp);
      splitHandle.removeEventListener("pointercancel", onUp);
      persistSplit(chatSplit);
      window.dispatchEvent(new Event("resize"));
    };
    splitHandle.addEventListener("pointermove", onMove);
    splitHandle.addEventListener("pointerup", onUp);
    splitHandle.addEventListener("pointercancel", onUp);
  });

  splitHandle.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowLeft" ? -2 : event.key === "ArrowRight" ? 2 : 0;
    if (!step) return;
    event.preventDefault();
    const current = parseFloat(chatSplit.style.getPropertyValue("--chat-split-w")) || 30;
    applySplit(chatSplit, current + step);
    persistSplit(chatSplit);
    window.dispatchEvent(new Event("resize"));
  });
}

/* ---- Mobile init ---- */

export function initMobileCanvas(
  chatSplit: HTMLElement | null,
  canvasPanel: HTMLElement | null,
  whiteboardToggle: HTMLButtonElement | null,
): void {
  if (chatSplit) {
    chatSplit.setAttribute("data-whiteboard", "false");
    whiteboardToggle?.setAttribute("aria-pressed", "false");
  }
}

/* ---- Desktop load backfill ---- */

export function backfillCanvasOnLoad(threadId: string): void {
  pushToCanvas(collectThreadMedia(threadId));
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("doodleai:canvas-open"));
  });
}
