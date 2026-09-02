/* /c/[id] chat page controller — thin orchestrator that wires state, DOM,
   API-turn, and canvas-bridge modules. All public behaviour, localStorage
   keys, event names, and route semantics are unchanged. */

import { getSkill } from "../../../lib/skills";
import { loadThread, hydrateThread, appendMessage, getThreadSkill, type ChatMessage } from "../chat-store";
import { initLightbox, openLightbox } from "../lightbox";
import { initMentions } from "../composer-mentions";
import { initMediaPicker, initComposerDropZone } from "../media-picker";
import { setImageSrc, guardBfcacheRestore } from "../dom-utils";
import { getCharacter } from "../character-store";

import {
  threadIdFromPath,
  createSkillPinState,
  createAttachmentState,
  createSendState,
  clearAttachmentState,
  pinSkill,
  clearSkillPin,
} from "./state";
import {
  $,
  setStatus,
  syncSendState,
  syncSkillChip,
  renderMessage,
  renderThinking,
  renderError,
  renderCreditsCta,
  renderVideoCard,
  downloadImage,
  downloadVideo,
  REFINE_PLACEHOLDER,
  type RenderContext,
} from "./render";
import { pruneStaleSuggestions } from "./suggestions";
import {
  requestAssistantReply,
  send as apiSend,
  handleFile,
  type TurnCallbacks,
} from "./api-turn";
import { startVideoJob, stopAllVideoJobs } from "./video-job";
import { cancelAllImageJobs } from "./image-job";
import {
  createWhiteboardState,
  setWhiteboard,
  initSplitResize,
  restoreSplit,
  initMobileCanvas,
  backfillCanvasOnLoad,
  pushToCanvas,
  pushCanvasOps,
  collectThreadMedia,
  invalidateThreadMediaCache,
} from "./canvas";

