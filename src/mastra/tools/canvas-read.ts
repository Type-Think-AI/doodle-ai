import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { canvasDigestSchema, EMPTY_DIGEST } from "../../lib/canvas/ops";

/**
 * Read-only view of the canvas. The digest arrives via RequestContext (built by
 * the browser at the start of the turn, sent in the /api/chat body, stashed in
 * context before the agent runs). This tool never reaches the network — the
 * board state is already in-memory by the time the model calls it.
 *
 * Why it cannot throw: the canvas may be closed, the digest may not have been
 * attached (older client, mobile where the panel doesn't exist), or the board
 * may genuinely be empty. All three should look like "nothing on the canvas"
 * to the model rather than a hard error that derails the conversation.
 */
export const canvasReadTool = createTool({
  id: "readCanvas",
  description:
    "Look at what is currently on the canvas. Must be called before arranging, " +
    "moving, grouping, or labelling existing shapes — you cannot arrange what " +
    "you have not looked at.",
  inputSchema: z.object({}),
  outputSchema: canvasDigestSchema,
  execute: async (_input, toolContext) => {
    const requestContext = toolContext?.requestContext as
      | { get(key: string): unknown }
      | undefined;

    const raw = requestContext?.get("canvasDigest");

    // Graceful fallback: if the digest is missing or doesn't parse, report an
    // empty board. The model can still proceed (e.g. creating new shapes).
    const parsed = canvasDigestSchema.safeParse(raw);
    if (parsed.success) return parsed.data;

    return EMPTY_DIGEST;
  },
});
