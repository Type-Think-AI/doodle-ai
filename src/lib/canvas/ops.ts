/* The canvas op contract — the single source of truth for agent canvas control.
 *
 * Imported by BOTH sides of the wire, deliberately:
 *   - src/mastra/tools/canvas-edit.ts   (Worker) validates what the model emits
 *   - src/components/app/canvas/apply-ops.ts (browser) applies it to tldraw
 *
 * Keeping one module means the model's schema and the interpreter can never
 * drift. If an op is added here and not handled there, TypeScript's exhaustive
 * switch fails the build rather than silently dropping the op at runtime.
 *
 * Hard rule: this file stays pure. No DOM, no tldraw import, no Node built-ins
 * — it has to load in the Cloudflare Worker and in the browser island alike.
 * The tldraw-shaped values below are mirrored from @tldraw/tlschema 5.3.2 as
 * plain string literals rather than imported, so the Worker bundle never pulls
 * in tldraw (~1MB, browser-only).
 *
 * See docs/agent-canvas-control-plan.md for why the ops are semantic rather
 * than coordinate-based: the model supplies intent, the client owns geometry.
 */

import { z } from "zod";

/* ---- Limits ----
 *
 * These are guardrails against a looping model, not style preferences.
 * MAX_OPS_PER_BATCH also protects undo: the whole batch becomes ONE history
 * entry, so an oversized batch would make a single Cmd+Z undo far more than
 * the user expects. */

/** Ops the model may emit in one turn. Excess is truncated, not rejected. */
export const MAX_OPS_PER_BATCH = 40;
/** Shapes described to the model in one digest. Largest-area first. */
export const MAX_DIGEST_SHAPES = 60;
/** Default spacing, matching DoodleCanvas.tsx's GAP so agent and auto-flow agree. */
export const DEFAULT_GAP = 28;

/* ---- Mirrored tldraw enums ----
 *
 * Verified against @tldraw/tlschema 5.3.2. An invalid value here throws a
 * ValidationError deep inside tldraw's store, which is precisely the failure
 * this project already hit once (note shapes with props.text instead of
 * props.richText). Validating at the tool boundary keeps that class of bug
 * server-side, where it is a rejected op rather than a dead canvas. */

/** DefaultColorStyle values. */
export const CANVAS_COLORS = [
  "black", "grey", "light-violet", "violet", "blue", "light-blue",
  "yellow", "orange", "green", "light-green", "light-red", "red", "white",
] as const;

/** DefaultSizeStyle values. */
export const CANVAS_SIZES = ["s", "m", "l", "xl"] as const;

/** DefaultFillStyle values. */
export const CANVAS_FILLS = ["none", "semi", "solid", "pattern", "fill", "lined-fill"] as const;

/** Curated subset of GeoShapeGeoStyle. tldraw accepts 20 kinds; offering the
 *  model all of them measurably hurts selection accuracy for no real gain, so
 *  this is the set that covers actual annotation and layout work. */
export const CANVAS_GEO_KINDS = [
  "rectangle", "ellipse", "triangle", "diamond", "star",
  "hexagon", "oval", "heart", "x-box", "check-box",
] as const;

export const colorSchema = z.enum(CANVAS_COLORS);
export const sizeSchema = z.enum(CANVAS_SIZES);
export const fillSchema = z.enum(CANVAS_FILLS);
export const geoKindSchema = z.enum(CANVAS_GEO_KINDS);

/* ---- Refs ----
 *
 * The model never sees a tldraw id. `shape:a1b2c3` is unguessable and
 * unstable, so the model would hallucinate one every time. Instead every shape
 * carries a human handle in `shape.meta.ref` and the model addresses that.
 *
 * The pattern is enforced so a model cannot smuggle a whole sentence in as a
 * ref and make the digest unreadable on the next turn. */
export const refSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "refs are lowercase letters, digits and hyphens")
  .describe("A shape handle, e.g. 'boss-avatar' or 'beat-3'. Use one from readCanvas, or one you assign earlier in this same batch.");

/* ---- Anchors ----
 *
 * Relative placement instead of x/y. Language models are unreliable at
 * coordinate arithmetic and reliable at "under that one", so the client
 * resolves anchors against live shape bounds. An op with no anchor falls
 * through to the auto-flow slot logic already in DoodleCanvas.tsx. */
