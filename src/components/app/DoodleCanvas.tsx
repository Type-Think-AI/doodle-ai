/* The infinite canvas half of /c/[id] — replaces the old fixed grid of
 * thumbnails ("whiteboard mode"), which only ever showed an image index and
 * gave the user nothing to do with the results.
 *
 * This is the ONLY React in the app. It is mounted with client:only="react"
 * so tldraw never enters the SSR/Worker bundle (tldraw is ~1MB and browser-
 * only; SSR'ing it would break the Cloudflare build the same way @mastra's
 * Node-only deps do).
 *
 * Contract with the rest of the app — deliberately event-based, not a shared
 * module, so the vanilla chat.ts never has to import React:
 *
 *   window.dispatchEvent(new CustomEvent("doodleai:canvas-add", {
 *     detail: { urls: string[], label?: string }
 *   }))
 *
 * chat.ts fires that as generations land; this island places each URL as a
 * real tldraw image shape. Position is auto-flowed left-to-right in rows so a
 * multi-image batch reads as a set rather than a stack.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Tldraw,
  type Editor,
  type TLAssetId,
  type TLComponents,
  type TLShapeId,
  AssetRecordType,
  createShapeId,
  getHashForString,
} from "tldraw";
import "tldraw/tldraw.css";

/* Chrome we deliberately remove from tldraw's default UI.
 *
 * Defined at module scope because tldraw requires this object to be stable —
 * a fresh object each render remounts the whole UI layer.
 *
 * DebugPanel/DebugMenu are dev-only affordances (the stray perf slider that
 * showed up over the board); Minimap, SharePanel and PeopleMenu are
 * multiplayer/collab surfaces this app has no backing for; PageMenu manages
 * multiple pages, but each thread is exactly one board (see persistenceKey),
 * so its "Page 1" control was dead weight in the top-left.
 *
 * StylePanel is removed to match the reference: for an image selection it
 * collapses to a lone opacity slider that floated in the top-right corner
 * looking like a rendering fault. Drawing still works — it uses tldraw's
 * default stroke styles rather than an exposed picker.
 *
 * Kept: Toolbar (select/pan/draw/shapes), ZoomMenu, ContextMenu, ActionsMenu
 * — the bottom-center tools and bottom-left zoom the reference design shows. */
const CANVAS_COMPONENTS: TLComponents = {
  DebugPanel: null,
  DebugMenu: null,
  Minimap: null,
  SharePanel: null,
  PeopleMenu: null,
  PageMenu: null,
  StylePanel: null,
};

/** Payload chat.ts sends when a generation (or upload) produces images. */
interface CanvasAddDetail {
  urls?: string[];
  label?: string;
}

interface DoodleCanvasProps {
  /** Thread id — scopes tldraw's local persistence so each chat keeps its own board. */
  threadId: string;
  /** Images already in the thread on first paint (page reload / revisit). */
  initialUrls?: string[];
}

/* Queue chat.ts writes to before this island exists.
 *
 * Load order matters here: chat.ts is a plain module script and runs almost
 * immediately, while this island is client:only and has to fetch ~1MB of
 * tldraw first. So chat.ts reliably dispatches "doodleai:canvas-add" BEFORE
 * there is any listener, and every one of those images used to be dropped —
 * which is why a thread with existing doodles opened to an empty canvas.
 * chat.ts therefore also appends to this window-level queue, and the island
 * drains it on mount. Declared on window (not a shared module) so the vanilla
 * controller never has to import anything from the React side.
 */
declare global {
  interface Window {
    __doodleCanvasQueue?: string[];
  }
}

/* Layout of newly-placed images. tldraw has no auto-layout, so we flow shapes
   ourselves: fixed-width cells, wrapping after COLUMNS, which keeps a batch of
   4 variants visually grouped instead of piled on one spot. */
const CELL_W = 320;
const CELL_H = 320;
const GAP = 28;
const COLUMNS = 3;

/** Natural size probe so portrait/landscape results aren't squashed into a square. */
function probeImageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    // Resolve to the default cell on error rather than rejecting — a broken
    // URL should still land on the canvas as a visible placeholder, not
    // silently vanish and leave the user wondering where their doodle went.
    img.onerror = () => resolve({ w: CELL_W, h: CELL_H });
    img.onload = () => resolve({ w: img.naturalWidth || CELL_W, h: img.naturalHeight || CELL_H });
    img.src = url;
  });
}

