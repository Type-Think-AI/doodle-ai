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
 *     detail: { items: CanvasMediaInput[], label?: string }
 *   }))
 *
 * chat.ts fires that as generations land; this island places each item as a real
 * tldraw shape — an image shape for a still, a video shape for an animation.
 * The kind travels in the payload rather than being guessed from the URL,
 * because PicX serves generated media through extensionless signed URLs (see
 * src/lib/canvas/media.ts). Position is auto-flowed left-to-right in rows so a
 * multi-item batch reads as a set rather than a stack.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
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

import type { CanvasOp } from "../../lib/canvas/ops";
import {
  normalizeCanvasMedia,
  type CanvasMediaInput,
  type CanvasMediaItem,
} from "../../lib/canvas/media";
import { applyCanvasOps } from "./canvas/apply-ops";
import { CanvasVideoToolbar } from "./canvas/CanvasVideoToolbar";
import { publishDigest } from "./canvas/digest";
import { assignRef, autoRef } from "./canvas/refs";

/* Voice ("Talk") mode HUD. Rendered INSIDE this island — the app's single React
 * graph — rather than as its own client:only island or page <script>. That is
 * load-bearing: a second React client graph on this page makes @astrojs/cloudflare's
 * post-build asset-relocation step reference a shared client chunk as a worker
 * asset and fail with ENOENT. React.lazy keeps @cloudflare/voice/react in its own
 * async chunk so none of the voice JS (or its socket) loads until Talk mode opens. */
const VoiceHud = lazy(() => import("./voice/VoiceHud"));

/* Forward a voice-generated event onto the board. The HUD hands us the raw
   event the Voice DO sent; we route image/video/canvas onto the SAME window
   CustomEvents the typed chat uses (doodleai:canvas-add / :canvas-ops), which
   this island already listens for — so a spoken doodle lands exactly like a
   typed one. Kept as a thin dispatcher here to avoid a static import of the
   bridge's chat/canvas + media chain, which the Worker graph also touches. */
function handleVoiceCanvasEvent(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const ev = raw as { type?: string; url?: string; posterUrl?: string; ops?: CanvasOp[]; label?: string };
  if (ev.type === "image" && ev.url) {
    window.dispatchEvent(
      new CustomEvent("doodleai:canvas-add", { detail: { items: [{ url: ev.url, isVideo: false }] } }),
    );
  } else if (ev.type === "video" && ev.url) {
    window.dispatchEvent(
      new CustomEvent("doodleai:canvas-add", {
        detail: { items: [{ url: ev.url, isVideo: true, posterUrl: ev.posterUrl }] },
      }),
    );
  } else if (ev.type === "canvas" && ev.ops?.length) {
    window.dispatchEvent(new CustomEvent("doodleai:canvas-ops", { detail: { ops: ev.ops, label: ev.label } }));
  }
}

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
  /* Replaces tldraw's DefaultVideoToolbar, which offers Replace media / Download
     / Alt text but no way to HEAR the animation — the vendor renders `muted` as a
     literal attribute, and every clip we produce carries audio. Ours keeps the
     vendor's shell (so positioning and the locked/tool-state guards stay theirs)
     and swaps the contents for Sound / Full screen / Download. See
     src/components/app/canvas/CanvasVideoToolbar.tsx. */
  VideoToolbar: CanvasVideoToolbar,
};

/** Payload chat.ts sends when a generation (or upload) produces media.
 *  `items` is current; `urls` is the legacy stills-only array, still read so a
 *  cached older chat bundle can keep delivering doodles to a fresh island. */
interface CanvasAddDetail {
  items?: CanvasMediaInput[];
  urls?: string[];
  label?: string;
}

interface DoodleCanvasProps {
  /** Thread id — scopes tldraw's local persistence so each chat keeps its own board. */
  threadId: string;
  /** Media already in the thread on first paint (page reload / revisit).
   *  Accepts bare URL strings as stills for backward compatibility. */
  initialMedia?: CanvasMediaInput[];
  /**
   * tldraw licence key, resolved server-side from the Worker environment and
   * handed down as a prop. Deliberately NOT read from `import.meta.env` here:
   * that inlines it at build time, so the key only existed when the build ran on
   * a machine holding `.env` — see src/lib/tldraw-license.ts for the outage that
   * caused. Optional so the component still renders (unlicensed) if it is absent.
   */
  licenseKey?: string;
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

/* Layout of newly-placed images. tldraw has no auto-layout, so we flow shapes
   ourselves: fixed-width cells, wrapping after COLUMNS, which keeps a batch of
   4 variants visually grouped instead of piled on one spot. */
const CELL_W = 320;
const CELL_H = 320;
const GAP = 28;
const COLUMNS = 3;

/** Natural size probe so portrait/landscape results aren't squashed into a square. */
const mediaSizeCache = new Map<string, { w: number; h: number }>();

const FALLBACK_SIZE = { w: CELL_W, h: CELL_H };

/**
 * Measure a still.
 *
 * Resolves to the default cell on error rather than rejecting — a broken URL
 * should still land on the canvas as a visible placeholder, not silently vanish
 * and leave the user wondering where their doodle went.
 */
function probeImageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(FALLBACK_SIZE);
    img.onload = () => resolve({ w: img.naturalWidth || CELL_W, h: img.naturalHeight || CELL_H });
    img.src = url;
  });
}