function initChat(): void {
  const threadId = threadIdFromPath();
  if (!threadId) return;

  /* ---- DOM refs ---- */
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

  /* ---- State ---- */
  const skillPinState = createSkillPinState(threadId);
  const attachState = createAttachmentState();
  const sendState = createSendState();
  let lastUserMessage: ChatMessage | null = null;
  let hasResult = false;

  const isMobile = window.matchMedia("(max-width: 860px)").matches;
  const whiteboardState = createWhiteboardState(isMobile);
  if (isMobile) initMobileCanvas(chatSplit, canvasPanel, whiteboardToggle);

  /* ---- Callbacks wiring ---- */
  function doSetStatus(msg: string, err = false): void {
    setStatus(statusEl!, msg, err);
  }
  function doSyncSendState(): void {
    syncSendState(sendBtn!, sendState.sending, attachState.uploading);
  }
  function doSyncSkillChip(): void {
    const skill = skillPinState.pinnedSkillId ? getSkill(skillPinState.pinnedSkillId) : undefined;
    syncSkillChip(skillChip, skillChipLabel, skill);
  }
  function doPinSkill(skillId: string): void {
    pinSkill(skillPinState, threadId!, skillId);
    doSyncSkillChip();
  }
  function doClearAttachment(): void {
    clearAttachmentState(attachState);
    if (attachRow) attachRow.hidden = true;
    if (fileInput) fileInput.value = "";
  }

  /* Picking an existing image in the "+" media dialog
     (ComposerMediaDialog.astro). The image is already hosted — it came from an
     earlier upload or generation in this account — so there is nothing to
     upload: set the attachment and show the same preview row a fresh upload
     produces. The dialog holds no state; it only announces the choice. */
  window.addEventListener("doodleai:media-pick", (event) => {
    const detail = (event as CustomEvent<{ url?: string; kind?: string }>).detail;
    const url = detail?.url;
    if (!url) return;

    /* An animation cannot be an attachment, so picking one opens it instead.
       Two reasons, both hard rather than stylistic:
         - the preview row's element is an <img>, and an mp4 in an <img> paints a
           broken-image icon, which reads as the animation having been lost;
         - the attachment travels up as `imageUrl` and is injected into the
           prompt as "Attached photo: <url>", then handed to the image model as a
           photo reference — an mp4 there is rejected upstream AFTER the user has
           been charged, which is the expensive way to find out.
       Viewing is the honest action for a finished animation today. When the
       reference-to-video path can accept a clip, this becomes an attach. */
    if (detail?.kind === "clip") {
      openLightbox([{ url, isVideo: true }], url);
      return;
    }

    doClearAttachment();
    attachState.attachedUrl = url;
    if (attachPreview) setImageSrc(attachPreview, url);
    if (attachMeta) attachMeta.textContent = "Ready";
    if (attachRow) attachRow.hidden = false;
    doSyncSendState();
  });

  /* Tapping a suggestion chip is exactly the same act as typing that text and
     pressing send, so it goes through the normal send path — one code path for
     the turn, and the chosen suggestion is stored as a real user message. */
  function sendSuggestion(text: string): void {
    if (sendState.sending) return;
    input!.textContent = text;
    input!.focus();
    void doSend();
  }

  const renderCtx: RenderContext = {
    thread,
    empty: empty!,
    input,
    onRemix: (userMsg) => void remix(userMsg),
    onDownload: (url) => void downloadImage(url),
    onSuggestion: sendSuggestion,
    onVideoResume: (clip, precedingUserMessage) => {
      const onRetry = precedingUserMessage
        ? () => void remix(precedingUserMessage)
        : lastUserMessage
          ? () => void remix(lastUserMessage!)
          : null;
      if (clip.status === "ok" && clip.url) {
        renderVideoCard(
          thread,
          // posterUrl (migration 0018) is persisted on the clip for 'image'-mode
          // videos, so a reload repaints the card with its first-frame still
          // rather than a black box until the mp4 loads.
          { phase: "done", url: clip.url, posterUrl: clip.posterUrl },
          { onRetry, onDownload: (url) => void downloadVideo(url) },
        );
      } else if (clip.status === "failed" || clip.status === "refunded") {
        renderVideoCard(
          thread,
          { phase: "failed", reason: "That didn't come out. Your credits were refunded." },
          { onRetry, onDownload: (url) => void downloadVideo(url) },
        );
      } else {
        // pending — re-attach to the still-in-flight job. The clip carries its
        // own skillId from when it was queued, so a reload can still name the
        // thread once it lands.
        startVideoJob({
          thread,
          threadId: threadId!,
          jobId: clip.jobId,
          estimatedSeconds: 0,
          skillId: clip.skillId,
          // The persisted submit time, so a reload continues the real wait
          // rather than restarting the clock at zero.
          queuedAt: clip.queuedAt,
          onRetry,
        });
      }
    },
  };

  const turnCallbacks: TurnCallbacks = {
    onThinkingStart: () => {
      const bubble = renderThinking(thread);
      return {
        setText: bubble.setText,
        setPhase: bubble.setPhase,
        setDrawing: bubble.setDrawing,
        remove: () => bubble.wrap.remove(),
      };
    },
    onAssistantMessage: (msg, preceding) => {
      // resumeVideos=false: the live turn's clip card was already mounted by
      // onVideo during the stream; re-mounting here would duplicate it.
      const result = renderMessage(renderCtx, msg, preceding, false);
      if (result.hasResult) hasResult = true;
      if (msg.role === "user") lastUserMessage = msg;
      // Suggestions answer "what next" at one moment; keep them on the newest
      // reply only so the thread does not accumulate stale branches.
      pruneStaleSuggestions(thread);
      pushToCanvas(collectThreadMedia(threadId!));
    },
    onImage: (url) => {
      pushToCanvas([{ url, isVideo: false }]);
      if (!whiteboardState.on && !whiteboardState.dismissed) {
        setWhiteboard(whiteboardState, true, chatSplit, canvasPanel, whiteboardToggle, threadId!);
      }
    },
    onVideo: (jobId, estimatedSeconds, skillId) => {
      startVideoJob({
        thread,
        threadId: threadId!,
        jobId,
        estimatedSeconds,
        skillId,
        onRetry: lastUserMessage ? () => void remix(lastUserMessage!) : null,
      });
      /* Open the board for an animation too. Only `onImage` did this, so a turn
         that produced just an animation left the canvas shut — the user got a
         card in the chat column and no sign the board was where it would also
         land. Done at queue time, not on completion, so the board is already
         open and measured when the clip arrives (tldraw cannot initialise inside
         a display:none container, so revealing it late is the expensive path). */
      if (!whiteboardState.on && !whiteboardState.dismissed) {
        setWhiteboard(whiteboardState, true, chatSplit, canvasPanel, whiteboardToggle, threadId!);
      }
    },
    onCredits: (balance) => {
      window.dispatchEvent(new CustomEvent("doodleai:credits", { detail: { balance } }));
    },
    onCanvasOps: (ops, label) => pushCanvasOps(ops, label),
    onStatus: doSetStatus,
    onError: (message) => {
      // Keep the composer status line clean — the failure now lives in the
      // thread where the user is looking, with the retry attached to it.
      doSetStatus("");
      renderError(thread, message, lastUserMessage ? () => void remix(lastUserMessage!) : null);
    },
    onCreditsBlocked: () => renderCreditsCta(thread),
    onSendStateChange: doSyncSendState,
    invalidateImageCache: invalidateThreadMediaCache,
  };

  /* ---- Skill chip ---- */
  skillChipClear?.addEventListener("click", () => {
    clearSkillPin(skillPinState, threadId!);
    doSyncSkillChip();
  });

  /* ---- Whiteboard toggle ---- */
  whiteboardToggle?.addEventListener("click", () => {
    const next = !whiteboardState.on;
    whiteboardState.dismissed = !next;
    setWhiteboard(whiteboardState, next, chatSplit, canvasPanel, whiteboardToggle, threadId!);
  });
  whiteboardClose?.addEventListener("click", () => {
    whiteboardState.dismissed = true;
    setWhiteboard(whiteboardState, false, chatSplit, canvasPanel, whiteboardToggle, threadId!);
  });

  /* ---- Split resize ---- */
  if (chatSplit) restoreSplit(chatSplit);
  if (splitHandle && chatSplit) initSplitResize(splitHandle, chatSplit, whiteboardState);

  /* ---- Canvas backfill on load (desktop, canvas already open in SSR) ---- */
  if (whiteboardState.on) {
    backfillCanvasOnLoad(threadId);
    window.dispatchEvent(new Event("doodleai:sidebar-collapse"));
  }

  /* ---- Send & remix ---- */
  async function doSend(): Promise<void> {
    await apiSend({
      threadId: threadId!,
      input: input!,
      sendState,
      skillPinState,
      attachState,
      lastUserMessage,
      callbacks: turnCallbacks,
      onSkillPin: doPinSkill,
      onCharacterAttach: (characterId) => {
        const character = getCharacter(characterId);
        if (!character) return;
        doClearAttachment();
        attachState.attachedUrl = character.imageUrl;
        if (attachPreview) setImageSrc(attachPreview, character.imageUrl);
        if (attachMeta) attachMeta.textContent = character.name;
        if (attachRow) attachRow.hidden = false;
      },
      onClearAttachment: doClearAttachment,
      setCanvasDismissed: (v) => { whiteboardState.dismissed = v; },
      setLastUserMessage: (msg) => { lastUserMessage = msg; },
    });
  }

  async function remix(userMsg: ChatMessage): Promise<void> {
    if (sendState.sending) return;
    const copy: ChatMessage = { ...userMsg, createdAt: Date.now() };
    const history = appendMessage(threadId!, copy);
    renderMessage(renderCtx, copy, null);
    await requestAssistantReply(
      threadId!,
      history,
      sendState,
      skillPinState,
      attachState,
      lastUserMessage,
      turnCallbacks,
    );
  }

  /* ---- Wire events ---- */
  const mentions = initMentions(input, popover, {
    onSkillSelect: (skillId) => doPinSkill(skillId),
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
    onFile: (file) => void handleFile(file, {
      attachState,
      attachPreview,
      attachRow,
      attachMeta,
      callbacks: { onStatus: doSetStatus, onSendStateChange: doSyncSendState },
    }),
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file, {
      attachState,
      attachPreview,
      attachRow,
      attachMeta,
      callbacks: { onStatus: doSetStatus, onSendStateChange: doSyncSendState },
    });
  });
  attachRemove?.addEventListener("click", doClearAttachment);

  const dropBox = $("chatBox");
  if (dropBox) {
    initComposerDropZone(dropBox, (files) => {
      const file = files[0];
      if (file) void handleFile(file, {
        attachState,
        attachPreview,
        attachRow,
        attachMeta,
        callbacks: { onStatus: doSetStatus, onSendStateChange: doSyncSendState },
      });
    });
  }

  sendBtn.addEventListener("click", () => void doSend());
  $("chatStopBtn")?.addEventListener("click", () => {
    if (sendState.activeAbort) {
      sendState.activeAbort.abort();
      sendState.activeAbort = null;
    }
    /* Aborting the response stream is NOT enough. A queued picture is watched by
       a poll loop against our own row (src/scripts/app/chat/image-job.ts), on a
       separate request from the stream — so before this, pressing stop cut the
       stream and left the spinner counting. Both watchers are cancelled here so
       stop means stopped, and each leaves a line on screen rather than a frozen
       placeholder. */
    cancelAllImageJobs();
    stopAllVideoJobs();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  });

  // 'pagehide' instead of 'beforeunload': this handler only revokes an object
  // URL (pure cleanup, no confirmation prompt), and beforeunload disqualifies
  // the page from the back/forward cache. pagehide fires on navigation too.
  window.addEventListener("pagehide", () => {
    if (attachState.attachedPreviewUrl) URL.revokeObjectURL(attachState.attachedPreviewUrl);
  });

  /* ---- Initial paint ---- */
  doSyncSkillChip();
  guardBfcacheRestore();

  function paintHistory(messages: ChatMessage[]): void {
    thread!.querySelectorAll(".chat-msg").forEach((el) => el.remove());
    invalidateThreadMediaCache();
    hasResult = false;
    lastUserMessage = null;
    let precedingUserMessage: ChatMessage | null = null;
    messages.forEach((msg) => {
      const result = renderMessage(renderCtx, msg, precedingUserMessage);
      if (result.hasResult) hasResult = true;
      if (msg.role === "user") {
        precedingUserMessage = msg;
        lastUserMessage = msg;
      }
    });
    empty!.hidden = messages.length > 0;
    if (hasResult) input!.dataset.placeholder = REFINE_PLACEHOLDER;
    // A repaint renders every historical reply, each of which may carry its own
    // follow-up list; only the newest set is still a live offer.
    pruneStaleSuggestions(thread!);
    pushToCanvas(collectThreadMedia(threadId!));
  }

  function resumePendingTurn(messages: ChatMessage[]): void {
    if (sendState.sending) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "user") {
      void requestAssistantReply(
        threadId!,
        messages,
        sendState,
        skillPinState,
        attachState,
        lastUserMessage,
        turnCallbacks,
      );
    }
  }

  const local = loadThread(threadId);
  paintHistory(local);
  resumePendingTurn(local);

  void hydrateThread(threadId).then((messages) => {
    if (sendState.sending) return;
    if (messages.length === local.length && local.length > 0) return;
    skillPinState.pinnedSkillId = getThreadSkill(threadId);
    doSyncSkillChip();
    paintHistory(messages);
    resumePendingTurn(messages);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat);
} else {
  initChat();
}
