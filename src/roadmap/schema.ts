/**
 * The single tldraw schema definition shared by the sync client and the sync
 * server (the RoadmapRoom Durable Object).
 *
 * This file exists because tldraw sync validates every incoming change against
 * a schema on BOTH ends, and refuses the WebSocket connection outright if the
 * two disagree. Defining it once and importing it from both sides is the only
 * way to keep that guarantee — a copy-pasted second definition is a connection
 * failure waiting for someone to edit one and not the other.
 *
 * `commentSchemaRecords` is the important part. Comment threads, comments and
 * reactions are NOT in tldraw's default schema; registering them here is what
 * makes the "suggest" access tier possible. They live in the room's
 * object-store lane, which is gated by a per-session `objectAccess`
 * permission that is independent of `isReadonly` — so a visitor can be allowed
 * to comment on the roadmap while being forbidden from moving or deleting a
 * single shape on it. See src/roadmap/access.ts.
 */
import {
  commentSchemaRecords,
  createTLSchema,
  defaultBindingSchemas,
  defaultShapeSchemas,
} from "@tldraw/tlschema";

/**
 * Record types served through the object-store lane rather than the document
 * lane. Lane records persist separately from the document, are excluded from
 * document snapshots, and are permissioned by `objectAccess`.
 *
 * Must be passed to `TLSocketRoom` on the server AND registered on the client,
 * or the two schemas mismatch and the socket is rejected.
 */
export const ROADMAP_OBJECT_TYPES = ["comment", "comment-thread", "comment-reaction"] as const;

/**
 * The same comment record definitions, in the shape each end wants them.
 *
 * The two sides register these differently — `createTLSchema({ records })` on
 * the server, `useSync({ records })` on the client — but it must be the SAME
 * definitions, or the schemas mismatch and the socket is refused. Re-exported
 * from here so neither side imports tlschema directly and they cannot drift.
 */
export const roadmapRecords = commentSchemaRecords;

/**
 * Default shapes and bindings only — no custom shapes.
 *
 * Deliberate: the roadmap board is built out of tldraw's own note (sticky),
 * frame, text, arrow, draw and image shapes. That is the whole point of using
 * tldraw here rather than a bespoke kanban — a person reporting a bug can
 * paste a screenshot, draw an arrow at the broken pixel and stick a note next
 * to it. A custom "RoadmapCard" shape would have to reimplement all of that
 * and would need its own migrations forever after.
 */
export const roadmapSchema = createTLSchema({
  shapes: defaultShapeSchemas,
  bindings: defaultBindingSchemas,
  records: commentSchemaRecords,
});
