/* The public roadmap board — optionally multiplayer.
 *
 * Two modes, detected at runtime via a pre-flight fetch:
 *
 *   1. MULTIPLAYER (sync server available): uses @tldraw/sync to connect to
 *      the Durable Object room. Changes propagate live to all viewers. Assets
 *      upload to R2. Requires `ROADMAP_ROOM` + `ROADMAP_ASSETS` Cloudflare
 *      bindings — i.e. `pnpm dev` (wrangler) or a deployed Worker.
 *
 *   2. LOCAL-ONLY (sync server unavailable): falls back to a plain <Tldraw>
 *      with localStorage persistence, identical to the doodle canvas. Anyone
 *      who clones the repo and runs `pnpm dev:local` gets a fully functional
 *      board they can draw on; multiplayer is the upgrade path, not a gate.
 *
 * This dual-mode exists because the project is open source and any contributor
 * should be able to run `pnpm install && pnpm dev:local` and see every page
 * working, without needing a Cloudflare account or Durable Object setup.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Tldraw,
  type Editor,
  type IndexKey,
  type TLAssetStore,
  type TLComponents,
  createShapeId,
  defaultBindingUtils,
  defaultShapeUtils,
  uniqueId,
  toRichText,
} from "tldraw";
import { useSync } from "@tldraw/sync";
import { roadmapRecords } from "../../roadmap/schema";
import "tldraw/tldraw.css";

interface RoadmapBoardProps {
  /** Room id; must be in the connect route's allow-list. */
  room: string;
  /** Origin-relative WebSocket path, resolved to ws(s):// at runtime. */
  connectPath: string;
  /**
   * Whether this visitor may seed an empty board.
   */
  canSeed: boolean;
  /**
   * Which board variant to seed.
   * - "team": full internal roadmap (ICE BOX / TO DO / TESTING / DONE).
   * - "public": user feedback board (INBOX / PLANNED / DONE) — simpler, and
   *   where the feedback dialog's stickies land.
   */
  variant?: "team" | "public";
}

/* Chrome we remove from tldraw's default UI.
   - PageMenu: dead weight, one board per room.
   - Debug surfaces: never relevant to a roadmap.
   - MainMenu / ActionsMenu: the top-left hamburger + undo/redo/trash/settings
     cluster overlapped the app shell and duplicated the app's own nav, which is
     what made the board read as "two UIs stacked on each other".
   - NavigationPanel: the bottom-left zoom readout collided with the sidebar
     collapse control.
   StylePanel is KEPT — people draw arrows and write notes here, so colour and
   size are real tools rather than stray chrome. */
const BOARD_COMPONENTS: TLComponents = {
  DebugPanel: null,
  DebugMenu: null,
  PageMenu: null,
  Minimap: null,
  MainMenu: null,
  ActionsMenu: null,
  NavigationPanel: null,
};

/** "loading" → probe in flight; "sync" → multiplayer; "local" → fallback. */
type BoardMode = "loading" | "sync" | "local";

/* ---------------------------------------------------------------------------
 * Seed board
 *
 * Mirrors the roadmap actually being worked from, rather than invented sample
 * content: the same four columns, the same items, and the same colour-as-category
 * convention (a note's colour says what KIND of work it is, its column says
 * what STATE it is in). Two orthogonal axes on one board is the reason this is a
 * canvas and not a list.
 * ------------------------------------------------------------------------- */

/** Colour = category. Legend is rendered on the board so it is self-describing. */
const CATEGORY = {
  ui: "grey",
  api: "violet",
  idea: "orange",
  seo: "green",
  bug: "red",
  infra: "blue",
} as const;

type Category = keyof typeof CATEGORY;

interface SeedNote {
  text: string;
  cat: Category;
}

interface SeedColumn {
  label: string;
  notes: SeedNote[];
}

