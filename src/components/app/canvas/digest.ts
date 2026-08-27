/**
 * Canvas digest builder — produces the CanvasDigest snapshot that travels
 * with each chat request so the agent knows what's on the board.
 *
 * Rules:
 * - Cap at MAX_DIGEST_SHAPES, selecting LARGEST AREA FIRST.
 * - `count` is the true pre-truncation total; `truncated` set accordingly.
 * - All coordinates rounded to integers.
 * - richText flattened to plain text for `label`.
 * - Includes altText for image shapes.
 * - Carries author from meta.author.
 * - Assigns a ref to any shape lacking one.
 */
import type { Editor, TLShape, TLShapeId } from "tldraw";
import type { CanvasDigest, CanvasDigestShape } from "../../../lib/canvas/ops";
import { MAX_DIGEST_SHAPES } from "../../../lib/canvas/ops";
import { assignRef, autoRef, getShapeRef } from "./refs";

/** Map tldraw shape.type to the digest's simplified type enum. */
function mapType(
  type: string
): CanvasDigestShape["type"] {
  switch (type) {
    case "image":
      return "image";
    case "text":
      return "text";
    case "note":
      return "note";
    case "arrow":
      return "arrow";
    case "geo":
      return "geo";
    case "frame":
      return "frame";
    case "group":
      return "group";
    case "draw":
      return "draw";
    default:
      return "other";
  }
}

/**
 * Extract plain text from a tldraw richText JSON structure.
 * richText is ProseMirror-shaped: { type:'doc', content:[{ type:'paragraph', content:[{ type:'text', text:'...' }] }] }
 * We flatten it to plain text, joining paragraphs with newlines.
 */
function flattenRichText(richText: unknown): string | undefined {
  if (!richText || typeof richText !== "object") return undefined;
  const doc = richText as { type?: string; content?: unknown[] };
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return undefined;

  const lines: string[] = [];
  for (const block of doc.content) {
    const b = block as { type?: string; content?: unknown[] };
    if (!Array.isArray(b.content)) {
      lines.push("");
      continue;
    }
    const text = b.content
      .map((node) => {
        const n = node as { type?: string; text?: string };
        return n.type === "text" ? (n.text ?? "") : "";
      })
      .join("");
    lines.push(text);
  }

  const result = lines.join("\n").trim();
  return result.length > 0 ? result : undefined;
}

/** Extract label text from a shape's props, handling richText and frame.name. */
function extractLabel(shape: TLShape): string | undefined {
  const props = shape.props as Record<string, unknown>;

  // Frame shapes use props.name
  if (shape.type === "frame" && typeof props.name === "string" && props.name.length > 0) {
    return props.name;
  }

  // Text, note, geo shapes use props.richText
  if (props.richText) {
    return flattenRichText(props.richText);
  }

  return undefined;
}

/**
 * Build a CanvasDigest from the live editor state.
 * Selects largest-area shapes first, up to MAX_DIGEST_SHAPES.
 */
export function buildDigest(editor: Editor): CanvasDigest {
  const allShapes = editor.getCurrentPageShapes();
  const count = allShapes.length;

  // Compute bounds for each shape and sort by area descending
  const shapesWithBounds: Array<{ shape: TLShape; x: number; y: number; w: number; h: number; area: number }> = [];

  for (const shape of allShapes) {
    const bounds = editor.getShapePageBounds(shape.id);
    if (!bounds) continue;
    shapesWithBounds.push({
      shape,
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      area: bounds.w * bounds.h,
    });
  }

  shapesWithBounds.sort((a, b) => b.area - a.area);

  const selected = shapesWithBounds.slice(0, MAX_DIGEST_SHAPES);
  const truncated = count > MAX_DIGEST_SHAPES;

  const shapes: CanvasDigestShape[] = selected.map(({ shape, x, y, w, h }) => {
    // Ensure every shape has a ref — assign one if missing
    let ref = getShapeRef(shape);
    if (!ref) {
      ref = autoRef(editor, shape.type);
      assignRef(editor, shape.id, ref);
    }

    const meta = shape.meta as Record<string, unknown>;
    const props = shape.props as Record<string, unknown>;
    const author = meta.author === "agent" ? "agent" as const : meta.author === "user" ? "user" as const : undefined;

    const entry: CanvasDigestShape = {
      ref,
      type: mapType(shape.type),
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
    };

    const label = extractLabel(shape);
    if (label) entry.label = label;

    // altText for image shapes
    if (shape.type === "image" && typeof props.altText === "string" && props.altText.length > 0) {
      entry.altText = props.altText;
    }

    if (author) entry.author = author;

    // Group membership
    if (shape.parentId && typeof shape.parentId === "string" && !shape.parentId.startsWith("page:")) {
      const parent = editor.getShape(shape.parentId as TLShapeId);
      if (parent) {
        const parentRef = getShapeRef(parent);
        if (parentRef) entry.groupRef = parentRef;
      }
    }

    return entry;
  });

  const digest: CanvasDigest = {
    shapes,
    count,
    truncated,
  };

  // Include camera zoom for context
  const camera = editor.getCamera();
  if (camera) {
    digest.camera = { zoom: Math.round(camera.z * 100) / 100 };
  }

  return digest;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Publish the digest to window.__doodleCanvasDigest, debounced at ~400ms.
 * Called on store change so api-turn.ts always has a fresh snapshot.
 */
export function publishDigest(editor: Editor): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    window.__doodleCanvasDigest = buildDigest(editor);
  }, 400);
}
