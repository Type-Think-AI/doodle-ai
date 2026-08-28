/**
 * Browser-side interpreter that applies agent canvas ops to tldraw.
 *
 * Critical invariants:
 * 1. The WHOLE batch is ONE undo step: markHistoryStoppingPoint + one editor.run().
 * 2. Per-op try/catch: one bad op is skipped, the rest still lands.
 * 3. Unknown ref → skip, never throw.
 * 4. Everything the agent creates gets meta: { ref, author: 'agent' }.
 * 5. Exhaustive switch with `never` default — TypeScript fails the build if an
 *    op kind is unhandled.
 *
 * tldraw 5.3.2 correctness:
 * - text/note shapes use props.richText via toRichText(string). NOT props.text.
 * - addArrow creates arrow shape AND binds BOTH ends with editor.createBinding().
 * - geo shapes use props.geo = kind, label via richText.
 * - frame shapes use props.name = title.
 */
import {
  type Editor,
  type TLShapeId,
  createShapeId,
  toRichText,
} from "tldraw";
import type { CanvasOp, Anchor } from "../../../lib/canvas/ops";
import { DEFAULT_GAP } from "../../../lib/canvas/ops";
import { resolveRef, assignRef, autoRef } from "./refs";

export interface ApplyResult {
  applied: number;
  skipped: string[];
}

/**
 * Resolve an anchor to an {x, y} position based on live shape bounds.
 * Returns null if the anchor ref cannot be resolved.
 */
function resolveAnchor(
  editor: Editor,
  anchor: Anchor | undefined,
  shapeW: number,
  shapeH: number
): { x: number; y: number } | null {
  if (!anchor) return null;

  const gap = anchor.gap ?? DEFAULT_GAP;

  const tryResolve = (ref: string | undefined) => {
    if (!ref) return null;
    const id = resolveRef(editor, ref);
    if (!id) return null;
    return editor.getShapePageBounds(id);
  };

  if (anchor.rightOf) {
    const bounds = tryResolve(anchor.rightOf);
    if (bounds) return { x: bounds.maxX + gap, y: bounds.y };
  }
  if (anchor.leftOf) {
    const bounds = tryResolve(anchor.leftOf);
    if (bounds) return { x: bounds.x - shapeW - gap, y: bounds.y };
  }
  if (anchor.below) {
    const bounds = tryResolve(anchor.below);
    if (bounds) return { x: bounds.x, y: bounds.maxY + gap };
  }
  if (anchor.above) {
    const bounds = tryResolve(anchor.above);
    if (bounds) return { x: bounds.x, y: bounds.y - shapeH - gap };
  }

  return null;
}

/**
 * Find a free slot near existing content when no anchor is provided.
 * Places to the right of the rightmost shape on the page.
 */
function findFreeSlot(editor: Editor): { x: number; y: number } {
  const shapes = editor.getCurrentPageShapes();
  if (shapes.length === 0) return { x: 100, y: 100 };

  let maxX = -Infinity;
  let atY = 0;
  for (const shape of shapes) {
    const bounds = editor.getShapePageBounds(shape.id);
    if (bounds && bounds.maxX > maxX) {
      maxX = bounds.maxX;
      atY = bounds.y;
    }
  }

  return { x: maxX + DEFAULT_GAP, y: atY };
}