const SEED_COLUMNS: SeedColumn[] = [
  {
    label: "ICE BOX",
    notes: [
      { text: "Make it fast", cat: "idea" },
      { text: "WhatsApp connector\n— post doodles to a group", cat: "idea" },
      { text: "Payment", cat: "idea" },
      { text: "User can create a skill\n+ share it", cat: "api" },
      { text: "SEO — Bing etc", cat: "seo" },
      { text: "AWS limit — increase it", cat: "bug" },
      { text: "Feedback UI", cat: "idea" },
      { text: "Sticker", cat: "idea" },
      { text: "API + MCP + CLI", cat: "bug" },
      { text: "Create video", cat: "api" },
      { text: "PicX AI Studio\nimage generation polling", cat: "bug" },
      { text: "Cool demo", cat: "infra" },
      { text: "Prod deploy", cat: "api" },
    ],
  },
  {
    label: "TO DO",
    notes: [
      { text: "Whiteboard canvas", cat: "idea" },
      { text: "Testing — app end to end", cat: "idea" },
      { text: "B2B studio", cat: "ui" },
      { text: "10 article posting", cat: "seo" },
      { text: "Create test case", cat: "idea" },
      { text: "Admin panel", cat: "infra" },
      { text: "Footer", cat: "infra" },
      { text: "Create article images (50)", cat: "seo" },
      { text: "Team workspace", cat: "idea" },
      { text: "Image webhook", cat: "api" },
    ],
  },
  {
    label: "TESTING",
    notes: [
      { text: "DataFast + Mixpanel + GA4", cat: "idea" },
      { text: "Open source project", cat: "api" },
    ],
  },
  {
    label: "DONE",
    notes: [
      { text: "UI changes", cat: "idea" },
      { text: "DB", cat: "seo" },
      { text: "Secrets store", cat: "api" },
      { text: "Skill support", cat: "seo" },
      { text: "Auth", cat: "api" },
      { text: "Fix dev login", cat: "bug" },
      { text: "Dev env deploy", cat: "infra" },
      { text: "Zero trust", cat: "seo" },
      { text: "Fix sidebar", cat: "bug" },
      { text: "CI/CD GitHub", cat: "seo" },
      { text: "SEO / AEO keywords", cat: "idea" },
    ],
  },
];

/* Geometry. Notes are tldraw's fixed 200x200 sticky; everything else is derived
   from that so the columns cannot drift out of alignment. */
const NOTE_SIZE = 200;
const NOTE_GAP_Y = 28;
const NOTES_PER_ROW = 2;
const COLUMN_GUTTER = 90;
const COLUMN_W = NOTES_PER_ROW * NOTE_SIZE + NOTE_GAP_Y;
const COLUMN_PITCH = COLUMN_W + COLUMN_GUTTER;
const HEADER_H = 64;
const LEGEND_W = 210;
const BOARD_PAD = 40;

/** Tallest column decides the divider height, so all rules are the same length. */
function boardBodyHeight(): number {
  const rows = Math.max(...SEED_COLUMNS.map((c) => Math.ceil(c.notes.length / NOTES_PER_ROW)));
  return rows * (NOTE_SIZE + NOTE_GAP_Y) + NOTE_GAP_Y;
}

/**
 * A white rule, drawn with tldraw's own `line` shape.
 *
 * Deliberately a real shape rather than CSS: a CSS overlay would not pan, zoom,
 * export or sync with the board, so the separators would slide off the columns
 * the moment anyone moved the camera. As shapes they are part of the document
 * and behave like everything else on it.
 */
function createRule(
  editor: Editor,
  opts: { x: number; y: number; dx: number; dy: number },
): void {
  editor.createShape({
    id: createShapeId(),
    type: "line",
    x: opts.x,
    y: opts.y,
    isLocked: true,
    props: {
      color: "white",
      size: "s",
      dash: "solid",
      points: {
        ["a1" as IndexKey]: { id: "a1", index: "a1" as IndexKey, x: 0, y: 0 },
        ["a2" as IndexKey]: { id: "a2", index: "a2" as IndexKey, x: opts.dx, y: opts.dy },
      },
    },
  });
}

