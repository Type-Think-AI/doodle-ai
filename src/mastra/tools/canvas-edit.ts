import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { canvasBatchSchema, validateBatch, summarizeOps } from "../../lib/canvas/ops";

/**
 * Validates a batch of canvas ops and returns them for the client to apply.
 *
 * THIS TOOL APPLIES NOTHING. It runs server-side on the Cloudflare Worker, and
 * the canvas lives in the browser's IndexedDB. The stream handler in
 * /api/chat.ts forwards the validated ops to the client as a `canvas` event;
 * the client's apply-ops.ts applies them inside a single editor.run() — one
 * undo step. This split is the defining constraint of the architecture (see
 * docs/agent-canvas-control-plan.md §1) and the single most confusing thing
 * about this design.
 *
 * Partial success is intentional: one malformed op out of twenty should not
 * cost the user the other nineteen. validateBatch keeps good ops and returns
 * per-op rejection reasons so the agent can self-correct on its next turn.
 */

const editOutputSchema = z.union([
  z.object({
    status: z.literal("ok"),
    ops: canvasBatchSchema,
    label: z.string(),
    applied: z.number(),
    truncated: z.boolean(),
    skipped: z.array(z.string()),
  }),
  z.object({
    status: z.literal("rejected"),
    errors: z.array(z.string()),
  }),
]);

export const canvasEditTool = createTool({
  id: "editCanvas",
  description:
    "Submit a batch of canvas operations — add shapes, labels, notes, arrows; " +
    "arrange, group, align, grid existing shapes; set alt text. Call ONCE per " +
    "turn with every op together (one call = one undo step for the user). The " +
    "ops are validated here and applied by the browser — this tool does not " +
    "touch the canvas directly.",
  inputSchema: z.object({
    ops: canvasBatchSchema,
    note: z
      .string()
      .max(200)
      .optional()
      .describe("Optional one-line note about what this batch does, shown in the activity feed."),
  }),
  outputSchema: editOutputSchema,
  execute: async (input) => {
    const result = validateBatch(input.ops);

    // Zero surviving ops means the whole batch was malformed — report rejection
    // so the model knows not to retry the same payload.
    if (result.ops.length === 0) {
      return {
        status: "rejected" as const,
        errors: result.errors.length > 0 ? result.errors : ["No valid ops in the batch."],
      };
    }

    return {
      status: "ok" as const,
      ops: result.ops,
      label: summarizeOps(result.ops),
      applied: result.ops.length,
      truncated: result.truncated,
      skipped: result.errors,
    };
  },
});
