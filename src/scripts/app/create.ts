/* Generation workspace for /create/[skill] — upload/camera capture, PicX
   upload + generate, result view, share, download, and add-to-moodboard.
   Ported from the old single-page doodle.ts, parameterized by the skill id
   embedded on #createPage's data-skill attribute so the right prompt
   builder from doodle-constants.ts is used. */

import {
  LOADING_MESSAGES,
  MAX_IMAGE_BYTES,
  STORAGE_KEY,
  STYLE_THEME_STORAGE_KEY,
  SURPRISE_PROMPTS,
  THEMES,
  buildCollagePrompt,
  buildDoodlePrompt,
  buildFullBodyCollagePrompt,
  pick,
} from "../../lib/doodle-constants";
import { addToMoodboard } from "./moodboard";
import { initLightbox, openLightbox } from "./lightbox";

type UploadProgress = "idle" | "uploading" | "done" | "error";

function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function getStoredStyleTheme() {
  try {
    const id = localStorage.getItem(STYLE_THEME_STORAGE_KEY);
    return THEMES.find((t) => t.id === id) || THEMES[0];
  } catch {
    return THEMES[0];
  }
}

function initCreate(): void {
  const page = document.getElementById("createPage");
  if (!page) return;

  const skillId = page.dataset.skill || "normal";
  const aspectRatio = (page.dataset.aspect as "1:1" | "3:2") || "1:1";
  const requiresPhoto = page.dataset.requiresPhoto === "true";

  const dropzone = $<HTMLLabelElement>("dropzone");
  const fileInput = $<HTMLInputElement>("fileInput");
  const cameraOpenBtn = $<HTMLButtonElement>("cameraOpenBtn");
  const cameraFallbackInput = $<HTMLInputElement>("cameraFallbackInput");
  const previewRow = $("previewRow");
  const previewImg = $<HTMLImageElement>("previewImg");
  const previewMeta = $("previewMeta");
  const changeBtn = $("changeBtn");
  const surpriseDesc = $<HTMLTextAreaElement>("surpriseDesc");
  const keyBanner = $("keyBanner");
  const generateBtn = $<HTMLButtonElement>("generateBtn");
  const statusEl = $("statusMsg");

  const panelInput = $("panelInput");
  const resultView = $("resultView");
  const resultStage = $("resultStage");
  const downloadBtn = $("downloadBtn");
  const retryBtn = $("retryBtn");
  const shareWhatsappBtn = $("shareWhatsappBtn");
  const shareXBtn = $("shareXBtn");
  const shareCopyBtn = $("shareCopyBtn");
  const shareCopied = $("shareCopied");

  const cameraBackdrop = $("cameraBackdrop");
  const cameraVideo = $<HTMLVideoElement>("cameraVideo");
  const cameraCanvas = $<HTMLCanvasElement>("cameraCanvas");
  const cameraClose = $<HTMLButtonElement>("cameraClose");
  const cameraShutter = $<HTMLButtonElement>("cameraShutter");
  const cameraSwitch = $<HTMLButtonElement>("cameraSwitch");
  const cameraError = $("cameraError");

  if (!generateBtn || !statusEl || !panelInput || !resultView || !resultStage) return;

  initLightbox();

  /* ---- State ---- */
  let apiKey = "";
  try {
    apiKey = localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    apiKey = "";
  }

  let uploadedFile: File | null = null;
  let assetUrl: string | null = null;
  let previewUrl: string | null = null;
  let uploadProgress: UploadProgress = "idle";
  let uploadRequestId = 0;

  let loading = false;
  let resultImageUrl: string | null = null;
  let loadingInterval: ReturnType<typeof setInterval> | null = null;

  function hasKey(): boolean {
    return apiKey.trim().length > 0;
  }

  function setStatus(msg: string, err = false): void {
    statusEl!.textContent = msg;
    statusEl!.classList.toggle("err", err);
  }

  function syncKeyBanner(): void {
    if (keyBanner) keyBanner.hidden = hasKey();
  }

  function canSubmit(): boolean {
    if (!hasKey()) return false;
    if (!requiresPhoto) return true;
    return uploadProgress === "done" && Boolean(assetUrl);
  }

  function syncButtons(): void {
    const busy = loading || uploadProgress === "uploading";
    generateBtn!.disabled = busy || !canSubmit();
    generateBtn!.textContent = loading ? "Creating…" : uploadProgress === "uploading" ? "Uploading…" : "Create my doodle";
  }

  function syncPreviewMeta(): void {
    if (!previewMeta) return;
    const labels: Record<UploadProgress, string> = {
      uploading: "Uploading…",
      done: "Uploaded ✓",
      error: "Upload failed",
      idle: "Ready to doodle",
    };
    previewMeta.textContent = labels[uploadProgress];
    previewMeta.className = `meta ${uploadProgress}`;
  }

  function showUploadView(): void {
    panelInput!.hidden = false;
    resultView!.hidden = true;
  }
  function showResultView(): void {
    panelInput!.hidden = true;
    resultView!.hidden = false;
  }

  function startLoading(): void {
    let i = 0;
    setStatus(LOADING_MESSAGES[0]);
    loadingInterval = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setStatus(LOADING_MESSAGES[i]);
    }, 2200);
  }
  function stopLoading(): void {
    if (loadingInterval) clearInterval(loadingInterval);
    loadingInterval = null;
    setStatus("");
  }

  /* ---- Upload ---- */
  async function uploadAsset(file: File, key: string): Promise<void> {
    const requestId = ++uploadRequestId;
    uploadProgress = "uploading";
    syncPreviewMeta();
    syncButtons();
    setStatus("Uploading your photo…");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("apiKey", key);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
      if (requestId !== uploadRequestId) return;
      assetUrl = data.url ?? null;
      uploadProgress = "done";
      syncPreviewMeta();
      syncButtons();
      setStatus("");
    } catch (err) {
      if (requestId !== uploadRequestId) return;
      assetUrl = null;
      uploadProgress = "error";
      syncPreviewMeta();
      syncButtons();
      const message = err instanceof Error ? err.message : "Upload failed";
      setStatus(
        message.includes("uploads:write") ? "This key needs uploads:write. Create a new key with Upload files enabled." : message,
        true,
      );
    }
  }

  function handleFile(file: File): void {
    if (!file.type.startsWith("image/")) {
      setStatus("That doesn't look like an image. Try another file.", true);
      return;
    }
    if (file.size === 0) {
      setStatus("That image is empty. Try another file.", true);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus("Images must be 20 MB or smaller.", true);
      return;
    }

    uploadRequestId += 1;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    uploadedFile = file;
    assetUrl = null;
    uploadProgress = "idle";
    previewUrl = URL.createObjectURL(file);

    if (previewImg) previewImg.src = previewUrl;
    if (dropzone) dropzone.hidden = true;
    if (previewRow) previewRow.hidden = false;
    syncPreviewMeta();

    if (hasKey()) {
      setStatus("Uploading your photo…");
      void uploadAsset(file, apiKey.trim());
    } else {
      setStatus("Add your PicX API key in Settings to upload.", true);
    }
    syncButtons();
  }

  function clearPhoto(): void {
    uploadRequestId += 1;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    uploadedFile = null;
    assetUrl = null;
    previewUrl = null;
    uploadProgress = "idle";
    previewImg?.removeAttribute("src");
    if (previewRow) previewRow.hidden = true;
    if (dropzone) dropzone.hidden = false;
    if (fileInput) fileInput.value = "";
    setStatus("");
    syncButtons();
  }

  /* ---- Generation ---- */
  function buildPrompt(): string {
    const themeHint = `Apply this visual style distinctly: ${getStoredStyleTheme().styleHint}`;
    if (skillId === "collage") return buildCollagePrompt();
    if (skillId === "full-body") return buildFullBodyCollagePrompt();
    if (skillId === "surprise") {
      const desc = surpriseDesc?.value.trim() || pick(SURPRISE_PROMPTS);
      return `Create a naive doodle fashion-chibi avatar: ${desc}\n\nStyle: Bold graphic hair shapes, rough marker or dry-brush edges, restrained watercolor-like color, clean white or warm-white background, flat and expressive, fashion-forward. No photorealism, no 3D, no heavy shading, no text, no watermarks. Deliberately naive brushwork with playful asymmetry.\n\n${themeHint}`;
    }
    return buildDoodlePrompt(themeHint);
  }

  async function requestGeneration(body: Record<string, unknown>): Promise<string> {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error || `API error: ${res.status}`);
    return data.url;
  }

  function renderResult(): void {
    resultStage!.classList.toggle("aspect-3-2", aspectRatio === "3:2");
    resultStage!.innerHTML = "";
    if (resultImageUrl) {
      const img = document.createElement("img");
      img.src = resultImageUrl;
      img.alt = `Your ${skillId} doodle`;
      resultStage!.appendChild(img);
      addToMoodboard(resultImageUrl);
    }
    showResultView();
  }

  async function handleGenerate(): Promise<void> {
    if (!hasKey()) {
      syncKeyBanner();
      setStatus("Add your PicX API key in Settings to generate.", true);
      return;
    }
    if (requiresPhoto && !canSubmit()) {
      setStatus(
        uploadProgress === "uploading" ? "Still uploading your photo…" : uploadProgress === "error" ? "Photo upload failed. Select it again to retry." : "Upload a photo first!",
        true,
      );
      return;
    }

    loading = true;
    syncButtons();
    startLoading();
    try {
      const body: Record<string, unknown> = {
        apiKey,
        prompt: buildPrompt(),
        aspectRatio,
        mode: requiresPhoto ? "edit" : "generate",
      };
      if (requiresPhoto) body.imageUrl = assetUrl;
      const url = await requestGeneration(body);
      stopLoading();
      resultImageUrl = url;
      renderResult();
    } catch (err) {
      stopLoading();
      setStatus(err instanceof Error ? err.message : "Generation failed", true);
    } finally {
      loading = false;
      syncButtons();
    }
  }

  function handleRetry(): void {
    resultImageUrl = null;
    resultStage!.innerHTML = "";
    if (requiresPhoto) clearPhoto();
    showUploadView();
    syncButtons();
  }

  async function handleDownload(): Promise<void> {
    if (!resultImageUrl) return;
    try {
      const response = await fetch(resultImageUrl, { mode: "cors" });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `doodlebooth-${skillId}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      const link = document.createElement("a");
      link.download = `doodlebooth-${skillId}.png`;
      link.href = resultImageUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus("Downloading directly from the image (opens in a new tab if your browser blocks a same-tab save).");
    }
  }

  /* ---- Share ---- */
  function getShareUrl(): string {
    return resultImageUrl || window.location.href;
  }
  function shareToWhatsapp(): void {
    const text = encodeURIComponent(`Check out my DoodleBooth doodle! ${getShareUrl()}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }
  function shareToX(): void {
    const text = encodeURIComponent("I turned my photo into a doodle with DoodleBooth ✏️");
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(getShareUrl())}`, "_blank", "noopener,noreferrer");
  }
  async function shareCopyLink(): Promise<void> {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        /* no-op */
      }
      textarea.remove();
    }
    if (shareCopied) {
      shareCopied.hidden = false;
      window.setTimeout(() => {
        shareCopied.hidden = true;
      }, 2000);
    }
  }

  /* ---- Camera capture ---- */
  let cameraStream: MediaStream | null = null;
  let cameraFacing: "user" | "environment" = "user";

  function stopCameraStream(): void {
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    if (cameraVideo) cameraVideo.srcObject = null;
  }

  async function startCameraStream(): Promise<void> {
    stopCameraStream();
    if (cameraError) cameraError.hidden = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cameraFacing }, audio: false });
      cameraStream = stream;
      if (cameraVideo) {
        cameraVideo.srcObject = stream;
        cameraVideo.dataset.facing = cameraFacing;
        await cameraVideo.play().catch(() => {});
      }
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera permission in your browser to use this."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "No camera was found on this device."
            : "Could not start the camera. You can still upload a photo instead.";
      if (cameraError) {
        cameraError.textContent = message;
        cameraError.hidden = false;
      }
    }
  }

  async function detectMultipleCameras(): Promise<void> {
    try {
      if (!navigator.mediaDevices?.enumerateDevices || !cameraSwitch) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameraSwitch.hidden = devices.filter((d) => d.kind === "videoinput").length <= 1;
    } catch {
      /* leave the switch button hidden */
    }
  }

  async function openCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraFallbackInput?.click();
      return;
    }
    cameraBackdrop?.classList.add("open");
    document.body.classList.add("lightbox-lock");
    await detectMultipleCameras();
    await startCameraStream();
  }
  function closeCamera(): void {
    cameraBackdrop?.classList.remove("open");
    document.body.classList.remove("lightbox-lock");
    stopCameraStream();
  }
  function switchCamera(): void {
    cameraFacing = cameraFacing === "user" ? "environment" : "user";
    void startCameraStream();
  }
  function capturePhoto(): void {
    if (!cameraVideo || !cameraCanvas) return;
    const { videoWidth, videoHeight } = cameraVideo;
    if (!videoWidth || !videoHeight) return;
    cameraCanvas.width = videoWidth;
    cameraCanvas.height = videoHeight;
    const ctx = cameraCanvas.getContext("2d");
    if (!ctx) return;
    if (cameraFacing === "user") {
      ctx.translate(videoWidth, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(cameraVideo, 0, 0, videoWidth, videoHeight);
    cameraCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `doodlebooth-camera-${Date.now()}.jpg`, { type: "image/jpeg" });
        closeCamera();
        handleFile(file);
      },
      "image/jpeg",
      0.92,
    );
  }

  /* ---- Wire events ---- */
  if (requiresPhoto) {
    dropzone?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput?.click();
      }
    });
    dropzone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag");
    });
    dropzone?.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag");
    });
    dropzone?.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag");
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) handleFile(file);
    });
    cameraFallbackInput?.addEventListener("change", () => {
      const file = cameraFallbackInput.files?.[0];
      if (file) handleFile(file);
      cameraFallbackInput.value = "";
    });
    cameraOpenBtn?.addEventListener("click", () => void openCamera());
    cameraClose?.addEventListener("click", closeCamera);
    cameraShutter?.addEventListener("click", capturePhoto);
    cameraSwitch?.addEventListener("click", switchCamera);
    cameraBackdrop?.addEventListener("click", (e) => {
      if (e.target === cameraBackdrop) closeCamera();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && cameraBackdrop?.classList.contains("open")) closeCamera();
    });
    window.addEventListener("beforeunload", stopCameraStream);
    changeBtn?.addEventListener("click", clearPhoto);
  } else {
    // Surprise Me needs no photo to submit.
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("prompt");
    if (prefill && surpriseDesc) surpriseDesc.value = prefill;
  }

  generateBtn.addEventListener("click", () => void handleGenerate());
  retryBtn?.addEventListener("click", handleRetry);
  downloadBtn?.addEventListener("click", () => void handleDownload());
  shareWhatsappBtn?.addEventListener("click", shareToWhatsapp);
  shareXBtn?.addEventListener("click", shareToX);
  shareCopyBtn?.addEventListener("click", () => void shareCopyLink());

  resultStage.addEventListener("click", () => {
    if (resultImageUrl) openLightbox([resultImageUrl], resultImageUrl);
  });
  resultStage.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && resultImageUrl) {
      e.preventDefault();
      openLightbox([resultImageUrl], resultImageUrl);
    }
  });

  window.addEventListener("beforeunload", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });

  /* ---- Initial paint ---- */
  syncKeyBanner();
  syncButtons();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCreate);
} else {
  initCreate();
}