/**
 * Measure an animation.
 *
 * This has to be a separate probe rather than reusing the image one, and that is
 * the whole reason clips used to lay out wrong. `new Image()` cannot decode an
 * mp4, so it fires `onerror`, the probe falls back to the square default cell,
 * and a 1344x768 landscape animation gets placed as a square. Reading
 * videoWidth/videoHeight off a metadata-only load is the only honest measurement.
 *
 * `preload="metadata"` fetches headers, not the clip — no wasted bandwidth. The
 * timeout exists because a URL that never resolves metadata would otherwise
 * leave the whole batch's `Promise.all` hanging forever, and one slow clip must
 * not stop the doodles beside it from being placed.
 */
function probeVideoSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const done = (size: { w: number; h: number }) => {
      if (settled) return;
      settled = true;
      video.removeAttribute("src");
      resolve(size);
    };
    const timer = window.setTimeout(() => done(FALLBACK_SIZE), 8_000);
    const finish = (size: { w: number; h: number }) => {
      window.clearTimeout(timer);
      done(size);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onerror = () => finish(FALLBACK_SIZE);
    video.onloadedmetadata = () =>
      finish({ w: video.videoWidth || CELL_W, h: video.videoHeight || CELL_H });
    video.src = url;
  });
}

/** Measure by kind, memoised. A URL is only ever one kind, so one cache serves both. */
async function probeMediaSize(item: CanvasMediaItem): Promise<{ w: number; h: number }> {
  const cached = mediaSizeCache.get(item.url);
  if (cached) return cached;
  const size = item.isVideo ? await probeVideoSize(item.url) : await probeImageSize(item.url);
  mediaSizeCache.set(item.url, size);
  return size;
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

export default function DoodleCanvas({ threadId, initialMedia = [], licenseKey }: DoodleCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  /* URLs already placed, so a re-render or a duplicate NDJSON event doesn't
     stack a second copy of the same doodle on top of the first. */
  const placedRef = useRef<Set<string>>(new Set());
  /* Media that arrived before tldraw handed us an editor. Held here and flushed
     in onMount — dropping it was the bug that left the canvas blank. */
  const pendingRef = useRef<CanvasMediaItem[]>([]);
  /* Ops batches that arrived before tldraw handed us an editor. Same pattern
     as pendingRef — hold and drain on mount so the first agent edit is never dropped. */
  const pendingOpsRef = useRef<CanvasOp[]>([]);
  /* Next free slot index, tracked outside React state — placement is an
     imperative canvas side effect, and putting it in state would re-render
     the whole canvas on every image. */
  const slotRef = useRef(0);
  const themeObserverRef = useRef<MutationObserver | null>(null);
  useEffect(() => () => {
    themeObserverRef.current?.disconnect();
    themeObserverRef.current = null;
  }, []);


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
  /* Voice mode: false until the user opens Talk mode (the mode toggle in
     c/[id].astro fires "doodleai:voice-open"). Gating the lazy VoiceHud on this
     means @cloudflare/voice/react and the voice socket load only on demand. */
  const [voiceOpen, setVoiceOpen] = useState(false);
  useEffect(() => {
    const onVoiceOpen = () => setVoiceOpen(true);
    window.addEventListener("doodleai:voice-open", onVoiceOpen);
    /* Backlog check, not just the event. This island is ~1MB (tldraw) and
       hydrates well after first paint, so a Talk click — or the ?voice=1
       deep-link, which fires during page parse — happens BEFORE this listener
       exists and the event is lost forever. That was the "I click Talk and
       nothing happens" bug. The opener also sets a window flag, so we catch the
       case where the intent arrived early. Same pattern as the canvas-add
       backlog queue above. */
    if ((window as unknown as { __doodleVoiceOpen?: boolean }).__doodleVoiceOpen) {
      setVoiceOpen(true);
    }
    return () => window.removeEventListener("doodleai:voice-open", onVoiceOpen);
  }, []);

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

  const placeMedia = useCallback(async (media: readonly CanvasMediaInput[]) => {
    const incoming = normalizeCanvasMedia(media);
    if (!incoming.length) return;

    const editor = editorRef.current;
    if (!editor) {
      // Not ready yet — hold, don't drop. onMount flushes this.
      pendingRef.current.push(...incoming);
      return;
    }

    /* Dedupe against what is already on the board AND within this batch.
       Both halves matter: onMount concatenates the window queue with the
       pre-mount buffer, and chat.ts writes the same URL to both, so a single
       generation arrives here twice in one array. Filtering only against
       placedRef let those through (placedRef is still empty at that point)
       and every doodle was placed on the board twice. */
    const seen = new Set<string>();
    const fresh = incoming.filter((item) => {
      if (placedRef.current.has(item.url) || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
    if (!fresh.length) return;
    fresh.forEach((item) => placedRef.current.add(item.url));

    const sizes = await Promise.all(fresh.map(probeMediaSize));
    const createdIds: TLShapeId[] = [];

    fresh.forEach((item, i) => {
      const slot = slotRef.current++;
      const col = slot % COLUMNS;
      const row = Math.floor(slot / COLUMNS);
      const { w, h } = fitToCell(sizes[i]!);
      const { url, isVideo } = item;

      /* tldraw needs an asset record before a shape can reference it. The id is
         derived from the URL hash so the same media reuses one asset instead of
         duplicating it in the store on every placement. */
      const assetId: TLAssetId = AssetRecordType.createId(getHashForString(url));

      if (!editor.getAsset(assetId)) {
        /* Two genuinely different asset types, not one with a flag. An mp4
           registered as an `image` asset renders through an <img>, which cannot
           decode it — the shape paints tldraw's broken-asset icon and the user
           reads that as their animation being lost. Both prop sets below are
           complete per @tldraw/tlschema 5.3.2 (TLImageAsset / TLVideoAsset);
           a missing required prop throws inside the store and kills the board. */
        editor.createAssets([
          isVideo
            ? {
                id: assetId,
                type: "video",
                typeName: "asset",
                meta: {},
                props: {
                  name: "doodle-animation",
                  src: url,
                  w,
                  h,
                  mimeType: "video/mp4",
                  isAnimated: true,
                },
              }
            : {
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

      /* Centre each item inside its cell so mixed aspect ratios still line up on
         a tidy grid rather than hugging the top-left corner. */
      const x = col * (CELL_W + GAP) + (CELL_W - w) / 2;
      const y = row * (CELL_H + GAP) + (CELL_H - h) / 2;
      const meta = { ref: autoRef(editor, isVideo ? "video" : "image"), author: "user" };

      /* Two separate createShape calls rather than one with a ternary `type`.
         createShape's parameter is a DISCRIMINATED UNION keyed on `type`, so a
         computed `type` widens to "video" | "image" and TypeScript can no longer
         pair it with the matching props shape — it rejects the call outright.
         Branching keeps each call individually well-typed, which is what makes
         the compiler check the props against the right shape at all. */
      if (isVideo) {
        /* Every prop below is required by videoShapeProps — a partial write
           throws inside tldraw's store. `autoplay` is deliberately true: the
           whole point of this product is that the doodle moves, and tldraw ANDs
           this with the user's prefers-reduced-motion setting at render time, so
           honouring that preference costs nothing here. `time`/`playing` are
           vestigial in 5.3.2 (tldraw's own comment says they are unused) but
           still required. `url` is the shape's own external-link field, which is
           unrelated to the asset src and stays empty. */
        editor.createShape({
          id: shapeId,
          type: "video",
          x,
          y,
          props: { assetId, w, h, time: 0, playing: true, autoplay: true, url: "", altText: "" },
          meta,
        });
      } else {
        editor.createShape({
          id: shapeId,
          type: "image",
          x,
          y,
          props: { assetId, w, h },
          meta,
        });
      }
    });

    if (createdIds.length) {
      hideEmptyHint();
      editor.select(...createdIds);
      // Frame the new batch, but keep surrounding context visible rather than
      // filling the viewport with a single result.
      editor.zoomToSelection({ animation: { duration: 320 } });
    }
  }, []);

  /** Apply agent canvas ops. Buffers if editor not ready, same as placeMedia. */
  const applyOps = useCallback((ops: CanvasOp[]) => {
    const editor = editorRef.current;
    if (!editor) {
      pendingOpsRef.current.push(...ops);
      return;
    }
    const { skipped } = applyCanvasOps(editor, ops);
    if (skipped.length > 0) {
      console.warn("[DoodleCanvas] ops skipped:", skipped);
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
        // Keep tldraw in lockstep with the app shell. The app can switch themes
        // without remounting this island, so this is also observed below.
        const syncCanvasTheme = () => {
          const isLight = document.documentElement.dataset.theme === "light";
          editor.user.updateUserPreferences({ colorScheme: isLight ? "light" : "dark" });
        };
        syncCanvasTheme();
        const themeObserver = new MutationObserver(syncCanvasTheme);
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        themeObserverRef.current = themeObserver;

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
          // Both kinds: a restored animation must seed the dedupe set too, or
          // the reload backfill places a second copy of it beside the first.
          if ((asset.type === "image" || asset.type === "video") && asset.props.src) {
            existing.add(asset.props.src);
          }
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
      const backlog: CanvasMediaInput[] = [
        ...initialMedia,
        ...(window.__doodleCanvasQueue ?? []),
        ...pendingRef.current,
      ];
      pendingRef.current = [];
      // Leave the queue in place but emptied — chat.ts keeps appending to it,
      // and placeMedia dedupes, so a later re-read is harmless either way.
      if (window.__doodleCanvasQueue) window.__doodleCanvasQueue.length = 0;

      if (backlog.length) void placeMedia(backlog);

      /* Drain any ops that arrived before the editor was ready — same pattern
         as the image backlog above. Without this, the first agent edit of a
         session is silently dropped. */
      const opsBacklog = [
        ...(window.__doodleCanvasOpsQueue ?? []),
        ...pendingOpsRef.current,
      ];
      pendingOpsRef.current = [];
      if (window.__doodleCanvasOpsQueue) window.__doodleCanvasOpsQueue.length = 0;

      if (opsBacklog.length > 0) {
        const { skipped } = applyCanvasOps(editor, opsBacklog);
        if (skipped.length > 0) console.warn("[DoodleCanvas] mount ops skipped:", skipped);
      }

      /* Assign refs to existing media shapes that lack them, so the agent can
         address media placed before the ref system existed. */
      for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type === "image" || shape.type === "video") {
          const meta = shape.meta as Record<string, unknown>;
          if (!meta?.ref) {
            const ref = autoRef(editor, shape.type);
            assignRef(editor, shape.id, ref);
          }
        }
      }

      /* Publish the initial digest and subscribe to store changes. */
      publishDigest(editor);
      editor.store.listen(() => publishDigest(editor), {
        scope: "document",
        source: "all",
      });
    },
    [initialMedia, placeMedia],
  );

  useEffect(() => {
    const onAdd = (event: Event) => {
      const detail = (event as CustomEvent<CanvasAddDetail>).detail;
      // Prefer `items`; fall back to the legacy stills-only `urls` so an older
      // cached chat bundle can still deliver doodles to a freshly built island.
      const media = detail?.items?.length ? detail.items : detail?.urls;
      if (media?.length) void placeMedia(media);
    };
    window.addEventListener("doodleai:canvas-add", onAdd);

    const onOps = (event: Event) => {
      const detail = (event as CustomEvent<{ ops: CanvasOp[] }>).detail;
      if (detail?.ops?.length) applyOps(detail.ops);
    };
    window.addEventListener("doodleai:canvas-ops", onOps);

    return () => {
      window.removeEventListener("doodleai:canvas-add", onAdd);
      window.removeEventListener("doodleai:canvas-ops", onOps);
    };
  }, [placeMedia, applyOps]);

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
          licenseKey={licenseKey}
          components={CANVAS_COMPONENTS}
          onMount={handleMount}
        />
      )}
      {voiceOpen && (
        <Suspense fallback={null}>
          {/* Voice generations arrive as the SAME events the typed chat uses, so
              the HUD forwards them straight onto this canvas via the existing
              window CustomEvents (doodleai:canvas-add / :canvas-ops). */}
          <VoiceHud
            onCanvasEvent={handleVoiceCanvasEvent}
            onExit={() => {
              setVoiceOpen(false);
              // Hand the page back to chat mode so the composer returns.
              (window as unknown as { __doodleVoiceOpen?: boolean }).__doodleVoiceOpen = false;
              window.dispatchEvent(new Event("doodleai:voice-close"));
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
