/* The toolbar shown when a single animation is selected on the board.
 *
 * WHY THIS EXISTS. tldraw 5.3.2 already ships a `VideoToolbar` slot and wires
 * `DefaultVideoToolbar` into it, so a selected clip does get a toolbar — it just
 * offers Replace media / Download / Alt text and NO way to hear the animation,
 * because the vendor renders `muted` as a literal attribute. Every clip MiniMax
 * H3 Max produces carries audio, so the default toolbar is one button short of
 * the thing a user most wants from an animation.
 *
 * HOW IT COMPOSES. `DefaultVideoToolbar` takes children and, when given any,
 * renders them INSTEAD of its default content (`children ? children : ...`) —
 * verified in the vendor source, not assumed. So passing children is all-or-
 * nothing: we cannot append one button. We deliberately do not re-render the
 * vendor's `DefaultVideoToolbarContent` either, because its Alt text button
 * needs the `onEditAltTextStart` callback owned by a private inner component we
 * cannot reach, so wiring it here would ship a button that visibly does nothing.
 *
 * WHAT WE OFFER INSTEAD, and the trade. Sound, Full screen, Download — the three
 * things worth doing with a finished animation in a consumer product. This drops
 * the vendor's "Replace media" (swapping a generated animation for a local file
 * is not a doodle-app verb) and "Alt text" (the agent already sets altText, and
 * it is the one field the canvas digest reads back). Both remain reachable
 * through tldraw's context menu; neither is lost outright.
 *
 * We keep the vendor's OUTER shell (`DefaultVideoToolbar`) rather than building a
 * floating panel, so positioning, the selection-bounds follow, the locked-shape
 * and wrong-tool guards, and the toolbar's a11y label all stay the vendor's
 * problem and keep matching the image toolbar exactly.
 */
import { useCallback, useEffect, useState } from "react";
import {
  DefaultVideoToolbar,
  TldrawUiToolbarButton,
  useEditor,
  useValue,
  type TLVideoShape,
} from "tldraw";

import { isShapeAudible, toggleExclusiveAudio } from "../../../lib/canvas/video-audio";
import { openLightbox } from "../../../scripts/app/lightbox";

/** 15px inline SVGs: tldraw's icon set has no volume/mute/expand glyph (checked
 *  against its own icon-types list), and naming a non-existent icon renders an
 *  empty button rather than failing loudly. Inline also means no dependency on a
 *  vendor icon-name contract that a minor release could rename. */
function SoundOnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9.5h3L11 6v12l-4-3.5H4v-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9.5h3L11 6v12l-4-3.5H4v-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M15.5 10l5 4M20.5 10l-5 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Save the clip.
 *
 * Deliberately a local copy rather than importing `downloadVideo` from the chat
 * renderer: that module pulls in message rendering, suggestions and the skill
 * catalogue, and importing it here would drag all of that into the ~1MB canvas
 * island's chunk to reuse a dozen lines. The blob path gives a real filename;
 * the fallback covers a cross-origin response that blocks the fetch.
 */
async function downloadClip(url: string): Promise<void> {
  const filename = "doodleai-animation.mp4";
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("download failed");
    const objUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.download = filename;
    link.href = objUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    const link = document.createElement("a");
    link.download = filename;
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

function CanvasVideoToolbarContent() {
  const editor = useEditor();

  /* Resolve the selection here rather than taking it as a prop: the vendor shell
     passes nothing to its children, and re-deriving it is reactive and cheap. */
  const shapeId = useValue(
    "selected video shape",
    () => {
      const only = editor.getOnlySelectedShape();
      return only && only.type === "video" ? only.id : null;
    },
    [editor],
  );

  /* The asset URL, which is both the lightbox source and the fallback way to
     identify this shape's <video> if tldraw ever renames its per-shape class. */
  const src = useValue(
    "selected video src",
    () => {
      if (!shapeId) return null;
      const shape = editor.getShape<TLVideoShape>(shapeId);
      if (!shape?.props.assetId) return null;
      const asset = editor.getAsset(shape.props.assetId);
      return asset && asset.type === "video" ? (asset.props.src ?? null) : null;
    },
    [editor, shapeId],
  );

  /* Audio state is owned by the ELEMENT, not by React or the shape record, so it
     is read back off the DOM whenever the selection changes. Without this,
     selecting an already-unmuted clip would show a "muted" icon and the first
     click would silence it while appearing to switch it on. */
  const [audible, setAudible] = useState(false);
  useEffect(() => {
    if (!shapeId) return;
    setAudible(isShapeAudible(editor.getContainer(), shapeId, src ?? undefined));
  }, [editor, shapeId, src]);

  const onToggleSound = useCallback(() => {
    if (!shapeId) return;
    // Render what actually happened, not what was asked for: if the element
    // could not be reached the helper reports still-silent and the icon stays put.
    setAudible(toggleExclusiveAudio(editor.getContainer(), shapeId, src ?? undefined));
  }, [editor, shapeId, src]);

  const onOpen = useCallback(() => {
    if (!src) return;
    // Full screen is also the honest answer to "I want to hear this properly":
    // the lightbox plays unmuted with real controls.
    openLightbox([{ url: src, isVideo: true }], src);
  }, [src]);

  const onDownload = useCallback(() => {
    if (src) void downloadClip(src);
  }, [src]);

  if (!shapeId) return null;

  return (
    <>
      <TldrawUiToolbarButton
        type="icon"
        title={audible ? "Mute" : "Play sound"}
        isActive={audible}
        onClick={onToggleSound}
        data-testid="tool.video-sound"
      >
        {audible ? <SoundOnIcon /> : <SoundOffIcon />}
      </TldrawUiToolbarButton>

      <TldrawUiToolbarButton
        type="icon"
        title="Full screen"
        onClick={onOpen}
        data-testid="tool.video-open"
      >
        <ExpandIcon />
      </TldrawUiToolbarButton>

      <TldrawUiToolbarButton
        type="icon"
        title="Download"
        onClick={onDownload}
        data-testid="tool.video-download"
      >
        <DownloadIcon />
      </TldrawUiToolbarButton>
    </>
  );
}

/**
 * Drop-in for the `VideoToolbar` component slot.
 *
 * The vendor shell still decides WHETHER to show (single video selected, not
 * locked, right tool state) and WHERE; we only decide what is inside it.
 */
export function CanvasVideoToolbar() {
  return (
    <DefaultVideoToolbar>
      <CanvasVideoToolbarContent />
    </DefaultVideoToolbar>
  );
}
