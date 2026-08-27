/* /c/[id] chat page controller — thin orchestrator that wires state, DOM,
   API-turn, and canvas-bridge modules. All public behaviour, localStorage
   keys, event names, and route semantics are unchanged. */

import { getSkill } from "../../../lib/skills";
import { loadThread, hydrateThread, appendMessage, getThreadSkill, type ChatMessage } from "../chat-store";
import { initLightbox } from "../lightbox";
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
  downloadImage,
  REFINE_PLACEHOLDER,
  type RenderContext,
} from "./render";
import {
  requestAssistantReply,
  send as apiSend,
  handleFile,
  type TurnCallbacks,
} from "./api-turn";
import {
  createWhiteboardState,
  setWhiteboard,
  initSplitResize,
  restoreSplit,
  initMobileCanvas,
  backfillCanvasOnLoad,
  pushToCanvas,
  collectThreadImages,
  invalidateThreadImagesCache,
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

  const renderCtx: RenderContext = {
    thread,
    empty: empty!,
    input,
    onRemix: (userMsg) => void remix(userMsg),
    onDownload: (url) => void downloadImage(url),
  };

  const turnCallbacks: TurnCallbacks = {
    onThinkingStart: () => {
      const bubble = renderThinking(thread);
      return { setText: bubble.setText, setDrawing: bubble.setDrawing, remove: () => bubble.wrap.remove() };
    },
    onAssistantMessage: (msg, preceding) => {
      const result = renderMessage(renderCtx, msg, preceding);
      if (result.hasResult) hasResult = true;
      if (msg.role === "user") lastUserMessage = msg;
      pushToCanvas(collectThreadImages(threadId!));
    },
    onImage: (url, _skillId) => {
      pushToCanvas([url]);
      if (!whiteboardState.on && !whiteboardState.dismissed) {
        setWhiteboard(whiteboardState, true, chatSplit, canvasPanel, whiteboardToggle, threadId!);
      }
    },
    onCredits: (balance) => {
      window.dispatchEvent(new CustomEvent("doodleai:credits", { detail: { balance } }));
    },
    onStatus: doSetStatus,
    onSendStateChange: doSyncSendState,
    invalidateImageCache: invalidateThreadImagesCache,
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
  if (whiteboardState.on) backfillCanvasOnLoad(threadId);

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
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (attachState.attachedPreviewUrl) URL.revokeObjectURL(attachState.attachedPreviewUrl);
  });

  /* ---- Initial paint ---- */
  doSyncSkillChip();
  guardBfcacheRestore();

  function paintHistory(messages: ChatMessage[]): void {
    thread!.querySelectorAll(".chat-msg").forEach((el) => el.remove());
    invalidateThreadImagesCache();
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
    pushToCanvas(collectThreadImages(threadId!));
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