/** Resolve multiple refs to shape ids, returning only those that resolve. */
function resolveRefs(editor: Editor, refs: string[]): TLShapeId[] {
  const ids: TLShapeId[] = [];
  for (const ref of refs) {
    const id = resolveRef(editor, ref);
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Apply a batch of canvas ops to the editor as a single undo step.
 *
 * This is the MOST IMPORTANT function in this file: the entire batch is wrapped
 * in ONE markHistoryStoppingPoint + ONE editor.run() so Cmd+Z undoes the
 * agent's entire edit as a single step.
 */
export function applyCanvasOps(
  editor: Editor,
  ops: CanvasOp[]
): ApplyResult {
  let applied = 0;
  const skipped: string[] = [];

  editor.markHistoryStoppingPoint("agent edit");

  editor.run(
    () => {
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i]!;
        try {
          const result = applySingleOp(editor, op, i);
          if (result === true) {
            applied++;
          } else {
            skipped.push(result);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          skipped.push(`op ${i} (${op.op}): ${msg}`);
          console.error(`[apply-ops] op ${i} (${op.op}) failed:`, err);
        }
      }
    },
    { history: "record" }
  );

  return { applied, skipped };
}

/**
 * Apply a single op. Returns true on success, or a skip reason string on failure.
 */
function applySingleOp(
  editor: Editor,
  op: CanvasOp,
  index: number
): true | string {
  switch (op.op) {
    case "addText": {
      const shapeId = createShapeId();
      const pos = resolveAnchor(editor, op.at, 200, 40) ?? findFreeSlot(editor);
      const ref = op.ref ?? autoRef(editor, "text");

      editor.createShape({
        id: shapeId,
        type: "text",
        x: pos.x,
        y: pos.y,
        props: {
          richText: toRichText(op.text),
          ...(op.size && { size: op.size }),
          ...(op.color && { color: op.color }),
        },
        meta: { ref, author: "agent" },
      });
      return true;
    }

    case "addNote": {
      const shapeId = createShapeId();
      const pos = resolveAnchor(editor, op.at, 200, 200) ?? findFreeSlot(editor);
      const ref = op.ref ?? autoRef(editor, "note");

      editor.createShape({
        id: shapeId,
        type: "note",
        x: pos.x,
        y: pos.y,
        props: {
          richText: toRichText(op.text),
          ...(op.color && { color: op.color }),
        },
        meta: { ref, author: "agent" },
      });
      return true;
    }

    case "addArrow": {
      const fromId = resolveRef(editor, op.from);
      const toId = resolveRef(editor, op.to);
      if (!fromId) return `op ${index} (addArrow): unknown ref '${op.from}'`;
      if (!toId) return `op ${index} (addArrow): unknown ref '${op.to}'`;

      const arrowId = createShapeId();
      const ref = op.ref ?? autoRef(editor, "arrow");

      editor.createShape({
        id: arrowId,
        type: "arrow",
        props: {
          ...(op.label && { richText: toRichText(op.label) }),
        },
        meta: { ref, author: "agent" },
      });

      // Bind start terminal to the 'from' shape
      editor.createBinding({
        type: "arrow",
        fromId: arrowId,
        toId: fromId,
        props: {
          terminal: "start",
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
          snap: "none",
        },
      });

      // Bind end terminal to the 'to' shape
      editor.createBinding({
        type: "arrow",
        fromId: arrowId,
        toId: toId,
        props: {
          terminal: "end",
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
          snap: "none",
        },
      });

      return true;
    }

    case "addShape": {
      const shapeId = createShapeId();
      const w = op.w ?? 120;
      const h = op.h ?? 120;
      const pos = resolveAnchor(editor, op.at, w, h) ?? findFreeSlot(editor);
      const ref = op.ref ?? autoRef(editor, "geo");

      editor.createShape({
        id: shapeId,
        type: "geo",
        x: pos.x,
        y: pos.y,
        props: {
          geo: op.kind,
          w,
          h,
          ...(op.label && { richText: toRichText(op.label) }),
          ...(op.color && { color: op.color }),
          ...(op.fill && { fill: op.fill }),
        },
        meta: { ref, author: "agent" },
      });
      return true;
    }

    case "addFrame": {
      const shapeId = createShapeId();
      const ref = op.ref ?? autoRef(editor, "frame");

      if (op.children && op.children.length > 0) {
        // Size the frame around its children
        const childIds = resolveRefs(editor, op.children);
        if (childIds.length === 0) return `op ${index} (addFrame): no valid children refs`;

        // Compute bounding box of children
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const cid of childIds) {
          const bounds = editor.getShapePageBounds(cid);
          if (bounds) {
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.maxX);
            maxY = Math.max(maxY, bounds.maxY);
          }
        }

        const padding = 40;
        editor.createShape({
          id: shapeId,
          type: "frame",
          x: minX - padding,
          y: minY - padding,
          props: {
            name: op.title,
            w: maxX - minX + padding * 2,
            h: maxY - minY + padding * 2,
          },
          meta: { ref, author: "agent" },
        });

        // Reparent children into the frame
        editor.reparentShapes(childIds, shapeId);
      } else {
        // Empty frame at a free slot
        const pos = findFreeSlot(editor);
        editor.createShape({
          id: shapeId,
          type: "frame",
          x: pos.x,
          y: pos.y,
          props: {
            name: op.title,
            w: 400,
            h: 300,
          },
          meta: { ref, author: "agent" },
        });
      }
      return true;
    }

    case "label": {
      const targetId = resolveRef(editor, op.ref);
      if (!targetId) return `op ${index} (label): unknown ref '${op.ref}'`;

      const bounds = editor.getShapePageBounds(targetId);
      if (!bounds) return `op ${index} (label): no bounds for '${op.ref}'`;

      // Place a text shape centred beneath the target
      const labelId = createShapeId();
      const labelRef = autoRef(editor, "text");
      editor.createShape({
        id: labelId,
        type: "text",
        x: bounds.x,
        y: bounds.maxY + 8,
        props: {
          richText: toRichText(op.text),
          size: "s",
        },
        meta: { ref: labelRef, author: "agent" },
      });

      // Centre the label under the target after creation (need its bounds)
      const labelBounds = editor.getShapePageBounds(labelId);
      if (labelBounds && labelBounds.w < bounds.w) {
        editor.updateShape({
          id: labelId,
          type: "text",
          x: bounds.x + (bounds.w - labelBounds.w) / 2,
        });
      }

      return true;
    }

    case "setAltText": {
      const targetId = resolveRef(editor, op.ref);
      if (!targetId) return `op ${index} (setAltText): unknown ref '${op.ref}'`;

      const shape = editor.getShape(targetId);
      if (!shape || shape.type !== "image") {
        // No-op for non-image shapes as specified
        return true;
      }

      editor.updateShape({
        id: targetId,
        type: "image",
        props: { altText: op.altText },
      });
      return true;
    }

    case "rename": {
      const targetId = resolveRef(editor, op.ref);
      if (!targetId) return `op ${index} (rename): unknown ref '${op.ref}'`;

      assignRef(editor, targetId, op.name);
      return true;
    }

    case "group": {
      const childIds = resolveRefs(editor, op.children);
      if (childIds.length < 2) return `op ${index} (group): need at least 2 valid refs`;

      const groupId = createShapeId();
      const ref = op.ref ?? autoRef(editor, "group");

      editor.groupShapes(childIds, { groupId });
      editor.updateShape({
        id: groupId,
        type: "group",
        meta: { ref, author: "agent" },
      });
      return true;
    }

    case "ungroup": {
      const targetId = resolveRef(editor, op.ref);
      if (!targetId) return `op ${index} (ungroup): unknown ref '${op.ref}'`;

      editor.ungroupShapes([targetId]);
      return true;
    }

    case "align": {
      const ids = resolveRefs(editor, op.refs);
      if (ids.length < 2) return `op ${index} (align): need at least 2 valid refs`;

      editor.alignShapes(ids, op.edge);
      return true;
    }

    case "stack": {
      const ids = resolveRefs(editor, op.refs);
      if (ids.length < 2) return `op ${index} (stack): need at least 2 valid refs`;

      editor.stackShapes(ids, op.axis, op.gap ?? DEFAULT_GAP);
      return true;
    }

    case "distribute": {
      const ids = resolveRefs(editor, op.refs);
      if (ids.length < 3) return `op ${index} (distribute): need at least 3 valid refs`;

      editor.distributeShapes(ids, op.axis);
      return true;
    }

    case "grid": {
      const ids = resolveRefs(editor, op.refs);
      if (ids.length < 2) return `op ${index} (grid): need at least 2 valid refs`;

      const gap = op.gap ?? DEFAULT_GAP;
      const columns = op.columns;

      // No tldraw grid equivalent — compute positions manually
      // Use the first shape's bounds as the cell size reference
      const cellBounds = editor.getShapePageBounds(ids[0]!);
      if (!cellBounds) return `op ${index} (grid): cannot get bounds for first shape`;

      const startX = cellBounds.x;
      const startY = cellBounds.y;
      const cellW = cellBounds.w;
      const cellH = cellBounds.h;

      for (let i = 0; i < ids.length; i++) {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const shape = editor.getShape(ids[i]!);
        if (!shape) continue;
        editor.updateShape({
          id: ids[i]!,
          type: shape.type,
          x: startX + col * (cellW + gap),
          y: startY + row * (cellH + gap),
        });
      }
      return true;
    }

    case "pack": {
      const ids = resolveRefs(editor, op.refs);
      if (ids.length < 2) return `op ${index} (pack): need at least 2 valid refs`;

      editor.packShapes(ids, op.gap ?? DEFAULT_GAP);
      return true;
    }

    case "move": {
      const targetId = resolveRef(editor, op.ref);
      if (!targetId) return `op ${index} (move): unknown ref '${op.ref}'`;

      const shape = editor.getShape(targetId);
      if (!shape) return `op ${index} (move): shape not found for '${op.ref}'`;

      const bounds = editor.getShapePageBounds(targetId);
      const w = bounds?.w ?? 100;
      const h = bounds?.h ?? 100;
      const pos = resolveAnchor(editor, op.at, w, h);
      if (!pos) return `op ${index} (move): anchor could not be resolved`;

      editor.updateShape({
        id: targetId,
        type: shape.type,
        x: pos.x,
        y: pos.y,
      });
      return true;
    }

    case "resize": {
      const targetId = resolveRef(editor, op.ref);
      if (!targetId) return `op ${index} (resize): unknown ref '${op.ref}'`;

      const shape = editor.getShape(targetId);
      if (!shape) return `op ${index} (resize): shape not found for '${op.ref}'`;

      if (op.scale) {
        // Scale-based resize
        const bounds = editor.getShapePageBounds(targetId);
        if (bounds) {
          editor.resizeShape(targetId, {
            x: op.scale,
            y: op.scale,
          });
        }
      } else {
        // Direct dimension update — works for geo, image, frame shapes
        const updates: Record<string, unknown> = {};
        if (op.w !== undefined) updates.w = op.w;
        if (op.h !== undefined) updates.h = op.h;

        if (Object.keys(updates).length > 0) {
          editor.updateShape({
            id: targetId,
            type: shape.type,
            props: updates,
          });
        }
      }
      return true;
    }

    case "order": {
      const targetId = resolveRef(editor, op.ref);
      if (!targetId) return `op ${index} (order): unknown ref '${op.ref}'`;

      if (op.to === "front") {
        editor.bringToFront([targetId]);
      } else {
        editor.sendToBack([targetId]);
      }
      return true;
    }

    case "delete": {
      const ids = resolveRefs(editor, op.refs);
      if (ids.length === 0) return `op ${index} (delete): no valid refs`;

      editor.deleteShapes(ids);
      return true;
    }

    case "zoomTo": {
      if (op.refs && op.refs.length > 0) {
        const ids = resolveRefs(editor, op.refs);
        if (ids.length > 0) {
          editor.select(...ids);
          editor.zoomToSelection({ animation: { duration: 320 } });
        }
      } else {
        editor.zoomToFit({ animation: { duration: 320 } });
      }
      return true;
    }

    default: {
      // Exhaustive check — TypeScript fails the build if a case is missing
      const _exhaustive: never = op;
      return `op ${index}: unhandled op kind '${(_exhaustive as { op: string }).op}'`;
    }
  }
}
