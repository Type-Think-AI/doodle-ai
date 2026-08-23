/* DoodleBooth home client, migrated from DoodleBooth's React component
   (src/app/page.tsx) into a framework-agnostic vanilla TS controller that
   drives the static Astro markup in src/pages/index.astro.

   Preserved behaviors:
   - Upload happens as soon as a valid file is selected (never on generate).
   - The Create button only generates; it reuses the already-uploaded asset.
   - API key persists in localStorage; changing it re-uploads a pending photo.
   - Loading rotation, error surface, retry, and download all match DoodleBooth. */

import {
  LOADING_MESSAGES,
  MAX_IMAGE_BYTES,
  STORAGE_KEY,
  SURPRISE_PROMPTS,
  THEMES,
  buildCollagePrompt,
  buildDoodlePrompt,
  buildFullBodyCollagePrompt,
  pick,
  type Theme,
} from "../lib/doodle-constants";

type UploadProgress = "idle" | "uploading" | "done" | "error";

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`DoodleBooth: missing #${id}`);
  return el as T;
}

function initDoodle(): void {
  const root = document.querySelector<HTMLElement>(".doodle-page");
  if (!root) return;

  /* ---- Elements ---- */
  const splash = document.getElementById("splash");
  const keyHint = $("keyHint");
  const keyHintBtn = $("keyHintBtn");
  const themesWrap = $("themes");

  const panelInput = $("panelInput"); // upload/generate view
  const dropzone = $<HTMLDivElement>("dropzone");
  const fileInput = $<HTMLInputElement>("fileInput");
  const cameraOpenBtn = $<HTMLButtonElement>("cameraOpenBtn");
  const cameraFallbackInput = $<HTMLInputElement>("cameraFallbackInput");
  const previewRow = $("previewRow");
  const previewImg = $<HTMLImageElement>("previewImg");
  const previewMeta = $("previewMeta");
  const changeBtn = $("changeBtn");
  const generateBtn = $<HTMLButtonElement>("generateBtn");
  const normalBtn = $<HTMLButtonElement>("normalBtn");
  const fullBodyBtn = $<HTMLButtonElement>("fullBodyBtn");
  const agentAskToggle = $<HTMLButtonElement>("agentAskToggle");
  const agentAskBody = $("agentAskBody");
  const agentAskInput = $<HTMLTextAreaElement>("agentAskInput");
  const agentAskSubmit = $<HTMLButtonElement>("agentAskSubmit");
  const agentAskStatus = $("agentAskStatus");
  const agentAskAnswer = $("agentAskAnswer");
  const surpriseBtn = $<HTMLButtonElement>("surpriseBtn");
  const statusEl = $("statusMsg");

  const resultView = $("resultView");
  const resultStage = $("resultStage");
  const downloadBtn = $("downloadBtn");
  const retryBtn = $("retryBtn");
  const shareWhatsappBtn = $("shareWhatsappBtn");
  const shareXBtn = $("shareXBtn");
  const shareCopyBtn = $("shareCopyBtn");
  const shareCopied = $("shareCopied");

  const moodboardSection = $("moodboardSection");
  const moodboardGrid = $("moodboardGrid");

  const lightboxBackdrop = $("lightboxBackdrop");
  const lightboxImg = $<HTMLImageElement>("lightboxImg");
  const lightboxClose = $("lightboxClose");
  const lightboxPrev = $<HTMLButtonElement>("lightboxPrev");
  const lightboxNext = $<HTMLButtonElement>("lightboxNext");
  const lightboxCounter = $("lightboxCounter");

  const cameraBackdrop = $("cameraBackdrop");
  const cameraVideo = $<HTMLVideoElement>("cameraVideo");
  const cameraCanvas = $<HTMLCanvasElement>("cameraCanvas");
  const cameraClose = $<HTMLButtonElement>("cameraClose");
  const cameraShutter = $<HTMLButtonElement>("cameraShutter");
  const cameraSwitch = $<HTMLButtonElement>("cameraSwitch");
  const cameraError = $("cameraError");

  const settingsBtn = $("settingsBtn");
  const modalBackdrop = $("settingsBackdrop");
  const modalCloseBtn = $("settingsClose");
  const apiKeyInput = $<HTMLInputElement>("apiKeyInput");
  const keySaved = $("keySaved");

  /* ---- State ---- */
  let currentTheme: Theme = THEMES[0];
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
  let isError = false;
  let resultImageUrl: string | null = null;
  let resultSVG: string | null = null;
  let resultAspectRatio: "1:1" | "3:2" = "3:2";
  let loadingInterval: ReturnType<typeof setInterval> | null = null;

  /* ---- Helpers ---- */
  function hasKey(): boolean {
    return apiKey.trim().length > 0;
  }

  function setStatus(msg: string, err = false): void {
    isError = err;
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", err);
  }

  function syncKeyHint(): void {
    keyHint.hidden = hasKey();
  }

  function syncButtons(): void {
    const busy = loading || uploadProgress === "uploading";
    generateBtn.disabled = busy;
    normalBtn.disabled = busy;
    fullBodyBtn.disabled = busy;
    surpriseBtn.disabled = loading;
    generateBtn.textContent = loading
      ? "Creating..."
      : uploadProgress === "uploading"
        ? "Uploading..."
        : "Create my doodle collage";
    normalBtn.textContent = loading ? "Creating..." : "Convert to normal doodle";
    fullBodyBtn.textContent = loading ? "Creating..." : "Create full-body action collage";
    surpriseBtn.textContent = loading ? "Working..." : "No photo? Surprise me";
  }

  function syncPreviewMeta(): void {
    const labels: Record<UploadProgress, string> = {
      uploading: "Uploading...",
      done: "Uploaded ✓",
      error: "Upload failed",
      idle: "Ready to doodle",
    };
    previewMeta.textContent = labels[uploadProgress];
    previewMeta.className = `meta ${uploadProgress}`;
  }

  function showUploadView(): void {
    panelInput.hidden = false;
    resultView.hidden = true;
  }

  function showResultView(): void {
    panelInput.hidden = true;
    resultView.hidden = false;
  }

  function startLoading(): void {
    generateBtn.classList.remove("token-drop");
    void generateBtn.offsetWidth;
    generateBtn.classList.add("token-drop");
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

  /* ---- Upload (runs on selection, never on generate) ---- */
  async function uploadAsset(file: File, key: string): Promise<void> {
    const requestId = ++uploadRequestId;
    uploadProgress = "uploading";
    syncPreviewMeta();
    syncButtons();
    setStatus("Uploading your photo...");

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
      const message = err instanceof Error ? err.message : "Upload failed";
      assetUrl = null;
      uploadProgress = "error";
      syncPreviewMeta();
      syncButtons();
      setStatus(
        message.includes("uploads:write")
          ? "This key needs uploads:write. Create a new key with Upload files enabled."
          : message,
        true,
      );
    }
  }

  /* ---- API key ---- */
  function persistKey(nextKey: string): void {
    try {
      if (nextKey) localStorage.setItem(STORAGE_KEY, nextKey);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable (private mode) — key stays in memory only */
    }
  }

  function updateApiKey(val: string): void {
    const nextKey = val.trim();
    if (uploadedFile && nextKey !== apiKey.trim()) {
      assetUrl = null;
      uploadProgress = "idle";
      syncPreviewMeta();
      if (nextKey) void uploadAsset(uploadedFile, nextKey);
    }
    apiKey = val;
    persistKey(nextKey);
    keySaved.hidden = !hasKey();
    syncKeyHint();
    syncButtons();
  }

  /* ---- File handling ---- */
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

    previewImg.src = previewUrl;
    dropzone.hidden = true;
    previewRow.hidden = false;
    syncPreviewMeta();

    if (hasKey()) {
      setStatus("Uploading your photo...");
      void uploadAsset(file, apiKey.trim());
    } else {
      setStatus("Add your PicX API key to upload.", true);
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
    previewImg.removeAttribute("src");
    previewRow.hidden = true;
    dropzone.hidden = false;
    fileInput.value = "";
    setStatus("");
    syncButtons();
  }

  /* ---- Generation ---- */
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

  async function callGenerate(body: Record<string, unknown>): Promise<void> {
    loading = true;
    syncButtons();
    startLoading();
    try {
      const url = await requestGeneration(body);
      stopLoading();
      resultImageUrl = url;
      resultSVG = null;
      renderResult();
    } catch (err) {
      stopLoading();
      setStatus(err instanceof Error ? err.message : "Generation failed", true);
    } finally {
      loading = false;
      syncButtons();
    }
  }

  function openSettings(): void {
    modalBackdrop.classList.add("open");
    apiKeyInput.focus();
  }

  function closeSettings(): void {
    modalBackdrop.classList.remove("open");
  }

  function canGenerateFromPhoto(): boolean {
    if (!hasKey()) {
      openSettings();
      setStatus("Enter your PicX API key to generate.", true);
      return false;
    }
    if (!uploadedFile) {
      setStatus("Upload a photo first!", true);
      return false;
    }
    if (!assetUrl) {
      setStatus(
        uploadProgress === "uploading"
          ? "Still uploading your photo..."
          : "Photo upload failed. Select it again to retry.",
        true,
      );
      return false;
    }
    return true;
  }

  function handleNormalGenerate(): void {
    if (!canGenerateFromPhoto()) return;
    Object.values(MODE_BUTTONS).forEach((btn) => btn.classList.remove("agent-recommended"));
    resultAspectRatio = "1:1";
    const themeHint = `Apply this visual style distinctly: ${currentTheme.styleHint}`;
    void callGenerate({
      apiKey,
      prompt: buildDoodlePrompt(themeHint),
      imageUrl: assetUrl,
      mode: "edit",
      aspectRatio: "1:1",
    });
  }

  function handleGenerate(): void {
    if (!canGenerateFromPhoto()) return;
    Object.values(MODE_BUTTONS).forEach((btn) => btn.classList.remove("agent-recommended"));
    resultAspectRatio = "3:2";
    const collagePrompt = buildCollagePrompt();
    void callGenerate({
      apiKey,
      prompt: collagePrompt,
      imageUrl: assetUrl,
      mode: "edit",
      aspectRatio: "3:2",
    });
  }

  function handleFullBodyGenerate(): void {
    if (!canGenerateFromPhoto()) return;
    Object.values(MODE_BUTTONS).forEach((btn) => btn.classList.remove("agent-recommended"));
    resultAspectRatio = "3:2";
    const collagePrompt = buildFullBodyCollagePrompt();
    void callGenerate({
      apiKey,
      prompt: collagePrompt,
      imageUrl: assetUrl,
      mode: "edit",
      aspectRatio: "3:2",
    });
  }

  function handleSurprise(): void {
    if (!hasKey()) {
      openSettings();
      setStatus("Enter your PicX API key to generate.", true);
      return;
    }
    resultAspectRatio = "1:1";
    const characterDesc = pick(SURPRISE_PROMPTS);
    const themeHint = `Apply this visual style distinctly: ${currentTheme.styleHint}`;
    const fullPrompt = `Create a naive doodle fashion-chibi avatar: ${characterDesc}\n\nStyle: Bold graphic hair shapes, rough marker or dry-brush edges, restrained watercolor-like color, clean white or warm-white background, flat and expressive, fashion-forward. No photorealism, no 3D, no heavy shading, no text, no watermarks. Deliberately naive brushwork with playful asymmetry.\n\n${themeHint}`;
    void callGenerate({ apiKey, prompt: fullPrompt, mode: "generate" });
  }

  /* ---- Agent mode recommendation (experimental, local dev only) ----
     Calls POST /api/agent, which runs a Mastra agent to recommend which
     generation mode fits the user's free-text request. Only works with
     `pnpm dev` today — see README.md for the Cloudflare build limitation. */
  const MODE_BUTTONS: Record<string, HTMLButtonElement> = {
    normal: normalBtn,
    collage: generateBtn,
    "full-body": fullBodyBtn,
  };

  function toggleAgentAsk(): void {
    agentAskBody.hidden = !agentAskBody.hidden;
    if (!agentAskBody.hidden) agentAskInput.focus();
  }

  function highlightRecommendedButton(mode: string): void {
    Object.values(MODE_BUTTONS).forEach((btn) => btn.classList.remove("agent-recommended"));
    const target = MODE_BUTTONS[mode];
    if (target) {
      target.classList.add("agent-recommended");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function handleAgentAsk(): Promise<void> {
    const message = agentAskInput.value.trim();
    if (!message) {
      agentAskStatus.textContent = "Describe what you want first.";
      agentAskStatus.classList.add("err");
      return;
    }
    agentAskSubmit.disabled = true;
    agentAskStatus.classList.remove("err");
    agentAskStatus.textContent = "Asking the assistant...";
    agentAskAnswer.hidden = true;
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        mode?: string;
        reason?: string;
        error?: string;
      };
      if (!res.ok || !data.mode) {
        throw new Error(data.error || `Assistant request failed: ${res.status}`);
      }
      agentAskStatus.textContent = "";
      agentAskAnswer.hidden = false;
      agentAskAnswer.textContent = data.reason || "";
      highlightRecommendedButton(data.mode);
    } catch (err) {
      agentAskStatus.classList.add("err");
      agentAskStatus.textContent =
        err instanceof Error ? err.message : "Assistant request failed";
    } finally {
      agentAskSubmit.disabled = false;
    }
  }

  /* ---- Result rendering ---- */
  function renderResult(): void {
    resultStage.classList.toggle("square-result", resultAspectRatio === "1:1");
    resultStage.innerHTML = "";
    if (resultImageUrl) {
      const img = document.createElement("img");
      img.src = resultImageUrl;
      img.alt = "Your AI doodle artwork";
      resultStage.appendChild(img);
      addToMoodboard(resultImageUrl);
    } else if (resultSVG) {
      resultStage.innerHTML = resultSVG;
    }
    showResultView();
  }

  function handleRetry(): void {
    resultSVG = null;
    resultImageUrl = null;
    resultStage.innerHTML = "";
    uploadProgress = "idle";
    clearPhoto();
    showUploadView();
  }

  async function handleDownload(): Promise<void> {
    if (resultImageUrl) {
      // The PicX CDN does not currently send CORS headers for this response,
      // so a same-origin fetch() can be blocked. Try fetch() first (gives a
      // real local download); if the browser blocks it, fall back to a plain
      // anchor download, which browsers still save locally for same-tab
      // navigations to an image URL with a `download` attribute when the
      // server allows it, and otherwise opens the image so the user can
      // save it manually.
      try {
        const response = await fetch(resultImageUrl, { mode: "cors" });
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = "doodlebooth-avatar.png";
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        const link = document.createElement("a");
        link.download = "doodlebooth-avatar.png";
        link.href = resultImageUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setStatus("Downloading directly from the image (opens in a new tab if your browser blocks a same-tab save).");
      }
      return;
    }
    if (resultSVG) {
      const img = new Image();
      const svgBlob = new Blob([resultSVG], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, 480, 480);
        URL.revokeObjectURL(url);
        const link = document.createElement("a");
        link.download = "doodlebooth-avatar.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
      };
      img.src = url;
    }
  }

  /* ---- Moodboard (localStorage only; read/write happens only on user action) ---- */
  const MOODBOARD_KEY = "doodlebooth_moodboard";
  const MOODBOARD_LIMIT = 24;

  interface MoodboardItem {
    id: string;
    url: string;
    createdAt: number;
  }

  function loadMoodboard(): MoodboardItem[] {
    try {
      const raw = localStorage.getItem(MOODBOARD_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is MoodboardItem =>
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string" &&
          typeof item.url === "string" &&
          typeof item.createdAt === "number",
      );
    } catch {
      return [];
    }
  }

  function saveMoodboard(items: MoodboardItem[]): void {
    try {
      localStorage.setItem(MOODBOARD_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable (private mode, quota) — moodboard stays session-only */
    }
  }

  function addToMoodboard(url: string): void {
    const items = loadMoodboard();
    items.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url, createdAt: Date.now() });
    saveMoodboard(items.slice(0, MOODBOARD_LIMIT));
    renderMoodboard();
  }

  function removeFromMoodboard(id: string): void {
    const items = loadMoodboard().filter((item) => item.id !== id);
    saveMoodboard(items);
    renderMoodboard();
  }

  function renderMoodboard(): void {
    const items = loadMoodboard();
    moodboardSection.hidden = items.length === 0;
    moodboardGrid.innerHTML = "";

    items.forEach((item) => {
      const cell = document.createElement("div");
      cell.className = "moodboard-cell";

      const img = document.createElement("img");
      img.src = item.url;
      img.alt = "Saved doodle avatar";
      img.loading = "lazy";
      cell.appendChild(img);

      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-label", "View full doodle");
      cell.addEventListener("click", () => openLightbox(item.url));
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLightbox(item.url);
        }
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "moodboard-remove";
      removeBtn.setAttribute("aria-label", "Remove from moodboard");
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFromMoodboard(item.id);
      });
      cell.appendChild(removeBtn);

      moodboardGrid.appendChild(cell);
    });
  }

  /* ---- Share ---- */
  function getShareUrl(): string {
    return resultImageUrl || window.location.href;
  }

  function shareToWhatsapp(): void {
    const url = getShareUrl();
    const text = encodeURIComponent(`Check out my DoodleBooth avatar! ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  function shareToX(): void {
    const url = getShareUrl();
    const text = encodeURIComponent("I turned my photo into a doodle avatar with DoodleBooth ✏️");
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function shareCopyLink(): Promise<void> {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API unavailable (older browser, non-secure context) — fall
      // back to a hidden textarea copy so the action still works.
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        /* no-op: nothing more we can do without clipboard access */
      }
      textarea.remove();
    }
    shareCopied.hidden = false;
    window.setTimeout(() => {
      shareCopied.hidden = true;
    }, 2000);
  }

  /* ---- Lightbox: full-screen viewer for the result and moodboard tiles ---- */
  let lightboxItems: string[] = [];
  let lightboxIndex = 0;

  function updateLightboxNav(): void {
    const multiple = lightboxItems.length > 1;
    lightboxPrev.hidden = !multiple;
    lightboxNext.hidden = !multiple;
    lightboxCounter.hidden = !multiple;
    if (multiple) {
      lightboxCounter.textContent = `${lightboxIndex + 1} / ${lightboxItems.length}`;
    }
  }

  function showLightboxAt(index: number): void {
    if (lightboxItems.length === 0) return;
    lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
    lightboxImg.src = lightboxItems[lightboxIndex];
    updateLightboxNav();
  }

  function openLightbox(url: string): void {
    // Navigable set is the moodboard, with the just-viewed image first if it
    // is not already saved there (e.g. viewing the live result before it is
    // added, or an SVG surprise result that never touches the moodboard).
    const saved = loadMoodboard().map((item) => item.url);
    lightboxItems = saved.includes(url) ? saved : [url, ...saved];
    const startIndex = lightboxItems.indexOf(url);
    lightboxBackdrop.classList.add("open");
    document.body.classList.add("lightbox-lock");
    showLightboxAt(startIndex === -1 ? 0 : startIndex);
    lightboxClose.focus();
  }

  function closeLightbox(): void {
    lightboxBackdrop.classList.remove("open");
    document.body.classList.remove("lightbox-lock");
    lightboxImg.removeAttribute("src");
  }

  function openResultLightbox(): void {
    if (resultImageUrl) openLightbox(resultImageUrl);
  }

  /* ---- Camera capture: live viewfinder feeding the existing upload path ---- */
  let cameraStream: MediaStream | null = null;
  let cameraFacing: "user" | "environment" = "user";
  let cameraHasMultipleDevices = false;

  function stopCameraStream(): void {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    cameraVideo.srcObject = null;
  }

  async function startCameraStream(): Promise<void> {
    stopCameraStream();
    cameraError.hidden = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacing },
        audio: false,
      });
      cameraStream = stream;
      cameraVideo.srcObject = stream;
      cameraVideo.dataset.facing = cameraFacing;
      await cameraVideo.play().catch(() => {
        /* autoplay can reject before the dialog is visible; ignored */
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera permission in your browser to use this."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "No camera was found on this device."
            : "Could not start the camera. You can still upload a photo instead.";
      cameraError.textContent = message;
      cameraError.hidden = false;
    }
  }

  async function detectMultipleCameras(): Promise<void> {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameraHasMultipleDevices = devices.filter((d) => d.kind === "videoinput").length > 1;
      cameraSwitch.hidden = !cameraHasMultipleDevices;
    } catch {
      cameraHasMultipleDevices = false;
    }
  }

  function supportsCameraCapture(): boolean {
    return Boolean(navigator.mediaDevices?.getUserMedia);
  }

  async function openCamera(): Promise<void> {
    if (!supportsCameraCapture()) {
      // Browser has no MediaDevices API (older Safari, some in-app webviews):
      // fall back to the OS camera app via a captured file input.
      cameraFallbackInput.click();
      return;
    }
    cameraBackdrop.classList.add("open");
    document.body.classList.add("lightbox-lock");
    await detectMultipleCameras();
    await startCameraStream();
  }

  function closeCamera(): void {
    cameraBackdrop.classList.remove("open");
    document.body.classList.remove("lightbox-lock");
    stopCameraStream();
  }

  function switchCamera(): void {
    cameraFacing = cameraFacing === "user" ? "environment" : "user";
    void startCameraStream();
  }

  function capturePhoto(): void {
    const { videoWidth, videoHeight } = cameraVideo;
    if (!videoWidth || !videoHeight) return;

    cameraCanvas.width = videoWidth;
    cameraCanvas.height = videoHeight;
    const ctx = cameraCanvas.getContext("2d");
    if (!ctx) return;

    // Mirror the preview back to natural orientation only for the front
    // camera, matching what the user saw in the viewfinder.
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

  /* ---- Theme picker ---- */
  function selectTheme(theme: Theme): void {
    currentTheme = theme;
    themesWrap.querySelectorAll<HTMLButtonElement>(".theme-btn").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeId === theme.id));
    });
  }

  /* ---- Splash (stroke-draw + fade), reduced-motion aware ---- */
  function runSplash(): void {
    if (!splash) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = reduceMotion ? 180 : 900;
    const dismiss = (): void => {
      if (!splash.isConnected) return;
      splash.classList.add("hide");
      window.setTimeout(() => splash.remove(), 500);
    };

    // Schedule dismissal before drawing anything so a browser SVG quirk cannot
    // leave the full-screen splash over the usable app.
    window.setTimeout(dismiss, wait + 450);
    window.setTimeout(dismiss, 2400);

    if (!reduceMotion) {
      try {
        ["p1", "p2", "p3", "p4", "p5"].forEach((id, i) => {
          const node = document.getElementById(id) as unknown as SVGGeometryElement | null;
          if (!node) return;
          const len = node.getTotalLength?.() || 200;
          node.style.strokeDasharray = String(len);
          node.style.strokeDashoffset = String(len);
          node.style.transition = `stroke-dashoffset .5s ease ${i * 140}ms`;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              node.style.strokeDashoffset = "0";
            });
          });
        });
      } catch {
        dismiss();
      }
    }
  }

  /* ---- Wire events ---- */
  themesWrap.querySelectorAll<HTMLButtonElement>(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = THEMES.find((t) => t.id === btn.dataset.themeId);
      if (theme) selectTheme(theme);
    });
  });

  // The label's native `for` behavior opens the picker; keyboard handling below
  // preserves Enter/Space support for the custom button role.
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  });
  dropzone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  });
  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  });

  cameraFallbackInput.addEventListener("change", () => {
    const file = cameraFallbackInput.files?.[0];
    if (file) handleFile(file);
    cameraFallbackInput.value = "";
  });

  cameraOpenBtn.addEventListener("click", () => void openCamera());
  cameraClose.addEventListener("click", closeCamera);
  cameraShutter.addEventListener("click", capturePhoto);
  cameraSwitch.addEventListener("click", switchCamera);
  cameraBackdrop.addEventListener("click", (e) => {
    if (e.target === cameraBackdrop) closeCamera();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cameraBackdrop.classList.contains("open")) closeCamera();
  });
  window.addEventListener("beforeunload", stopCameraStream);

  changeBtn.addEventListener("click", clearPhoto);
  agentAskToggle.addEventListener("click", toggleAgentAsk);
  agentAskSubmit.addEventListener("click", () => void handleAgentAsk());
  normalBtn.addEventListener("click", handleNormalGenerate);
  generateBtn.addEventListener("click", handleGenerate);
  fullBodyBtn.addEventListener("click", handleFullBodyGenerate);
  surpriseBtn.addEventListener("click", handleSurprise);
  downloadBtn.addEventListener("click", handleDownload);
  retryBtn.addEventListener("click", handleRetry);
  shareWhatsappBtn.addEventListener("click", shareToWhatsapp);
  shareXBtn.addEventListener("click", shareToX);
  shareCopyBtn.addEventListener("click", () => void shareCopyLink());

  resultStage.addEventListener("click", openResultLightbox);
  resultStage.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openResultLightbox();
    }
  });

  lightboxClose.addEventListener("click", closeLightbox);
  lightboxPrev.addEventListener("click", () => showLightboxAt(lightboxIndex - 1));
  lightboxNext.addEventListener("click", () => showLightboxAt(lightboxIndex + 1));
  lightboxBackdrop.addEventListener("click", (e) => {
    if (e.target === lightboxBackdrop) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (!lightboxBackdrop.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") showLightboxAt(lightboxIndex - 1);
    else if (e.key === "ArrowRight") showLightboxAt(lightboxIndex + 1);
  });

  settingsBtn.addEventListener("click", openSettings);
  keyHintBtn.addEventListener("click", openSettings);
  modalCloseBtn.addEventListener("click", closeSettings);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalBackdrop.classList.contains("open")) closeSettings();
  });

  apiKeyInput.addEventListener("input", () => updateApiKey(apiKeyInput.value));

  window.addEventListener("beforeunload", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });

  /* ---- Initial paint ---- */
  apiKeyInput.value = apiKey;
  keySaved.hidden = !hasKey();
  selectTheme(currentTheme);
  syncKeyHint();
  syncButtons();
  renderMoodboard();
  runSplash();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDoodle);
} else {
  initDoodle();
}