/** Fit natural dimensions into the cell box, preserving aspect ratio. */
function fitToCell(natural: { w: number; h: number }): { w: number; h: number } {
  const scale = Math.min(CELL_W / natural.w, CELL_H / natural.h, 1);
  return {
    w: Math.max(80, Math.round(natural.w * scale)),
    h: Math.max(80, Math.round(natural.h * scale)),
  };
}

/* Drop the "your doodles will appear here" placeholder that /c/[id] renders
   behind the board. chat.ts also hides it when it pushes, but that is not
   sufficient on its own: on a reload the images come back from tldraw's own
   persistence rather than through a push, so the board owns the final say on
   whether it has content. Queried by id instead of held as a prop because the
   element belongs to the Astro page, not this island. */
function hideEmptyHint(): void {
  const hint = document.getElementById("canvasEmptyHint");
  if (hint) hint.hidden = true;
}

export default function DoodleCanvas({ threadId, initialUrls = [] }: DoodleCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  /* URLs already placed, so a re-render or a duplicate NDJSON event doesn't
     stack a second copy of the same doodle on top of the first. */
  const placedRef = useRef<Set<string>>(new Set());
  /* URLs that arrived before tldraw handed us an editor. Held here and flushed
     in onMount — dropping them was the bug that left the canvas blank. */
  const pendingRef = useRef<string[]>([]);
  /* Next free slot index, tracked outside React state — placement is an
     imperative canvas side effect, and putting it in state would re-render
     the whole canvas on every image. */
  const slotRef = useRef(0);

  /* Gate on the canvas actually being visible before mounting <Tldraw>.
   *
   * This is load-bearing, not an optimization. On /c/[id] the canvas lives in
   * a panel that is `display: none` until opened, and tldraw mounted inside a
   * zero-size hidden container never finishes initializing — it renders its
   * container, sits in its loading state, and never calls onMount, so no image
   * ever reaches the board. That was the "canvas shows nothing" bug.
   *
   * Two independent triggers, because neither alone covers every case:
   *   - an explicit "doodleai:canvas-open" event from chat.ts, which is the
   *     deterministic path on /c/[id] (ResizeObserver is unreliable across a
   *     display:none -> shown transition, so it is a fallback, not the gate);
   *   - a non-zero measurement, which covers a canvas rendered visible from
   *     the start with no toggle involved. */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = rootRef.current;

    const checkSize = () => {
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setReady(true);
    };

    // Already visible (standalone mount, no toggle)?
    checkSize();

    // Explicit signal — the reliable path when a hidden panel is revealed.
    const onOpen = () => setReady(true);
    window.addEventListener("doodleai:canvas-open", onOpen);

    // Secondary: catches reveals that arrive without the event.
    const observer = el ? new ResizeObserver(checkSize) : null;
    if (el && observer) observer.observe(el);

    return () => {
      window.removeEventListener("doodleai:canvas-open", onOpen);
      observer?.disconnect();
    };
  }, []);

  const placeUrls = useCallback(async (urls: string[]) => {
    const editor = editorRef.current;
    if (!editor) {
      // Not ready yet — hold, don't drop. onMount flushes this.
      pendingRef.current.push(...urls);
      return;
    }

    /* Dedupe against what is already on the board AND within this batch.
       Both halves matter: onMount concatenates the window queue with the
       pre-mount buffer, and chat.ts writes the same URL to both, so a single
       generation arrives here twice in one array. Filtering only against
       placedRef let those through (placedRef is still empty at that point)
       and every doodle was placed on the board twice. */
    const seen = new Set<string>();
    const fresh = urls.filter((url) => {
      if (!url || placedRef.current.has(url) || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
    if (!fresh.length) return;
    fresh.forEach((url) => placedRef.current.add(url));

    const sizes = await Promise.all(fresh.map(probeImageSize));
    const createdIds: TLShapeId[] = [];

    fresh.forEach((url, i) => {
      const slot = slotRef.current++;
      const col = slot % COLUMNS;
      const row = Math.floor(slot / COLUMNS);
      const { w, h } = fitToCell(sizes[i]!);

      /* tldraw needs an asset record before an image shape can reference it.
         The id is derived from the URL hash so the same image reuses one
         asset instead of duplicating it in the store on every placement. */
      const assetId: TLAssetId = AssetRecordType.createId(getHashForString(url));

      if (!editor.getAsset(assetId)) {
        editor.createAssets([
          {
            id: assetId,
            type: "image",
            typeName: "asset",
            meta: {},
            props: {
              name: "doodle",
              src: url,
              w,
              h,
              mimeType: "image/png",
              isAnimated: false,
            },
          },
        ]);
      }

      const shapeId = createShapeId();
      createdIds.push(shapeId);
      editor.createShape({
        id: shapeId,
        type: "image",
        // Centre each image inside its cell so mixed aspect ratios still
        // line up on a tidy grid rather than hugging the top-left corner.
        x: col * (CELL_W + GAP) + (CELL_W - w) / 2,
        y: row * (CELL_H + GAP) + (CELL_H - h) / 2,
        props: { assetId, w, h },
      });
    });

    if (createdIds.length) {
      hideEmptyHint();
      editor.select(...createdIds);
      // Frame the new batch, but keep surrounding context visible rather than
      // filling the viewport with a single result.
      editor.zoomToSelection({ animation: { duration: 320 } });
    }
  }, []);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      /* Everything below is best-effort setup around tldraw's API. It is
         wrapped because a silent throw in here is catastrophic and invisible:
         the editor mounts fine, the canvas looks alive, and images simply
         never appear. Failing loudly to the console — and still draining the
         backlog in `finally` — turns that into a debuggable error. */
      try {
        // Dark canvas to match the app shell — the app has no light mode on
        // this surface, so this is set once rather than synced to a theme toggle.
        editor.user.updateUserPreferences({ colorScheme: "dark" });

        /* Dotted grid on by default. tldraw renders its grid as dots
           (.tl-grid-dot), which is exactly the reference look, but grid mode
           is off unless asked for — so a fresh board came up as flat black
           with no sense of an infinite plane to pan around. */
        editor.updateInstanceState({ isGridMode: true });

        /* Re-placing images that tldraw already restored from local persistence
           would duplicate them, so seed the dedupe set from whatever the store
           came back with and only place URLs that are genuinely missing. */
        const existing = new Set<string>();
        for (const asset of editor.getAssets()) {
          if (asset.type === "image" && asset.props.src) existing.add(asset.props.src);
        }
        placedRef.current = existing;
        // Start new work below anything restored, so it never lands on top.
        slotRef.current = existing.size;
        // Restored board already has content — drop the placeholder now rather
        // than waiting for a push that will never come on a reload.
        if (existing.size) hideEmptyHint();
      } catch (err) {
        console.error("[DoodleCanvas] mount setup failed", err);
      }

      /* Everything that tried to reach the canvas before this point, in
         arrival order: props, then whatever chat.ts queued pre-hydration,
         then anything an event delivered while tldraw was still booting. */
      const backlog = [
        ...initialUrls,
        ...(window.__doodleCanvasQueue ?? []),
        ...pendingRef.current,
      ];
      pendingRef.current = [];
      // Leave the queue in place but emptied — chat.ts keeps appending to it,
      // and placeUrls dedupes, so a later re-read is harmless either way.
      if (window.__doodleCanvasQueue) window.__doodleCanvasQueue.length = 0;

      if (backlog.length) void placeUrls(backlog);
    },
    [initialUrls, placeUrls],
  );

  useEffect(() => {
    const onAdd = (event: Event) => {
      const detail = (event as CustomEvent<CanvasAddDetail>).detail;
      if (detail?.urls?.length) void placeUrls(detail.urls);
    };
    window.addEventListener("doodleai:canvas-add", onAdd);
    return () => window.removeEventListener("doodleai:canvas-add", onAdd);
  }, [placeUrls]);

  return (
    /* Sizing lives HERE, not in the parent page's CSS. tldraw measures its
       container, so if this div ever resolves to height:0 the canvas mounts
       but paints nothing — which is exactly what happened when the sizing
       rule lived in [id].astro and the component was mounted anywhere else.
       Filling the nearest positioned ancestor makes it self-sufficient. */
    <div
      ref={rootRef}
      className="doodle-canvas-root"
      style={{ position: "absolute", inset: 0 }}
    >
      {ready && (
        <Tldraw
          // Per-thread key: each chat gets its own board, and it survives reload.
          persistenceKey={`doodleai-canvas-${threadId}`}
          licenseKey={import.meta.env.PUBLIC_TLDRAW_LICENSE_KEY}
          components={CANVAS_COMPONENTS}
          onMount={handleMount}
        />
      )}
    </div>
  );
}
