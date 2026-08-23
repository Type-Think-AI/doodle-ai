/* Home landing page: attach/describe a doodle, hit send, and it creates a
   new chat thread with that first message already in it, then hands off
   to /c/[id] — which picks up the pending turn automatically. Mirrors the
   composer in chat.ts, but never renders bubbles or calls /api/chat itself.

   Supports the same @/#// mentions as chat.ts (composer-mentions.ts):
   @character attaches a saved reference photo, /skill pins a skill (applied
   once the thread is created, on send), #doodle attaches a moodboard
   reference image. A skill can also arrive via ?skill=<id> (from a skill
   detail page's "Use this skill" link) — pre-pinned the same way, still
   without creating a thread until send. */

import { MAX_IMAGE_BYTES, STORAGE_KEY } from "../../lib/doodle-constants";
import { getCharacter } from "./character-store";
import { getSkill } from "../../lib/skills";
import { loadMoodboard } from "./moodboard";
import { appendMessage, createThread, setThreadSkill, type ChatMessage } from "./chat-store";
import { initMentions, serializeComposer } from "./composer-mentions";
import { initMediaPicker } from "./media-picker";
import { setImageSrc, guardBfcacheRestore } from "./dom-utils";

function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function hasKey(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY)?.trim());
  } catch {
    return false;
  }
}

function initHome(): void {
  const keyBanner = $("homeKeyBanner");
  const skillChip = $("homeSkillChip");
  const skillChipLabel = $("homeSkillChipLabel");
  const skillChipClear = $("homeSkillChipClear");
  const attachRow = $("homeAttachRow");
  const attachPreview = $<HTMLImageElement>("homeAttachPreview");
  const attachMeta = $("homeAttachMeta");
  const attachRemove = $("homeAttachRemove");
  const attachBtn = $("homeAttachBtn");
  const fileInput = $<HTMLInputElement>("homeFileInput");
  const input = $("homeInput");
  const sendBtn = $<HTMLButtonElement>("homeSend");
  const statusEl = $("homeStatus");
  const popover = $("homeMentionPopover");
  if (!input || !sendBtn || !statusEl || !popover) return;

  let attachedUrl: string | null = null;
  let attachedPreviewUrl: string | null = null;
  let uploading = false;
  let sending = false;
  let pendingSkillId: string | undefined;

  function setStatus(msg: string, err = false): void {
    statusEl!.textContent = msg;
    statusEl!.dataset.err = String(err);
  }
  function syncSendState(): void {
    sendBtn!.disabled = sending || uploading;
  }

  function syncSkillChip(): void {
    if (!skillChip || !skillChipLabel) return;
    const skill = pendingSkillId ? getSkill(pendingSkillId) : undefined;
    skillChip.hidden = !skill;
    if (skill) skillChipLabel.textContent = skill.name;
  }
  skillChipClear?.addEventListener("click", () => {
    pendingSkillId = undefined;
    syncSkillChip();
  });

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
    if (!hasKey()) {
      setStatus("Add your PicX API key in Settings to attach a photo.", true);
      keyBanner!.hidden = false;
      return;
    }

    attachedPreviewUrl = URL.createObjectURL(file);
    setImageSrc(attachPreview!, attachedPreviewUrl);
    attachRow!.hidden = false;
    attachMeta!.textContent = "Uploading…";
    uploading = true;
    syncSendState();

    try {
      const apiKey = localStorage.getItem(STORAGE_KEY) || "";
      const form = new FormData();
      form.append("file", file);
      form.append("apiKey", apiKey);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
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

  function send(): void {
    const { text, characterId, skillId, refImageId } = serializeComposer(input!);
    if (characterId) attachCharacterPhoto(characterId);
    if (skillId) {
      pendingSkillId = skillId;
      syncSkillChip();
    }
    const refImageUrl = refImageId ? loadMoodboard().find((m) => m.id === refImageId)?.url : undefined;

    if (!text && !attachedUrl) {
      setStatus("Type a message or attach a photo first.", true);
      return;
    }
    if (!hasKey()) {
      keyBanner!.hidden = false;
      setStatus("Add your PicX API key in Settings to generate doodles.", true);
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      imageUrl: attachedUrl || undefined,
      refImageUrl,
      createdAt: Date.now(),
    };
    const threadId = createThread();
    if (pendingSkillId) setThreadSkill(threadId, pendingSkillId);
    appendMessage(threadId, userMessage);
    window.location.href = `/c/${threadId}`;
  }

  /* ---- Wire events ---- */
  const mentions = initMentions(input, popover, {
    onSkillSelect: (skillId) => {
      pendingSkillId = skillId;
      syncSkillChip();
    },
  });
  $("homeCharacterBtn")?.addEventListener("click", () => mentions.triggerFor("@"));
  $("homeSkillBtn")?.addEventListener("click", () => mentions.triggerFor("/"));

  initMediaPicker({
    trigger: attachBtn as HTMLButtonElement,
    cameraButton: $("homeCameraBtn") as HTMLButtonElement,
    fileInput: fileInput!,
    dialog: $("homeCameraDialog")!,
    video: $("homeCameraVideo") as HTMLVideoElement,
    preview: $("homeCameraPreview") as HTMLImageElement,
    canvas: $("homeCameraCanvas") as HTMLCanvasElement,
    captureButton: $("homeCameraCapture") as HTMLButtonElement,
    retakeButton: $("homeCameraRetake") as HTMLButtonElement,
    useButton: $("homeCameraUse") as HTMLButtonElement,
    closeButton: $("homeCameraClose") as HTMLButtonElement,
    cancelButton: $("homeCameraCancel") as HTMLButtonElement,
    status: $("homeCameraStatus")!,
    onFile: (file) => void handleFile(file),
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file);
  });
  attachRemove?.addEventListener("click", clearAttachment);

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl);
  });

  /* ---- Initial paint ---- */
  keyBanner!.hidden = hasKey();
  guardBfcacheRestore();

  // Arriving here from a skill's detail page ("Use this skill") pre-pins
  // that skill, same as picking it via / in the composer — but nothing is
  // created yet; a thread only exists once you actually send.
  const skillFromUrl = new URLSearchParams(window.location.search).get("skill");
  if (skillFromUrl && getSkill(skillFromUrl)) {
    pendingSkillId = skillFromUrl;
    syncSkillChip();
    window.history.replaceState(null, "", "/");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHome);
} else {
  initHome();
}
