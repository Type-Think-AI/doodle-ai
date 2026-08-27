/**
 * Ref resolution layer — maps human handles (e.g. 'boss-avatar') to tldraw
 * shape ids via shape.meta.ref. The agent never sees tldraw ids.
 *
 * Refs are unique per page. Collisions get a numeric suffix rather than
 * overwriting the existing shape's ref.
 */
import type { Editor, TLShape, TLShapeId } from "tldraw";

/** Read the ref stored on a shape's meta, if any. */
export function getShapeRef(shape: TLShape): string | undefined {
  const ref = (shape.meta as Record<string, unknown>)?.ref;
  return typeof ref === "string" && ref.length > 0 ? ref : undefined;
}

/**
 * Resolve a human ref to a tldraw shape id on the current page.
 * Returns null if no shape carries that ref.
 */
export function resolveRef(editor: Editor, ref: string): TLShapeId | null {
  const shapes = editor.getCurrentPageShapes();
  for (const shape of shapes) {
    if (getShapeRef(shape) === ref) return shape.id;
  }
  return null;
}

/**
 * Assign a ref to a shape. If the ref already exists on the page, appends a
 * numeric suffix to make it unique (e.g. 'label' → 'label-2').
 * Returns the ref that was actually written (may differ from the requested one).
 */
export function assignRef(editor: Editor, shapeId: TLShapeId, ref: string): string {
  const existing = resolveRef(editor, ref);
  let finalRef = ref;

  if (existing && existing !== shapeId) {
    // Collision — find a free suffix
    let n = 2;
    while (resolveRef(editor, `${ref}-${n}`) !== null) n++;
    finalRef = `${ref}-${n}`;
  }

  editor.updateShape({
    id: shapeId,
    type: editor.getShape(shapeId)!.type,
    meta: { ...(editor.getShape(shapeId)!.meta as object), ref: finalRef },
  });

  return finalRef;
}

/**
 * Auto-generate a unique ref for a shape based on its type.
 * Pattern: '<type>-<n>' where n starts at 1.
 */
export function autoRef(editor: Editor, type: string): string {
  const shapes = editor.getCurrentPageShapes();
  const prefix = type.toLowerCase();
  let max = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);

  for (const shape of shapes) {
    const ref = getShapeRef(shape);
    if (!ref) continue;
    const m = ref.match(pattern);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
    // Also count exact match as 1 occupant
    if (ref === `${prefix}-1`) max = Math.max(max, 1);
  }

  return `${prefix}-${max + 1}`;
}
