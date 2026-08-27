/* Where a finished generation lands.
 *
 * This is the fix for the defect that made the old Projects feature unusable:
 * there was no path from "I made a doodle" to "it is in a container". The only
 * way in was pasting a CDN URL into a text field, so containers stayed empty,
 * so nothing inside them was ever exercised.
 *
 * Now every generation lands somewhere with no user action at all:
 *   - default: the caller's Inbox (an undeletable system board)
 *   - if the chat was opened from a board (?board=<id>), that board instead
 *
 * Curation becomes additive rather than a prerequisite.
 */
import { addItem, INBOX } from "./boards-api";
import { enqueue, isSignedIn } from "./api-client";

/**
 * The board this session should write to.
 *
 * Read from the URL each time rather than cached at import: the chat is a
 * long-lived page and history navigation can change the target underneath us.
 */
export function targetBoardId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get("board")?.trim();
    return explicit || INBOX;
  } catch {
    return INBOX;
  }
}

/**
 * Record a generated image on the target board.
 *
 * Fire-and-forget through the shared serial queue so it never blocks painting
 * the result, and a no-op when signed out (boards are account-scoped; the
 * local moodboard mirror still covers that case).
 *
 * Adding the same URL twice is a server-side no-op, so re-renders are safe.
 */
export function landOnBoard(url: string, generationId?: string): void {
  if (!isSignedIn()) return;
  const boardId = targetBoardId();
  enqueue(() => addItem(boardId, url, { kind: "generation", generationId }));
}
