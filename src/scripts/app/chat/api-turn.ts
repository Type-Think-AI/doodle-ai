/* Chat API turn — builds the request body, streams the NDJSON response,
   dispatches events back to the controller. No direct DOM writes; the
   controller's callbacks handle rendering and state. */

import { getSkill } from "../../../lib/skills";
import { loadMoodboard } from "../moodboard";
import { appendMessage, setThreadThumbnail, type ChatMessage } from "../chat-store";
import { getSession } from "../auth-client";
import { serializeComposer, clearComposer } from "../composer-mentions";
import { trackDoodleGenerated } from "../mixpanel";
import { MAX_IMAGE_BYTES } from "../../../lib/doodle-constants";
import { setImageSrc } from "../dom-utils";
import type { AttachmentState, SendState, SkillPinState } from "./state";
import { getStyleId } from "./state";
import type { CanvasOp } from "../../../lib/canvas/ops";

/* ---- Types ---- */

export interface TurnCallbacks {
  onThinkingStart: () => { setText: (t: string) => void; setDrawing: () => void; remove: () => void };
  onAssistantMessage: (msg: ChatMessage, precedingUserMessage: ChatMessage | null) => void;
  onImage: (url: string, skillId: string | undefined) => void;
  onCredits: (balance: number) => void;
  onCanvasOps: (ops: CanvasOp[], label?: string) => void;
  onStatus: (msg: string, err?: boolean) => void;
  onSendStateChange: () => void;
  invalidateImageCache: () => void;
}

/* ---- Message formatting ---- */

export function toApiMessages(
  messages: ChatMessage[],
  pinnedSkillId: string | undefined,
): { role: "user" | "assistant"; content: string }[] {
  const skillHint = pinnedSkillId
    ? `Use the ${getSkill(pinnedSkillId)?.name ?? pinnedSkillId} skill for this request.\n\n`
    : "";
  return messages.map((m) => ({
    role: m.role,
    content:
      m.role === "user"
        ? `${skillHint}${m.imageUrl ? `Attached photo: ${m.imageUrl}\n\n` : ""}${m.refImageUrl ? `Reference image: ${m.refImageUrl}\n\n` : ""}${m.content}`.trim()
        : m.content,
  }));
}

/* ---- Assistant reply (streaming) ---- */

export async function requestAssistantReply(
  threadId: string,
  history: ChatMessage[],
  sendState: SendState,
  skillPinState: SkillPinState,
  attachState: AttachmentState,
  lastUserMessage: ChatMessage | null,
  callbacks: TurnCallbacks,
): Promise<void> {
  sendState.sending = true;
  callbacks.onSendStateChange();
  const thinking = callbacks.onThinkingStart();
  const precedingUserMessage = lastUserMessage;

  const abortController = new AbortController();
  sendState.activeAbort = abortController;

  let text = "";
  const images: string[] = [];
  let streamError: string | null = null;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: toApiMessages(history, skillPinState.pinnedSkillId),
        styleId: getStyleId(),
        canvas: window.__doodleCanvasDigest,
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
          ops?: CanvasOp[];
          label?: string;
        };
        if (event.type === "text" && event.text) {
          text += event.text;
          thinking.setText(text);
        } else if (event.type === "status" && event.phase === "drawing") {
          thinking.setDrawing();
        } else if (event.type === "canvas" && event.ops?.length) {
          callbacks.onCanvasOps(event.ops, event.label);
        } else if (event.type === "image" && event.url) {
          images.push(event.url);
          callbacks.onImage(event.url, event.skillId ?? skillPinState.pinnedSkillId);
          trackDoodleGenerated({
            skill_id: event.skillId ?? skillPinState.pinnedSkillId,
            skill_name: event.skillId
              ? getSkill(event.skillId)?.name
              : skillPinState.pinnedSkillId
                ? getSkill(skillPinState.pinnedSkillId)?.name
                : undefined,
            has_photo: !!attachState.attachedUrl,
            has_reference: history.some((m) => m.role === "user" && !!m.refImageUrl),
          });
          const skillName = event.skillId ? getSkill(event.skillId)?.name : undefined;
          if (threadId && skillName) setThreadThumbnail(threadId, event.url, skillName);
        } else if (event.type === "credits" && typeof event.balance === "number") {
          callbacks.onCredits(event.balance);
        } else if (event.type === "error") {
          streamError = event.message || "Chat request failed";
        }
      }
    }

    thinking.remove();
    if (streamError) throw new Error(streamError);
    saveAssistantReply();
  } catch (err) {
    thinking.remove();
    if (err instanceof DOMException && err.name === "AbortError") {
      callbacks.onStatus("Generation stopped.", false);
    } else {
      callbacks.onStatus(err instanceof Error ? err.message : "Chat request failed", true);
    }
    saveAssistantReply();
  } finally {
    sendState.activeAbort = null;
    sendState.sending = false;
    callbacks.onSendStateChange();
  }

  function saveAssistantReply(): void {
    if (!text && images.length === 0) return;
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: text,
      images: images.length > 0 ? images : undefined,
      createdAt: Date.now(),
    };
    appendMessage(threadId, assistantMessage);
    callbacks.invalidateImageCache();
    callbacks.onAssistantMessage(assistantMessage, precedingUserMessage);
  }
}

