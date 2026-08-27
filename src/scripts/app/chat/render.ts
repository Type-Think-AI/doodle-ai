/* Chat DOM rendering — message bubbles, thinking spinners, status, skill chip.
   No network IO, no localStorage writes. Pure DOM construction. */

import { setImageSrc } from "../dom-utils";
import { openLightbox } from "../lightbox";
import { addToMoodboard } from "../moodboard";
import type { ChatMessage } from "../chat-store";

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

  if (msg.content) {
    const p = document.createElement("p");
    p.style.margin = "0";
    p.textContent = msg.content;
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

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.textContent = "Download";
    downloadBtn.addEventListener("click", () => ctx.onDownload(msg.images![0]));
    actions.appendChild(downloadBtn);

    bubble.appendChild(actions);

    msg.images.forEach((url) => addToMoodboard(url));
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
  setDrawing: () => void;
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
    setDrawing() {
      if (streaming) return;
      label.textContent = "Drawing…";
    },
  };
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
