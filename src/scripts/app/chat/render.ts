/* Chat DOM rendering — message bubbles, thinking spinners, status, skill chip.
   No network IO, no localStorage writes. Pure DOM construction. */

import { setImageSrc } from "../dom-utils";
import { openLightbox } from "../lightbox";
import { addToMoodboard } from "../moodboard";
import { landOnBoard } from "../board-target";
import type { ChatMessage } from "../chat-store";
import { parseSuggestions, renderSuggestions } from "./suggestions";

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
}

export function renderMessage(
  ctx: RenderContext,
  msg: ChatMessage,
  precedingUserMessage: ChatMessage | null,
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

  return { hasResult };
}

/* ---- Streaming/thinking bubble ---- */

export interface StreamingBubble {
  wrap: HTMLElement;
  setText: (text: string) => void;
  /** Name the step in progress, e.g. "Drawing…" / "Arranging the canvas…". */
  setPhase: (label: string) => void;
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
  return {
    wrap,
    setText(text: string) {
      if (!text) return;
      if (!streaming) {
        streaming = true;
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

/* ---- Download helper ---- */

export async function downloadImage(url: string): Promise<void> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    const objUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "doodleai-doodle.png";
    link.href = objUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    const link = document.createElement("a");
    link.download = "doodleai-doodle.png";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}