function seedDefaultBoard(editor: Editor): void {
  const bodyH = boardBodyHeight();
  const boardW = SEED_COLUMNS.length * COLUMN_PITCH - COLUMN_GUTTER;

  /* Legend: colour → category, so the board explains its own convention
     instead of relying on tribal knowledge. */
  const legendX = -(LEGEND_W + COLUMN_GUTTER);
  (Object.keys(CATEGORY) as Category[]).forEach((cat, i) => {
    editor.createShape({
      id: createShapeId(),
      type: "text",
      x: legendX,
      y: i * 72,
      isLocked: true,
      props: {
        richText: toRichText(cat.toUpperCase()),
        color: CATEGORY[cat],
        size: "xl",
        font: "sans",
        autoSize: true,
      },
    });
  });

  SEED_COLUMNS.forEach((col, colIndex) => {
    const colX = colIndex * COLUMN_PITCH;

    // Column heading
    editor.createShape({
      id: createShapeId(),
      type: "text",
      x: colX + COLUMN_W / 2 - 60,
      y: -HEADER_H,
      isLocked: true,
      props: {
        richText: toRichText(col.label),
        color: "white",
        size: "l",
        font: "sans",
        autoSize: true,
      },
    });

    // Notes, wrapped two-up so a long column stays readable instead of
    // running off the bottom of the screen.
    col.notes.forEach((note, i) => {
      const row = Math.floor(i / NOTES_PER_ROW);
      const slot = i % NOTES_PER_ROW;
      editor.createShape({
        id: createShapeId(),
        type: "note",
        x: colX + slot * (NOTE_SIZE + NOTE_GAP_Y),
        y: row * (NOTE_SIZE + NOTE_GAP_Y),
        props: {
          richText: toRichText(note.text),
          color: CATEGORY[note.cat],
          size: "m",
          font: "sans",
        },
      });
    });

    // Vertical rule BETWEEN columns (not after the last one).
    if (colIndex < SEED_COLUMNS.length - 1) {
      createRule(editor, {
        x: colX + COLUMN_W + COLUMN_GUTTER / 2,
        y: -HEADER_H - BOARD_PAD,
        dx: 0,
        dy: bodyH + HEADER_H + BOARD_PAD,
      });
    }
  });

  // Horizontal rule under the headings, spanning the whole board.
  createRule(editor, {
    x: -BOARD_PAD,
    y: -HEADER_H - BOARD_PAD / 2,
    dx: boardW + BOARD_PAD * 2,
    dy: 0,
  });

  // Frame all the seeded content so the user sees the whole board
  editor.zoomToFit({ animation: { duration: 400 } });
}

/* ---------------------------------------------------------------------------
 * Public board seed — the user-facing feedback board.
 *
 * Four columns: INBOX (where feedback stickies land via the API), IN REVIEW
 * (admin is looking at it), PLANNED (acknowledged, will do), SHIPPED (done).
 * Users can freely create notes and move their own.
 * ------------------------------------------------------------------------- */

const PUBLIC_COLUMNS = [
  { label: "💬 INBOX", notes: [
    "Your feedback lands here.\nAdd a note or use the Feedback button!",
    "Feature requests, bug reports,\nor just tell us what you think.",
  ]},
  { label: "🔍 IN REVIEW", notes: [] },
  { label: "📋 PLANNED", notes: [] },
  { label: "✅ SHIPPED", notes: [] },
];

function seedPublicBoard(editor: Editor): void {
  const colPitch = 340;
  const noteSize = 200;
  const headerH = 60;
  const pad = 40;
  const boardW = PUBLIC_COLUMNS.length * colPitch;

  PUBLIC_COLUMNS.forEach((col, colIndex) => {
    const colX = colIndex * colPitch;

    // Column heading — locked so users can't accidentally drag it
    editor.createShape({
      id: createShapeId(),
      type: "text",
      x: colX + 40,
      y: -headerH,
      isLocked: true,
      props: {
        richText: toRichText(col.label),
        color: "white",
        size: "l",
        font: "sans",
        autoSize: true,
      },
    });

    // Seed notes — NOT locked so users can interact with them
    col.notes.forEach((text, i) => {
      editor.createShape({
        id: createShapeId(),
        type: "note",
        x: colX,
        y: i * (noteSize + 28),
        props: {
          richText: toRichText(text),
          color: "yellow",
          size: "m",
          font: "sans",
        },
      });
    });

    // Vertical rules between columns — locked
    if (colIndex < PUBLIC_COLUMNS.length - 1) {
      createRule(editor, {
        x: colX + colPitch - 30,
        y: -headerH - pad,
        dx: 0,
        dy: 700,
      });
    }
  });

  // Horizontal rule under headings
  createRule(editor, {
    x: -pad,
    y: -10,
    dx: boardW + pad,
    dy: 0,
  });

  editor.zoomToFit({ animation: { duration: 400 } });
}