/* ---- Send (user turn entry point) ---- */

export interface SendDeps {
  threadId: string;
  input: HTMLElement;
  sendState: SendState;
  skillPinState: SkillPinState;
  attachState: AttachmentState;
  lastUserMessage: ChatMessage | null;
  callbacks: TurnCallbacks;
  onSkillPin: (skillId: string) => void;
  onCharacterAttach: (characterId: string) => void;
  onClearAttachment: () => void;
  setCanvasDismissed: (v: boolean) => void;
  setLastUserMessage: (msg: ChatMessage) => void;
}

export async function send(deps: SendDeps): Promise<void> {
  const { text, characterId, skillId, refImageId } = serializeComposer(deps.input);
  if (characterId) deps.onCharacterAttach(characterId);
  if (skillId) deps.onSkillPin(skillId);
  const refImageUrl = refImageId ? loadMoodboard().find((m) => m.id === refImageId)?.url : undefined;

  if (!text && !deps.attachState.attachedUrl) {
    deps.callbacks.onStatus("Type a message or attach a photo first.", true);
    return;
  }
  if (!(await getSession())) {
    deps.callbacks.onStatus("Sign in to start creating.", true);
    window.dispatchEvent(new Event("doodleai:open-auth"));
    return;
  }

  const userMessage: ChatMessage = {
    role: "user",
    content: text,
    imageUrl: deps.attachState.attachedUrl || undefined,
    refImageUrl,
    createdAt: Date.now(),
  };
  deps.setCanvasDismissed(false);
  const history = appendMessage(deps.threadId, userMessage);
  deps.callbacks.invalidateImageCache();
  deps.callbacks.onAssistantMessage(userMessage, null);
  deps.setLastUserMessage(userMessage);
  clearComposer(deps.input);
  deps.onClearAttachment();
  deps.callbacks.onStatus("");

  await requestAssistantReply(
    deps.threadId,
    history,
    deps.sendState,
    deps.skillPinState,
    deps.attachState,
    userMessage,
    deps.callbacks,
  );
}

/* ---- File upload ---- */

export interface UploadDeps {
  attachState: AttachmentState;
  attachPreview: HTMLImageElement | null;
  attachRow: HTMLElement | null;
  attachMeta: HTMLElement | null;
  callbacks: Pick<TurnCallbacks, "onStatus" | "onSendStateChange">;
}

export async function handleFile(file: File, deps: UploadDeps): Promise<void> {
  if (!file.type.startsWith("image/")) {
    deps.callbacks.onStatus("That doesn't look like an image.", true);
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    deps.callbacks.onStatus("Images must be 20 MB or smaller.", true);
    return;
  }
  if (!(await getSession())) {
    deps.callbacks.onStatus("Sign in to upload a photo.", true);
    window.dispatchEvent(new Event("doodleai:open-auth"));
    return;
  }

  deps.attachState.attachedPreviewUrl = URL.createObjectURL(file);
  if (deps.attachPreview) setImageSrc(deps.attachPreview, deps.attachState.attachedPreviewUrl);
  if (deps.attachRow) deps.attachRow.hidden = false;
  if (deps.attachMeta) deps.attachMeta.textContent = "Uploading…";
  deps.attachState.uploading = true;
  deps.callbacks.onSendStateChange();

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
    deps.attachState.attachedUrl = data.url;
    if (deps.attachMeta) deps.attachMeta.textContent = "Ready";
    deps.callbacks.onStatus("");
  } catch (err) {
    if (deps.attachMeta) deps.attachMeta.textContent = "Upload failed";
    deps.callbacks.onStatus(err instanceof Error ? err.message : "Upload failed", true);
  } finally {
    deps.attachState.uploading = false;
    deps.callbacks.onSendStateChange();
  }
}