export const anchorSchema = z
  .object({
    rightOf: refSchema.optional(),
    leftOf: refSchema.optional(),
    below: refSchema.optional(),
    above: refSchema.optional(),
    gap: z.number().min(0).max(400).optional().describe(`Pixels of separation. Defaults to ${DEFAULT_GAP}.`),
  })
  .describe("Where to place this, relative to an existing shape. Omit to let the canvas choose a free slot.");

/* ---- Ops ----
 *
 * Grouped create / annotate / arrange. `ref` on a create op is optional: when
 * the model supplies one it can refer back to the shape later in the same
 * batch, which is what makes "generate six poses then grid them" a single turn
 * instead of two. */

const addText = z.object({
  op: z.literal("addText"),
  ref: refSchema.optional(),
  text: z.string().min(1).max(500),
  at: anchorSchema.optional(),
  size: sizeSchema.optional(),
  color: colorSchema.optional(),
});

const addNote = z.object({
  op: z.literal("addNote"),
  ref: refSchema.optional(),
  text: z.string().min(1).max(500),
  at: anchorSchema.optional(),
  color: colorSchema.optional(),
}).describe("A sticky note. Use for commentary about the work, not for captions — captions are `label`.");

const addArrow = z.object({
  op: z.literal("addArrow"),
  ref: refSchema.optional(),
  from: refSchema,
  to: refSchema,
  label: z.string().max(120).optional(),
}).describe("An arrow BOUND to both shapes, so it follows them when the user drags either one.");

const addShape = z.object({
  op: z.literal("addShape"),
  ref: refSchema.optional(),
  kind: geoKindSchema,
  at: anchorSchema.optional(),
  w: z.number().min(8).max(4000).optional(),
  h: z.number().min(8).max(4000).optional(),
  label: z.string().max(200).optional(),
  color: colorSchema.optional(),
  fill: fillSchema.optional(),
});

const addFrame = z.object({
  op: z.literal("addFrame"),
  ref: refSchema.optional(),
  title: z.string().min(1).max(120),
  children: z.array(refSchema).max(60).optional().describe("Shapes to enclose. The frame sizes itself around them."),
});

const label = z.object({
  op: z.literal("label"),
  ref: refSchema,
  text: z.string().min(1).max(200),
}).describe("A caption placed directly beneath a shape. The usual way to name a generated doodle.");

const setAltText = z.object({
  op: z.literal("setAltText"),
  ref: refSchema,
  altText: z.string().min(1).max(500),
}).describe("Screen-reader description for an image or video shape. Survives export. Ignored for other shape types.");

const rename = z.object({
  op: z.literal("rename"),
  ref: refSchema,
  name: refSchema,
}).describe("Change a shape's handle so later turns can address it meaningfully.");

const group = z.object({
  op: z.literal("group"),
  ref: refSchema.optional(),
  children: z.array(refSchema).min(2).max(60),
  name: z.string().max(120).optional(),
});

const ungroup = z.object({ op: z.literal("ungroup"), ref: refSchema });

const align = z.object({
  op: z.literal("align"),
  refs: z.array(refSchema).min(2).max(60),
  edge: z.enum(["left", "right", "top", "bottom", "center-horizontal", "center-vertical"]),
});

const stack = z.object({
  op: z.literal("stack"),
  refs: z.array(refSchema).min(2).max(60),
  axis: z.enum(["horizontal", "vertical"]),
  gap: z.number().min(0).max(400).optional(),
});

const distribute = z.object({
  op: z.literal("distribute"),
  refs: z.array(refSchema).min(3).max(60),
  axis: z.enum(["horizontal", "vertical"]),
});

const grid = z.object({
  op: z.literal("grid"),
  refs: z.array(refSchema).min(2).max(60),
  columns: z.number().int().min(1).max(12),
  gap: z.number().min(0).max(400).optional(),
}).describe("Lay shapes out in reading order, wrapping after `columns`. The storyboard workhorse.");

const pack = z.object({
  op: z.literal("pack"),
  refs: z.array(refSchema).min(2).max(60),
  gap: z.number().min(0).max(400).optional(),
}).describe("Tidy shapes into a compact cluster without imposing a grid.");

const move = z.object({ op: z.literal("move"), ref: refSchema, at: anchorSchema });

const resize = z.object({
  op: z.literal("resize"),
  ref: refSchema,
  w: z.number().min(8).max(4000).optional(),
  h: z.number().min(8).max(4000).optional(),
  scale: z.number().min(0.1).max(10).optional(),
});

const order = z.object({ op: z.literal("order"), ref: refSchema, to: z.enum(["front", "back"]) });

