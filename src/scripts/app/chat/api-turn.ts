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
import { getArtFamilyId, getStyleId } from "./state";
import type { CanvasOp } from "../../../lib/canvas/ops";
import { startImageJob } from "./image-job";

/* ---- Types ---- */

export interface TurnCallbacks {
  onThinkingStart: () => {
    setText: (t: string) => void;
    setPhase: (label: string) => void;
    /** Reserve the image box, sized from the skill the agent chose. */
    setDrawing: (skillId: string | undefined) => void;
    remove: () => void;
  };
  onAssistantMessage: (msg: ChatMessage, precedingUserMessage: ChatMessage | null) => void;
  onImage: (url: string, skillId: string | undefined) => void;
  /** A clip was queued upstream — mount its card and start polling the job. */
  onVideo: (jobId: string, estimatedSeconds: number, skillId: string | undefined) => void;
  onCredits: (balance: number) => void;
  onCanvasOps: (ops: CanvasOp[], label?: string) => void;
  onStatus: (msg: string, err?: boolean) => void;
  /** A turn failed for a real reason (not a user Stop) — show it in the thread. */
  onError: (message: string) => void;
  /** The generation was refused for lack of credits — offer the upgrade path. */
  onCreditsBlocked: () => void;
  onSendStateChange: () => void;
  invalidateImageCache: () => void;
}

/* Server status phases mapped to what the user should read while waiting.
   The stream already distinguishes each tool call; before this map the client
   collapsed everything into "Drawing…" and canvas work looked like a hang. */
const PHASE_LABELS: Record<string, string> = {
  drawing: "Drawing…",
  "reading-canvas": "Looking at your canvas…",
  arranging: "Arranging the canvas…",
  filming: "Filming…",
};

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
  /* Clips queued this turn, persisted onto the assistant message so a reload
     re-attaches to the in-flight job by jobId rather than losing the card. */
  const videos: { jobId: string; status: string; skillId?: string; queuedAt?: number }[] = [];
  let streamError: string | null = null;
  /* Set by a `notice` event when the doodle tool refused for lack of credits.
     Read after the reply renders, so the CTA lands under the agent's
     explanation rather than above it. */
  let creditsBlocked = false;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: toApiMessages(history, skillPinState.pinnedSkillId),
        styleId: getStyleId(),
        familyId: getArtFamilyId(),
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
          kind?: string;
          balance?: number;
          skillId?: string;
          ops?: CanvasOp[];
          label?: string;
          jobId?: string;
          estimatedSeconds?: number;
          /** On a `media` event: how many images this run will produce. */
          frames?: number;
        };
        if (event.type === "text" && event.text) {
          text += event.text;
          thinking.setText(text);
        } else if (event.type === "status" && event.phase) {
          if (event.phase === "drawing") {
            /* Not just a label: reserve the image box now, sized from the skill
               the agent actually chose, so the result lands in a space that is
               already the right shape. */
            thinking.setDrawing(event.skillId ?? skillPinState.pinnedSkillId);
          } else {
            const phaseLabel = PHASE_LABELS[event.phase];
            if (phaseLabel) thinking.setPhase(phaseLabel);
          }
        } else if (event.type === "notice" && event.kind === "credits") {
          creditsBlocked = true;
        } else if (event.type === "canvas" && event.ops?.length) {
          // summarizeOps() already produced a human sentence server-side; it was
          // being forwarded over the wire and then dropped on the floor.
          if (event.label) thinking.setPhase(event.label);
          callbacks.onCanvasOps(event.ops, event.label);
        } else if (event.type === "media" && event.jobId) {
          /* Images are queued now, not returned inline. Keep the drawing
             skeleton on screen and let the watcher feed each delivered frame
             through the SAME onImage callback the old inline path used, so
             rendering, canvas hand-off and thread persistence are unchanged. */
          const skillId = event.skillId ?? skillPinState.pinnedSkillId;
          thinking.setDrawing(skillId);
          const jobId = event.jobId;
          await new Promise<void>((resolve) => {
            startImageJob({
              jobId,
              frames: event.frames ?? 1,
              onImage: (url) => {
                images.push(url);
                callbacks.onImage(url, skillId);
                trackDoodleGenerated({
                  skill_id: skillId,
                  skill_name: skillId ? getSkill(skillId)?.name : undefined,
                  has_photo: !!attachState.attachedUrl,
                  has_reference: history.some((m) => m.role === "user" && !!m.refImageUrl),
                });
                const skillName = skillId ? getSkill(skillId)?.name : undefined;
                if (threadId && skillName) setThreadThumbnail(threadId, url, skillName);
              },
              onFailed: (message) => {
                streamError = message;
              },
              onSettled: resolve,
            });
          });
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
        } else if (event.type === "video" && event.jobId) {
          const skillId = event.skillId ?? skillPinState.pinnedSkillId;
          // queuedAt is stamped here, at the moment the job is known to exist,
          // so the wait the user is shown survives a reload (see chat-store).
          videos.push({ jobId: event.jobId, status: "pending", skillId, queuedAt: Date.now() });
          callbacks.onVideo(
            event.jobId,
            event.estimatedSeconds ?? 0,
            skillId,
          );
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
    if (creditsBlocked) callbacks.onCreditsBlocked();
  } catch (err) {
    thinking.remove();
    if (err instanceof DOMException && err.name === "AbortError") {
      callbacks.onStatus("Generation stopped.", false);
      saveAssistantReply();
    } else {
      // Persist whatever prose arrived before the break, then show the failure
      // in the thread with a retry rather than only in the composer status line.
      saveAssistantReply();
      callbacks.onError(err instanceof Error ? err.message : "Chat request failed");
    }
  } finally {
    sendState.activeAbort = null;
    sendState.sending = false;
    callbacks.onSendStateChange();
  }

  function saveAssistantReply(): void {
    if (!text && images.length === 0 && videos.length === 0) return;
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: text,
      images: images.length > 0 ? images : undefined,
      videos: videos.length > 0 ? videos : undefined,
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