export default function RoadmapBoard({ room, connectPath, canSeed, variant = "team" }: RoadmapBoardProps) {
  const [mode, setMode] = useState<BoardMode>("loading");

  /* Pre-flight: probe the connect route to decide which mode to use.
     - 426 (upgrade required) = sync server alive, use multiplayer
     - 503 / network error = no DO available, fall back to local
     One fetch, one decision, cached for the component's lifetime. */
  useEffect(() => {
    fetch(connectPath, { method: "GET" })
      .then((res) => setMode(res.status === 503 ? "local" : "sync"))
      .catch(() => setMode("local"));
  }, [connectPath]);

  /* --- Shared setup (both modes) --- */

  const editorRef = useRef<Editor | null>(null);

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      editor.user.updateUserPreferences({ colorScheme: "dark" });
      editor.updateInstanceState({ isGridMode: true });

      if (canSeed && editor.getCurrentPageShapeIds().size === 0) {
        if (variant === "public") {
          seedPublicBoard(editor);
        } else {
          seedDefaultBoard(editor);
        }
      }
    },
    [canSeed, variant],
  );

  /* Listen for feedback submissions from the sidebar dialog and add a note
     directly to the canvas. This is what makes feedback visible instantly in
     both local mode (no DO) and multiplayer (as a client-created shape that
     the authorizer stamps with the user's id). */
  useEffect(() => {
    if (variant !== "public") return;

    const handler = (e: Event) => {
      const editor = editorRef.current;
      if (!editor) return;
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (!text) return;

      // Place in the INBOX column (x=0), below existing notes.
      const existingShapes = editor.getCurrentPageShapes();
      const inboxNotes = existingShapes.filter(
        (s) => s.type === "note" && s.x >= -50 && s.x < 300,
      );
      const maxY = inboxNotes.reduce((max, s) => Math.max(max, s.y), -28);

      editor.createShape({
        id: createShapeId(),
        type: "note",
        x: 0,
        y: maxY + 228,
        props: {
          richText: toRichText(text),
          color: "orange",
          size: "m",
          font: "sans",
        },
      });
    };

    window.addEventListener("doodleai:feedback-added", handler);
    return () => window.removeEventListener("doodleai:feedback-added", handler);
  }, [variant]);

  /* --- Multiplayer assets (R2 upload) --- */

  const syncAssets = useMemo<TLAssetStore>(
    () => ({
      async upload(_asset, file) {
        const id = `${uniqueId()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`.slice(0, 110);
        const res = await fetch(`/api/roadmap/asset/${id}`, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        return { src: `/api/roadmap/asset/${id}` };
      },
      resolve(asset) {
        return asset.props.src;
      },
    }),
    [],
  );

  /* --- Multiplayer store (useSync) --- */

  const shapeUtils = useMemo(() => defaultShapeUtils, []);
  const bindingUtils = useMemo(() => defaultBindingUtils, []);

  const wsUri = useMemo(() => {
    if (typeof window === "undefined") return connectPath;
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${window.location.host}${connectPath}`;
  }, [connectPath]);

  /* useSync is always called (React hook rules), but only the 'sync' mode
     renders it. When mode is 'local', the store object is created but never
     passed to <Tldraw>, so the WebSocket is not opened. */
  const syncStore = useSync({
    uri: wsUri,
    assets: syncAssets,
    shapeUtils,
    bindingUtils,
    records: roadmapRecords,
  });

  /* --- Render --- */

  if (mode === "loading") {
    return (
      <div className="roadmap-board-root" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--text-dimmer, #6a6a72)", fontSize: 13 }}>Connecting to the board…</span>
      </div>
    );
  }

  if (mode === "local") {
    return (
      <div className="roadmap-board-root" style={{ position: "absolute", inset: 0 }}>
        <Tldraw
          persistenceKey={`doodleai-roadmap-${room}`}
          licenseKey={import.meta.env.PUBLIC_TLDRAW_LICENSE_KEY}
          components={BOARD_COMPONENTS}
          onMount={onMount}
        />
      </div>
    );
  }

  // mode === "sync"
  return (
    <div className="roadmap-board-root" style={{ position: "absolute", inset: 0 }}>
      <Tldraw
        store={syncStore}
        licenseKey={import.meta.env.PUBLIC_TLDRAW_LICENSE_KEY}
        components={BOARD_COMPONENTS}
        onMount={onMount}
        data-room={room}
      />
    </div>
  );
}