const remove = z.object({
  op: z.literal("delete"),
  refs: z.array(refSchema).min(1).max(60),
}).describe("Destructive. Only ever emit this when the user explicitly asked to remove something.");

const zoomTo = z.object({
  op: z.literal("zoomTo"),
  refs: z.array(refSchema).max(60).optional().describe("Omit to fit the whole board."),
});

export const canvasOpSchema = z.discriminatedUnion("op", [
  addText, addNote, addArrow, addShape, addFrame,
  label, setAltText, rename,
  group, ungroup, align, stack, distribute, grid, pack,
  move, resize, order, remove, zoomTo,
]);

export const canvasBatchSchema = z.array(canvasOpSchema).min(1).max(MAX_OPS_PER_BATCH);

export type CanvasOp = z.infer<typeof canvasOpSchema>;
export type CanvasOpKind = CanvasOp["op"];
export type Anchor = z.infer<typeof anchorSchema>;
export type CanvasColor = (typeof CANVAS_COLORS)[number];

/* ---- Digest ----
 *
 * What the model is told about the board. Built in the browser and sent up with
 * the chat request, because the chat canvas is IndexedDB-only — there is no
 * server copy for a tool to read. See §1 of the plan doc.
 *
 * `richText` is flattened to plain `label` here on purpose: the model has no
 * business seeing ProseMirror JSON, and it would cost a lot of context. */
export const digestShapeSchema = z.object({
  ref: refSchema,
  type: z.enum(["image", "video", "text", "note", "arrow", "geo", "frame", "group", "draw", "other"]),
  label: z.string().optional(),
  altText: z.string().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  groupRef: refSchema.optional(),
  author: z.enum(["user", "agent"]).optional(),
});

export const canvasDigestSchema = z.object({
  shapes: z.array(digestShapeSchema).max(MAX_DIGEST_SHAPES),
  /** True total before truncation, so the model knows it is seeing a subset. */
  count: z.number().int().min(0),
  truncated: z.boolean(),
  camera: z.object({ zoom: z.number() }).optional(),
});

export type CanvasDigestShape = z.infer<typeof digestShapeSchema>;
export type CanvasDigest = z.infer<typeof canvasDigestSchema>;

/** An empty board. Returned when no digest reached the Worker, so the read tool
 *  reports "nothing on the canvas" instead of erroring. */
export const EMPTY_DIGEST: CanvasDigest = { shapes: [], count: 0, truncated: false };

/* ---- Validation ---- */

export interface BatchValidation {
  /** Ops that passed, in order, capped at MAX_OPS_PER_BATCH. */
  ops: CanvasOp[];
  /** Human-readable rejections, fed back to the model so it can self-correct. */
  errors: string[];
  /** True when ops were dropped for exceeding the cap. */
  truncated: boolean;
}

/**
 * Validate a model-supplied op list, keeping the good ops rather than failing
 * the whole batch.
 *
 * Partial success is the right behaviour here: one malformed op out of twenty
 * should not cost the user the other nineteen, and returning the specific
 * rejections lets the agent fix just those on its next turn.
 */
export function validateBatch(raw: unknown): BatchValidation {
  if (!Array.isArray(raw)) return { ops: [], errors: ["ops must be an array"], truncated: false };

  const ops: CanvasOp[] = [];
  const errors: string[] = [];

  for (const [i, candidate] of raw.entries()) {
    if (ops.length >= MAX_OPS_PER_BATCH) break;
    const parsed = canvasOpSchema.safeParse(candidate);
    if (parsed.success) {
      ops.push(parsed.data);
      continue;
    }
    const kind =
      candidate && typeof candidate === "object" && "op" in candidate
        ? String((candidate as { op: unknown }).op)
        : "unknown";
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    errors.push(`op ${i} (${kind}) rejected — ${detail}`);
  }

  return { ops, errors, truncated: raw.length > MAX_OPS_PER_BATCH };
}

/**
 * One-line description of a batch, for the stream event's `label` and for the
 * activity affordance. Deliberately terse — it is UI copy, not a log.
 */
export function summarizeOps(ops: CanvasOp[]): string {
  if (!ops.length) return "no canvas changes";
  const counts = new Map<CanvasOpKind, number>();
  for (const op of ops) counts.set(op.op, (counts.get(op.op) ?? 0) + 1);
  return [...counts.entries()].map(([kind, n]) => (n > 1 ? `${kind} ×${n}` : kind)).join(", ");
}
