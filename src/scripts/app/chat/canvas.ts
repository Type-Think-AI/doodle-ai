/* Canvas bridge — tldraw split-panel management, image queue, and resize.
   Communicates with the React island via CustomEvents on window and the
   __doodleCanvasQueue backlog array. No network IO. */

import { loadThread } from "../chat-store";
import type { CanvasOp, CanvasDigest } from "../../../lib/canvas/ops";

/* ---- Thread image collection ---- */

let _threadImagesCache: string[] | null = null;

export function collectThreadImages(threadId: string): string[] {
  if (_threadImagesCache) return _threadImagesCache;
  const urls: string[] = [];
  for (const msg of loadThread(threadId)) {
    if (msg.imageUrl) urls.push(msg.imageUrl);
    if (msg.images) urls.push(...msg.images);
  }
  _threadImagesCache = urls;
  return urls;
}

export function invalidateThreadImagesCache(): void {
  _threadImagesCache = null;
}

/* ---- Push to canvas island ---- */

declare global {
  interface Window {
    __doodleCanvasQueue?: string[];
    /** Ops backlog for pre-hydration delivery — mirrors __doodleCanvasQueue's
     *  role for images. The React island drains this on mount. */
    __doodleCanvasOpsQueue?: CanvasOp[];
    /** Latest canvas digest, written by the digest builder in DoodleCanvas.tsx
     *  and read by api-turn.ts to send up with each chat request. */
    __doodleCanvasDigest?: CanvasDigest;
  }
}

export function pushToCanvas(urls: string[]): void {
  if (!urls.length) return;
  const queue = (window.__doodleCanvasQueue ??= []);
  queue.push(...urls);
  window.dispatchEvent(new CustomEvent("doodleai:canvas-add", { detail: { urls } }));
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
    pushToCanvas(collectThreadImages(threadId));
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
  pushToCanvas(collectThreadImages(threadId));
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("doodleai:canvas-open"));
  });
}
