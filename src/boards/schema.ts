/**
 * The tldraw schema for per-board multiplayer canvases.
 *
 * Identical to src/roadmap/schema.ts by design: both use default shapes +
 * comment lane records. Kept separate so the boards system can diverge later
 * (e.g. custom shapes for generation cards) without accidentally breaking the
 * roadmap.
 *
 * The same remarks apply here: server and client MUST import from this one
 * file, or schemas mismatch and the socket is refused on connect.
 */
import {
  commentSchemaRecords,
  createTLSchema,
  defaultBindingSchemas,
  defaultShapeSchemas,
} from "@tldraw/tlschema";

/**
 * Record types served through the object-store lane (comment threads).
 * Must be registered on both server (TLSocketRoom) and client (useSync).
 */
export const BOARD_OBJECT_TYPES = ["comment", "comment-thread", "comment-reaction"] as const;

/**
 * Re-exported so the client component imports from here, not @tldraw/tlschema
 * directly — keeps the two ends locked to the same definitions.
 */
export const boardRecords = commentSchemaRecords;

/**
 * Default shapes + bindings, comment records. No custom shapes.
 */
export const boardSchema = createTLSchema({
  shapes: defaultShapeSchemas,
  bindings: defaultBindingSchemas,
  records: commentSchemaRecords,
});
