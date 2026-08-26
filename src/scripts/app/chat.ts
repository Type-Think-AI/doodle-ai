/* /c/[id] chat page controller: renders the thread, wires the composer
   (text + photo attach + pinned skill chip + @/#// mentions), talks to
   /api/chat, and renders any doodle images the agent's generateDoodle tool
   produced — inline, source-photo-next-to-result, with Remix/Download
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
  setThreadThumbnail,
  type ChatMessage,
} from "./chat-store";
import { initLightbox, openLightbox } from "./lightbox";
import { initMentions, serializeComposer, clearComposer } from "./composer-mentions";
import { setImageSrc, guardBfcacheRestore } from "./dom-utils";
import { initMediaPicker, initComposerDropZone } from "./media-picker";
import { getSession } from "./auth-client";
import { trackDoodleGenerated } from "./mixpanel";

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
  const chatSplit = $("chatSplit");
  const whiteboardToggle = $<HTMLButtonElement>("whiteboardToggle");
  const whiteboardClose = $("whiteboardClose");
  const canvasPanel = $("canvasPanel");
  const splitHandle = $("chatSplitHandle");
  if (!thread || !input || !sendBtn || !statusEl || !popover) return;

  initLightbox();

  let attachedUrl: string | null = null;
  let attachedPreviewUrl: string | null = null;
  let uploading = false;
  let sending = false;
  let activeAbort: AbortController | null = null;
  let pinnedSkillId: string | undefined = getThreadSkill(threadId);
  let lastUserMessage: ChatMessage | null = null;
  let hasResult = false;
  /* Canvas starts open on desktop (where the 70/30 split works) but closed
     on mobile (where it replaces the chat entirely and the user would see a
     blank void with no composer). The SSR markup has data-whiteboard="true"
     because tldraw cannot initialize inside display:none, so we immediately
     close it here on mobile before paint — the visual flicker is
     imperceptible since this runs synchronously before the first frame. */
  const isMobile = window.matchMedia("(max-width: 860px)").matches;
  let whiteboardOn = !isMobile;
  if (isMobile && chatSplit) {
    chatSplit.setAttribute("data-whiteboard", "false");
    if (canvasPanel) canvasPanel.hidden = true;
    whiteboardToggle?.setAttribute("aria-pressed", "false");
  }
  /* Set when the user closes the canvas by hand, so a stream of results
     doesn't keep yanking it back open. Cleared on the next send. */
  let canvasDismissed = false;

  function setStatus(msg: string, err = false): void {
    statusEl!.textContent = msg;
    statusEl!.dataset.err = String(err);
  }
  function syncSendState(): void {
    sendBtn!.disabled = sending || uploading;
    const stopBtn = $("chatStopBtn");
    if (stopBtn) stopBtn.hidden = !sending;
    if (sending) {
      sendBtn!.hidden = true;
    } else {
      sendBtn!.hidden = false;
    }
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

  /** Shared by the "/" mention picker, send()'s inline mention, and the
      whiteboard's quick-pick row — one place that pins a skill to the thread. */
  function pinSkill(skillId: string): void {
    pinnedSkillId = skillId;
    setThreadSkill(threadId!, skillId);
    syncSkillChip();
  }

  /* ---- Whiteboard ---- */

  /** Every image this thread has produced or received, oldest first — the
      same data renderMessage already walks, just flattened across messages
      instead of rendered per-bubble. Re-read fresh each call rather than
      cached, since it's just a localStorage scan and the thread rarely has
      more than a few dozen images. */
  function collectThreadImages(): string[] {
    const urls: string[] = [];
    for (const msg of loadThread(threadId!)) {
      if (msg.imageUrl) urls.push(msg.imageUrl);
      if (msg.images) urls.push(...msg.images);
    }
    return urls;
  }

  /** Hand image URLs to the tldraw canvas island (src/components/app/
      DoodleCanvas.tsx). An event rather than a direct call so this vanilla
      controller never imports React — the island dedupes URLs itself, so
      re-sending an already-placed image is harmless.

      The event alone is not enough: this module runs immediately while the
      island is client:only and has to load ~1MB of tldraw first, so early
      dispatches land before any listener exists. Appending to
      window.__doodleCanvasQueue as well gives the island a backlog to drain
      on mount, which is what keeps a reloaded thread's doodles on the board. */
  function pushToCanvas(urls: string[]): void {
    if (!urls.length) return;
    const queue = (window.__doodleCanvasQueue ??= []);
    queue.push(...urls);
    window.dispatchEvent(new CustomEvent("doodleai:canvas-add", { detail: { urls } }));
    // Hide the "your doodles will appear here" placeholder once content exists.
    const hint = document.getElementById("canvasEmptyHint");
    if (hint) hint.hidden = true;
  }

  function setWhiteboard(on: boolean): void {
    whiteboardOn = on;
    chatSplit?.setAttribute("data-whiteboard", String(on));
    whiteboardToggle?.setAttribute("aria-pressed", String(on));
    if (canvasPanel) canvasPanel.hidden = !on;
    if (on) {
      window.dispatchEvent(new Event("doodleai:sidebar-collapse"));
      // Backfill anything generated before the canvas was first opened. The
      // island dedupes, so images already on the board are not duplicated.
      pushToCanvas(collectThreadImages());
      /* Tell the island it is safe to mount tldraw. It deliberately waits for
         this: tldraw mounted inside the display:none panel never finishes
         initializing, so it must not be created until the panel is shown.
         Fired on the next frame, after the browser has applied the panel's
         new display value, so the container measures non-zero. */
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("doodleai:canvas-open"));
        // tldraw re-measures on resize; harmless if it mounted this frame.
        window.dispatchEvent(new Event("resize"));
      });
    }
  }
  // Both of these are explicit user intent, so they set/clear the dismissed
  // flag that auto-open checks.
  whiteboardToggle?.addEventListener("click", () => {
    const next = !whiteboardOn;
    canvasDismissed = !next;
    setWhiteboard(next);
  });
  whiteboardClose?.addEventListener("click", () => {
    canvasDismissed = true;
    setWhiteboard(false);
  });

  /* ---- Split resize ----

     Vanilla pointer-capture drag rather than a resizable-panel package: this
     split is Astro markup driven by this controller, and only the board
     itself is a React island. A React panel library would mean re-homing the
     whole chat column into React just to move a divider — a much larger change
     than the behaviour warrants, and against the one-island/bundle constraint
     in astro.config.mjs. Mirrors the sidebar's own resize in sidebar.ts.

     The width is stored as a percentage, not pixels, so the ratio survives a
     window resize the way the old fixed 30% did. */
  const SPLIT_KEY = "doodleai-chat-split";
  const SPLIT_MIN = 20;
  const SPLIT_MAX = 65;

  function applySplit(pct: number): void {
    const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
    chatSplit?.style.setProperty("--chat-split-w", `${clamped}%`);
  }

  function persistSplit(): void {
    const current = chatSplit?.style.getPropertyValue("--chat-split-w");
    if (!current) return;
    try {
      localStorage.setItem(SPLIT_KEY, current.trim());
    } catch {
      /* storage unavailable — split width stays session-only */
    }
  }

  try {
    const stored = parseFloat(localStorage.getItem(SPLIT_KEY) ?? "");
    if (Number.isFinite(stored)) applySplit(stored);
  } catch {
    /* storage unavailable — the CSS default (30%) applies */
  }

  splitHandle?.addEventListener("pointerdown", (event) => {
    if (!chatSplit || !whiteboardOn) return;
    event.preventDefault();
    chatSplit.setAttribute("data-resizing", "true");
    splitHandle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = chatSplit.getBoundingClientRect();
      if (!rect.width) return;
      applySplit(((moveEvent.clientX - rect.left) / rect.width) * 100);
    };
    const onUp = () => {
      chatSplit.removeAttribute("data-resizing");
      splitHandle.removeEventListener("pointermove", onMove);
      splitHandle.removeEventListener("pointerup", onUp);
      splitHandle.removeEventListener("pointercancel", onUp);
      persistSplit();
      /* tldraw sizes itself from its container and does not observe a flex-basis
         change on an ancestor, so the board would keep the pre-drag width until
         something else forced a re-measure. */
      window.dispatchEvent(new Event("resize"));
    };
    splitHandle.addEventListener("pointermove", onMove);
    splitHandle.addEventListener("pointerup", onUp);
    splitHandle.addEventListener("pointercancel", onUp);
  });

  // Keyboard equivalent, so the divider is not mouse-only (it is exposed as a
  // role="separator" with tabindex in the markup).
  splitHandle?.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowLeft" ? -2 : event.key === "ArrowRight" ? 2 : 0;
    if (!step || !chatSplit) return;
    event.preventDefault();
    const current = parseFloat(chatSplit.style.getPropertyValue("--chat-split-w")) || 30;
    applySplit(current + step);
    persistSplit();
    window.dispatchEvent(new Event("resize"));
  });

  /* The SSR markup ships with the canvas already open on desktop, which means
     setWhiteboard(true) never runs on load — and that function is the ONLY
     place that backfills the thread's existing images and fires
     "doodleai:canvas-open". Without this block, opening or reloading a thread
     left the board empty with the placeholder still up while the thread's
     doodles sat in the chat column. Same two steps setWhiteboard(true) takes,
     minus the sidebar collapse, which is a response to user intent, not load. */
  if (whiteboardOn) {
    pushToCanvas(collectThreadImages());
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("doodleai:canvas-open"));
    });
  }

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
      input!.dataset.placeholder = REFINE_PLACEHOLDER;

      const grid = document.createElement("div");
      grid.className = "chat-bubble-images";

      if (precedingUserMessage?.imageUrl) {
        const sourceCell = document.createElement("div");
        sourceCell.className = "chat-bubble-image-wrap chat-bubble-image-source";
        sourceCell.style.cursor = "pointer";
        const sourceImg = document.createElement("img");
        sourceImg.alt = "Source photo";
        setImageSrc(sourceImg, precedingUserMessage.imageUrl);
        sourceCell.appendChild(sourceImg);
        const sourceTag = document.createElement("span");
        sourceTag.className = "chat-bubble-image-tag";
        sourceTag.textContent = "Source";
        sourceCell.appendChild(sourceTag);
        sourceCell.addEventListener("click", () => openLightbox([precedingUserMessage!.imageUrl!], precedingUserMessage!.imageUrl!));
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

      const downloadBtn = document.createElement("button");
      downloadBtn.type = "button";
      downloadBtn.textContent = "Download";
      downloadBtn.addEventListener("click", () => downloadImage(msg.images![0]));
      actions.appendChild(downloadBtn);

      bubble.appendChild(actions);

      /* Every generated image is saved to /moodboards here, on render. This is
         also why there is no "Save to moodboard" button: it ran this same
         addToMoodboard call on images that had already been added by this line,
         so it never did anything except relabel itself "Saved ✓". */
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

    const abortController = new AbortController();
    activeAbort = abortController;

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
        signal: abortController.signal,
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
            skillId?: string;
          };
          if (event.type === "text" && event.text) {
            text += event.text;
            thinking.setText(text);
          } else if (event.type === "status" && event.phase === "drawing") {
            thinking.setDrawing();
          } else if (event.type === "image" && event.url) {
            images.push(event.url);
            /* Put it on the canvas immediately and reveal the canvas, rather
               than waiting for the message to finish rendering or for the user
               to find the toggle — the canvas is the point of the feature, so
               a generated doodle appearing anywhere else first is a miss.
               Respects a deliberate close: setWhiteboard(false) sets
               canvasDismissed, which resets on the next send. */
            pushToCanvas([event.url]);
            if (!whiteboardOn && !canvasDismissed) setWhiteboard(true);
            // Track the Value Moment — a doodle was successfully generated.
            trackDoodleGenerated({
              skill_id: event.skillId ?? pinnedSkillId,
              skill_name: event.skillId ? getSkill(event.skillId)?.name : pinnedSkillId ? getSkill(pinnedSkillId)?.name : undefined,
              has_photo: !!attachedUrl,
              has_reference: history.some((m) => m.role === "user" && !!m.refImageUrl),
            });
            // First doodle in the thread sets the sidebar thumbnail and
            // upgrades the title from "New chat" to the skill's display
            // name — setThreadThumbnail() itself is a no-op past the first
            // call, so this doesn't need to track "is this the first image"
            // locally.
            const skillName = event.skillId ? getSkill(event.skillId)?.name : undefined;
            if (threadId && skillName) setThreadThumbnail(threadId, event.url, skillName);
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
      saveAssistantReply();
    } catch (err) {
      thinking.wrap.remove();
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("Generation stopped.", false);
      } else {
        setStatus(err instanceof Error ? err.message : "Chat request failed", true);
      }
      // A doodle the server already generated (and already charged a
      // credit for, before the stream had any way to fail) must not
      // vanish just because the connection dropped on the way back —
      // save whatever text/images arrived before the error, same as the
      // happy path above. Losing a paid-for generation is worse than
      // showing a partial reply.
      saveAssistantReply();
    } finally {
      activeAbort = null;
      sending = false;
      syncSendState();
    }

    function saveAssistantReply(): void {
      if (!text && images.length === 0) return;
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: text,
        images: images.length > 0 ? images : undefined,
        createdAt: Date.now(),
      };
      appendMessage(threadId!, assistantMessage);
      renderMessage(assistantMessage, precedingUserMessage);
      pushToCanvas(collectThreadImages());
    }
  }

  async function send(): Promise<void> {
    const { text, characterId, skillId, refImageId } = serializeComposer(input!);
    if (characterId) attachCharacterPhoto(characterId);
    if (skillId) pinSkill(skillId);
    const refImageUrl = refImageId ? loadMoodboard().find((m) => m.id === refImageId)?.url : undefined;

    if (!text && !attachedUrl) {
      setStatus("Type a message or attach a photo first.", true);
      return;    }
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
    // A fresh request re-earns the right to reveal the canvas.
    canvasDismissed = false;
    const history = appendMessage(threadId!, userMessage);
    renderMessage(userMessage, null);
    pushToCanvas(collectThreadImages());
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
    onSkillSelect: (skillId) => pinSkill(skillId),
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

  const dropBox = $("chatBox");
  if (dropBox) {
    initComposerDropZone(dropBox, (files) => {
      const file = files[0];
      if (file) void handleFile(file);
    });
  }

  sendBtn.addEventListener("click", () => void send());
  $("chatStopBtn")?.addEventListener("click", () => {
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
  });
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
    pushToCanvas(collectThreadImages());
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
