/**
 * Server-side helper: place a finished generation image onto a board's canvas
 * WITHOUT a client WebSocket connection.
 *
 * This is the board equivalent of `RoadmapRoom.addFeedbackNote` — it calls
 * `dropImage` RPC on the BoardRoom Durable Object, which in turn calls
 * `updateStore`. That bypasses the record authorizers entirely (documented in
 * authorize.ts), which is exactly what makes this work: no user session
 * needed, no ownership to fake.
 *
 * Called from the generation completion path when the target board has
 * `viewMode: 'canvas'` or when a user explicitly drops a grid item onto the
 * canvas view.
 *
 * IMPORTANT: Generated doodles are permanent PicX CDN URLs. They need NO R2
 * write. This helper passes the CDN URL directly to the DO, which stores it
 * as a tldraw asset `src`. Only user-uploaded reference images (via the asset
 * route) need R2.
 */

import type { BoardRoom } from "./BoardRoom";

interface DropImageParams {
  /** The BOARD_ROOM DurableObjectNamespace binding from env. */
  boardRoomNs: DurableObjectNamespace<BoardRoom>;
  /** The board's id — used as the DO name to derive the instance id. */
  boardId: string;
  /** PicX CDN URL of the generated image. */
  url: string;
  /** Intrinsic width in pixels. */
  width: number;
  /** Intrinsic height in pixels. */
  height: number;
  /** A stable dedupe key for the tldraw asset record. Use the boardItem id
   *  or the generation id — anything that prevents the same image from being
   *  placed twice on a page refresh. */
  assetId: string;
}

/**
 * Place an image onto a board's tldraw canvas via the BoardRoom DO's RPC.
 *
 * Idempotency: tldraw's `store.put` with a deterministic asset id is a
 * last-write-wins upsert, so calling this twice with the same assetId
 * replaces the asset (a no-op if the URL hasn't changed) rather than
 * duplicating it.
 */
export async function dropImageOnBoard(params: DropImageParams): Promise<void> {
  const { boardRoomNs, boardId, url, width, height, assetId } = params;

  const stub = boardRoomNs.get(boardRoomNs.idFromName(boardId));

  // RPC call to the DO — see BoardRoom.dropImage().
  // Type assertion: Cloudflare's typed stubs expose class methods as RPC.
  await stub.dropImage(url, width, height, assetId);
}
