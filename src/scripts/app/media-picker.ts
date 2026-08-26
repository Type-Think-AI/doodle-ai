/**
 * Wires HTML5 drag-and-drop onto the composer box itself, so dropping an
 * image anywhere on it attaches the photo the same way picking it from the
 * file input or camera does — shared by the Home and Chat composers.
 *
 * Counts enter/leave events (rather than toggling on every dragenter/
 * dragleave) because the box has child elements: the browser fires a
 * dragleave when the pointer crosses from the box onto a child and a
 * dragenter when it re-enters the box, and naively toggling on each would
 * flicker the drop overlay off while still dragging over the box.
 */
export function initComposerDropZone(box: HTMLElement, onFiles: (files: FileList | File[]) => void): () => void {
  let depth = 0;

  const onDragEnter = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    depth += 1;
    box.dataset.dragOver = "true";
  };
  const onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
  };
  const onDragLeave = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) delete box.dataset.dragOver;
  };
  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    depth = 0;
    delete box.dataset.dragOver;
    const files = event.dataTransfer?.files;
    if (files && files.length) onFiles(files);
  };

  box.addEventListener("dragenter", onDragEnter);
  box.addEventListener("dragover", onDragOver);
  box.addEventListener("dragleave", onDragLeave);
  box.addEventListener("drop", onDrop);

  return () => {
    box.removeEventListener("dragenter", onDragEnter);
    box.removeEventListener("dragover", onDragOver);
    box.removeEventListener("dragleave", onDragLeave);
    box.removeEventListener("drop", onDrop);
  };
}

export interface MediaPickerOptions {
  trigger: HTMLButtonElement;
  cameraButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
  dialog: HTMLElement;
  video: HTMLVideoElement;
  preview: HTMLImageElement;
  canvas: HTMLCanvasElement;
  captureButton: HTMLButtonElement;
  retakeButton: HTMLButtonElement;
  useButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  status: HTMLElement;
  onFile: (file: File) => void;
}

/**
 * Shared plus-upload and live-camera interaction used by the Home and Chat
 * composers. Camera permission is requested only after the user explicitly
 * clicks the camera button.
 */
export function initMediaPicker(options: MediaPickerOptions): () => void {
  let stream: MediaStream | null = null;
  let capturedFile: File | null = null;
  let capturedPreviewUrl: string | null = null;
  let restoreFocus: HTMLElement | null = null;
  let previousBodyOverflow = "";

  const setDialogOpen = (open: boolean): void => {
    options.dialog.hidden = !open;
    options.dialog.setAttribute("aria-hidden", String(!open));
    if (open) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = previousBodyOverflow;
    }
  };

  const stopStream = (): void => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    options.video.srcObject = null;
  };

  const clearCapturedPreview = (): void => {
    if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
    capturedPreviewUrl = null;
    options.preview.removeAttribute("src");
    options.preview.hidden = true;
    options.video.hidden = false;
    options.captureButton.hidden = false;
    options.retakeButton.hidden = true;
    options.useButton.hidden = true;
  };

  const closeCamera = (): void => {
    stopStream();
    clearCapturedPreview();
    capturedFile = null;
    options.status.textContent = "";
    setDialogOpen(false);
    restoreFocus?.focus();
    restoreFocus = null;
  };

  const openCamera = async (): Promise<void> => {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialogOpen(true);
    options.status.textContent = "Requesting camera access…";
    options.captureButton.disabled = true;
    options.video.hidden = false;
    options.preview.hidden = true;

    if (!navigator.mediaDevices?.getUserMedia) {
      options.status.textContent = "Live camera is not available in this browser. Use Upload photo instead.";
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      options.video.srcObject = stream;
      await options.video.play();
      options.status.textContent = "Line up your photo, then tap Take photo.";
      options.captureButton.disabled = false;
      options.captureButton.focus();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      options.status.textContent =
        name === "NotAllowedError"
          ? "Camera permission was blocked. Allow access in your browser settings or use Upload photo."
          : name === "NotFoundError"
            ? "No camera was found. Use Upload photo instead."
            : "We could not open the camera. Use Upload photo instead.";
    }
  };

  const capture = (): void => {
    if (!options.video.videoWidth || !options.video.videoHeight) {
      options.status.textContent = "The camera is still starting. Try again in a moment.";
      return;
    }

    options.canvas.width = options.video.videoWidth;
    options.canvas.height = options.video.videoHeight;
    const context = options.canvas.getContext("2d");
    if (!context) {
      options.status.textContent = "Camera capture is not supported here. Use Upload photo instead.";
      return;
    }

    context.drawImage(options.video, 0, 0, options.canvas.width, options.canvas.height);
    options.canvas.toBlob((blob) => {
      if (!blob) {
        options.status.textContent = "We could not capture that photo. Try again.";
        return;
      }

      capturedFile = new File([blob], `doodleai-camera-${Date.now()}.jpg`, { type: "image/jpeg" });
      capturedPreviewUrl = URL.createObjectURL(blob);
      options.preview.src = capturedPreviewUrl;
      options.preview.hidden = false;
      options.video.hidden = true;
      options.captureButton.hidden = true;
      options.retakeButton.hidden = false;
      options.useButton.hidden = false;
      options.status.textContent = "Photo captured. Use it or retake it.";
      options.useButton.focus();
    }, "image/jpeg", 0.92);
  };

  const useCapturedPhoto = (): void => {
    if (!capturedFile) return;
    const file = capturedFile;
    closeCamera();
    options.onFile(file);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || options.dialog.hidden) return;
    event.preventDefault();
    closeCamera();
  };

  options.trigger.addEventListener("click", () => {
    options.fileInput.click();
  });
  options.cameraButton.addEventListener("click", () => {
    void openCamera();
  });
  options.captureButton.addEventListener("click", capture);
  options.retakeButton.addEventListener("click", () => {
    capturedFile = null;
    clearCapturedPreview();
    options.status.textContent = "Line up your photo, then tap Take photo.";
    options.captureButton.focus();
  });
  options.useButton.addEventListener("click", useCapturedPhoto);
  options.closeButton.addEventListener("click", closeCamera);
  options.cancelButton.addEventListener("click", closeCamera);
  options.dialog.addEventListener("click", (event) => {
    if (event.target === options.dialog) closeCamera();
  });
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("pagehide", closeCamera);

  return () => {
    closeCamera();
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("pagehide", closeCamera);
  };
}
