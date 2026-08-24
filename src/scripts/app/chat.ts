/* /c/[id] chat page controller: renders the thread, wires the composer
   (text + photo attach + pinned skill chip + @/#// mentions), talks to
   /api/chat, and renders any doodle images the agent's generateDoodle tool
   produced — inline, source-photo-next-to-result, with Remix/Save/Download
   actions. */

import { MAX_IMAGE_BYTES, STYLE_THEME_STORAGE_KEY } from "../../lib/doodle-constants";
import { getSkill } from "../../lib/skills";
import { getCharacter } from "./character-store";
import { loadMoodboard, addToMoodboard } from "./moodboard";
import {
  appendMessage,
  clearThreadSkill,
  getThreadSkill,
  hydrateThread,
  loadThread,
  setThreadSkill,
  type ChatMessage,
} from "./chat-store";
import { initLightbox, openLightbox } from "./lightbox";
import { initMentions, serializeComposer, clearComposer } from "./composer-mentions";
import { setImageSrc, guardBfcacheRestore } from "./dom-utils";
import { initMediaPicker } from "./media-picker";
import { getSession } from "./auth-client";

const REFINE_PLACEHOLDER = "Ask for a change — thicker outline, warmer paper…";

function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function threadIdFromPath(): string | null {
  const match = window.location.pathname.match(/\/c\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}


function getStyleId(): string {
  try {
    return localStorage.getItem(STYLE_THEME_STORAGE_KEY) || "pastel";
  } catch {
    return "pastel";
  }
}

function initChat(): void {
  const threadId = threadIdFromPath();
  if (!threadId) return;

  const thread = $("chatThread");
  const empty = $("chatEmpty");
  const skillChip = $("chatSkillChip");
  const skillChipLabel = $("chatSkillChipLabel");
  const skillChipClear = $("chatSkillChipClear");
  const attachRow = $("chatAttachRow");
  const attachPreview = $<HTMLImageElement>("chatAttachPreview");
  const attachMeta = $("chatAttachMeta");
  const attachRemove = $("chatAttachRemove");
  const attachBtn = $("chatAttachBtn");
  const fileInput = $<HTMLInputElement>("chatFileInput");
  const input = $("chatInput");
  const sendBtn = $<HTMLButtonElement>("chatSend");
  const statusEl = $("chatStatus");
  const popover = $("chatMentionPopover");
  if (!thread || !input || !sendBtn || !statusEl || !popover) return;

  initLightbox();

  let attachedUrl: string | null = null;
  let attachedPreviewUrl: string | null = null;
  let uploading = false;
  let sending = false;
  let pinnedSkillId: string | undefined = getThreadSkill(threadId);
  let lastUserMessage: ChatMessage | null = null;
  let hasResult = false;

  function setStatus(msg: string, err = false): void {
    statusEl!.textContent = msg;
    statusEl!.dataset.err = String(err);
  }
  function syncSendState(): void {
    sendBtn!.disabled = sending || uploading;
  }

  function syncSkillChip(): void {
    if (!skillChip || !skillChipLabel) return;
    const skill = pinnedSkillId ? getSkill(pinnedSkillId) : undefined;
    skillChip.hidden = !skill;
    if (skill) skillChipLabel.textContent = skill.name;
  }
  skillChipClear?.addEventListener("click", () => {
    pinnedSkillId = undefined;
    clearThreadSkill(threadId!);
    syncSkillChip();
  });

  function renderMessage(msg: ChatMessage, precedingUserMessage: ChatMessage | null): void {
    empty!.hidden = true;
    const wrap = document.createElement("div");
    wrap.className = `chat-msg chat-msg-${msg.role}`;
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    if (msg.imageUrl && !msg.images) {
      const img = document.createElement("img");
      img.className = "chat-bubble-photo";
      img.alt = "Attached photo";
      setImageSrc(img, msg.imageUrl);
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
      input!.dataset.placeholder = REFINE_PLACEHOLDER;

      const grid = document.createElement("div");
      grid.className = "chat-bubble-images";

      if (precedingUserMessage?.imageUrl) {
        const sourceCell = document.createElement("div");
        sourceCell.className = "chat-bubble-image-wrap chat-bubble-image-source";
        const sourceImg = document.createElement("img");
        sourceImg.alt = "Source photo";
        setImageSrc(sourceImg, precedingUserMessage.imageUrl);
        sourceCell.appendChild(sourceImg);
        const sourceTag = document.createElement("span");
        sourceTag.className = "chat-bubble-image-tag";
        sourceTag.textContent = "Source";
        sourceCell.appendChild(sourceTag);
        grid.appendChild(sourceCell);
      }

      msg.images.forEach((url) => {
        const cell = document.createElement("div");
        cell.className = "chat-bubble-image-wrap";
        const img = document.createElement("img");
        img.alt = "Generated doodle";
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
        remixBtn.addEventListener("click", () => void remix(precedingUserMessage));
        actions.appendChild(remixBtn);
      }

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.textContent = "Save to moodboard";
      saveBtn.addEventListener("click", () => {
        msg.images!.forEach((url) => addToMoodboard(url));
        saveBtn.textContent = "Saved ✓";
      });
      actions.appendChild(saveBtn);

      const downloadBtn = document.createElement("button");
      downloadBtn.type = "button";
      downloadBtn.textContent = "Download";
      downloadBtn.addEventListener("click", () => downloadImage(msg.images![0]));
      actions.appendChild(downloadBtn);

      bubble.appendChild(actions);

      // Auto-save every generated image so it always shows up on
      // /moodboards even if the user never clicks "Save".
      msg.images.forEach((url) => addToMoodboard(url));
    }

    wrap.appendChild(bubble);
    thread!.appendChild(wrap);
    thread!.scrollTop = thread!.scrollHeight;

    if (msg.role === "user") lastUserMessage = msg;
  }

  async function downloadImage(url: string): Promise<void> {
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

  interface StreamingBubble {
    wrap: HTMLElement;
    /** Call with the accumulated text so far; swaps the spinner for live text on first call. */
    setText: (text: string) => void;
    /** The agent's tool call started generating an image — swap the spinner label while there's no text yet. */
    setDrawing: () => void;
  }

  function renderThinking(): StreamingBubble {
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
    thread!.appendChild(wrap);
    thread!.scrollTop = thread!.scrollHeight;

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
        thread!.scrollTop = thread!.scrollHeight;
      },
      setDrawing() {
        // Once real text has started streaming the spinner bubble is gone
        // (setText already swapped it out), so there's nothing left to
        // relabel — the "drawing" phase only matters during the silent gap
        // before the model's first token.
        if (streaming) return;
        label.textContent = "Drawing…";
      },
    };
  }

  function clearAttachment(): void {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl);
    attachedUrl = null;
    attachedPreviewUrl = null;
    attachRow!.hidden = true;
    if (fileInput) fileInput.value = "";
  }

  function attachCharacterPhoto(characterId: string): void {
    const character = getCharacter(characterId);
    if (!character) return;
    clearAttachment();
    attachedUrl = character.imageUrl;
    setImageSrc(attachPreview!, character.imageUrl);
    attachMeta!.textContent = character.name;
    attachRow!.hidden = false;
  }

  async function handleFile(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      setStatus("That doesn't look like an image.", true);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus("Images must be 20 MB or smaller.", true);
      return;
    }
    if (!(await getSession())) {
      setStatus("Sign in to upload a photo.", true);
      window.dispatchEvent(new Event("doodleai:open-auth"));
      return;
    }

    attachedPreviewUrl = URL.createObjectURL(file);
    setImageSrc(attachPreview!, attachedPreviewUrl);
    attachRow!.hidden = false;
    attachMeta!.textContent = "Uploading…";
    uploading = true;
    syncSendState();

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string | { message?: string };
      };
      const errorMessage = typeof data.error === "string" ? data.error : data.error?.message;
      if (!res.ok || !data.url) throw new Error(errorMessage || "Upload failed");
      attachedUrl = data.url;
      attachMeta!.textContent = "Ready";
      setStatus("");
    } catch (err) {
      attachMeta!.textContent = "Upload failed";
      setStatus(err instanceof Error ? err.message : "Upload failed", true);
    } finally {
      uploading = false;
      syncSendState();
    }
  }

  function toApiMessages(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
    const skillHint = pinnedSkillId ? `Use the ${getSkill(pinnedSkillId)?.name ?? pinnedSkillId} skill for this request.\n\n` : "";
    return messages.map((m) => ({
      role: m.role,
      content:
        m.role === "user"
          ? `${skillHint}${m.imageUrl ? `Attached photo: ${m.imageUrl}\n\n` : ""}${m.refImageUrl ? `Reference image: ${m.refImageUrl}\n\n` : ""}${m.content}`.trim()
          : m.content,
    }));
  }

  async function requestAssistantReply(history: ChatMessage[]): Promise<void> {
    sending = true;
    syncSendState();
    const thinking = renderThinking();
    const precedingUserMessage = lastUserMessage;

    let text = "";
    const images: string[] = [];
    let streamError: string | null = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: toApiMessages(history),
          styleId: getStyleId(),
        }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string | { message?: string };
        };
        const errorMessage = typeof data.error === "string" ? data.error : data.error?.message;
        throw new Error(errorMessage || `Chat request failed: ${res.status}`);
      }

      // The server streams newline-delimited JSON events (see /api/chat.ts) —
      // read raw bytes, decode, and split on complete lines, buffering any
      // trailing partial line until the next chunk completes it.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            text?: string;
            url?: string;
            message?: string;
            phase?: string;
            balance?: number;
          };
          if (event.type === "text" && event.text) {
            text += event.text;
            thinking.setText(text);
          } else if (event.type === "status" && event.phase === "drawing") {
            thinking.setDrawing();
          } else if (event.type === "image" && event.url) {
            images.push(event.url);
          } else if (event.type === "credits" && typeof event.balance === "number") {
            // The sidebar owns the visible balance readout but lives outside
            // this page's controller, so broadcast rather than reach across
            // components directly — same pattern as doodleai:open-auth.
            window.dispatchEvent(new CustomEvent("doodleai:credits", { detail: { balance: event.balance } }));
          } else if (event.type === "error") {
            streamError = event.message || "Chat request failed";
          }
        }
      }

      thinking.wrap.remove();
      if (streamError) throw new Error(streamError);

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: text,
        images: images.length > 0 ? images : undefined,
        createdAt: Date.now(),
      };
      appendMessage(threadId!, assistantMessage);
      renderMessage(assistantMessage, precedingUserMessage);
    } catch (err) {
      thinking.wrap.remove();
      setStatus(err instanceof Error ? err.message : "Chat request failed", true);
    } finally {
      sending = false;
      syncSendState();
    }
  }

  async function send(): Promise<void> {
    const { text, characterId, skillId, refImageId } = serializeComposer(input!);
    if (characterId) attachCharacterPhoto(characterId);
    if (skillId) {
      pinnedSkillId = skillId;
      setThreadSkill(threadId!, skillId);
      syncSkillChip();
    }
    const refImageUrl = refImageId ? loadMoodboard().find((m) => m.id === refImageId)?.url : undefined;

    if (!text && !attachedUrl) {
      setStatus("Type a message or attach a photo first.", true);
      return;
    }
    if (!(await getSession())) {
      setStatus("Sign in to start creating.", true);
      window.dispatchEvent(new Event("doodleai:open-auth"));
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      imageUrl: attachedUrl || undefined,
      refImageUrl,
      createdAt: Date.now(),
    };
    const history = appendMessage(threadId!, userMessage);
    renderMessage(userMessage, null);
    clearComposer(input!);
    clearAttachment();
    setStatus("");

    await requestAssistantReply(history);
  }

  async function remix(userMsg: ChatMessage): Promise<void> {
    if (sending) return;
    const copy: ChatMessage = { ...userMsg, createdAt: Date.now() };
    const history = appendMessage(threadId!, copy);
    renderMessage(copy, null);
    await requestAssistantReply(history);
  }

  /* ---- Wire events ---- */
  const mentions = initMentions(input, popover, {
    onSkillSelect: (skillId) => {
      pinnedSkillId = skillId;
      setThreadSkill(threadId!, skillId);
      syncSkillChip();
    },
  });
  $("chatCharacterBtn")?.addEventListener("click", () => mentions.triggerFor("@"));
  $("chatSkillBtn")?.addEventListener("click", () => mentions.triggerFor("/"));

  initMediaPicker({
    trigger: attachBtn as HTMLButtonElement,
    cameraButton: $("chatCameraBtn") as HTMLButtonElement,
    fileInput: fileInput!,
    dialog: $("chatCameraDialog")!,
    video: $("chatCameraVideo") as HTMLVideoElement,
    preview: $("chatCameraPreview") as HTMLImageElement,
    canvas: $("chatCameraCanvas") as HTMLCanvasElement,
    captureButton: $("chatCameraCapture") as HTMLButtonElement,
    retakeButton: $("chatCameraRetake") as HTMLButtonElement,
    useButton: $("chatCameraUse") as HTMLButtonElement,
    closeButton: $("chatCameraClose") as HTMLButtonElement,
    cancelButton: $("chatCameraCancel") as HTMLButtonElement,
    status: $("chatCameraStatus")!,
    onFile: (file) => void handleFile(file),
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file);
  });
  attachRemove?.addEventListener("click", clearAttachment);

  sendBtn.addEventListener("click", () => void send());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl);
  });

  /* ---- Initial paint ---- */
  syncSkillChip();
  guardBfcacheRestore();

  function paintHistory(messages: ChatMessage[]): void {
    thread!.querySelectorAll(".chat-msg").forEach((el) => el.remove());
    hasResult = false;
    lastUserMessage = null;
    let precedingUserMessage: ChatMessage | null = null;
    messages.forEach((msg) => {
      renderMessage(msg, precedingUserMessage);
      if (msg.role === "user") precedingUserMessage = msg;
    });
    empty!.hidden = messages.length > 0;
    if (hasResult) input!.dataset.placeholder = REFINE_PLACEHOLDER;
  }

  /**
   * Continue a turn that was started elsewhere: Home creates the thread and
   * appends the user message, then navigates here, so a history ending on a
   * user turn means a reply is owed.
   */
  function resumePendingTurn(messages: ChatMessage[]): void {
    if (sending) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "user") void requestAssistantReply(messages);
  }

  // Paint from the local mirror first so the thread is on screen immediately,
  // then repaint once the server's copy has landed — which is what makes a
  // thread opened on a second device show its real history. Signed out,
  // hydrateThread resolves to the same local array and the repaint is a
  // no-op re-render.
  const local = loadThread(threadId);
  paintHistory(local);
  resumePendingTurn(local);

  void hydrateThread(threadId).then((messages) => {
    // A reply already in flight owns the thread element (the thinking bubble
    // is one of the `.chat-msg` nodes a repaint would remove).
    if (sending) return;
    if (messages.length === local.length && local.length > 0) return;
    pinnedSkillId = getThreadSkill(threadId);
    syncSkillChip();
    paintHistory(messages);
    resumePendingTurn(messages);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat);
} else {
  initChat();
}
