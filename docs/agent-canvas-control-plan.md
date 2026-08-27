# Agent canvas control — implementation plan

Give the Doodle AI agent real control of the tldraw canvas on `/c/[id]`: text,
sticky notes, bound arrows, shapes, frames, labels, alt text, names, groups,
alignment and layout — not just "place the image that was generated".

Status: **plan only. No code written yet.** Every file path below is a target,
not an existing file, unless marked *(exists)*.

---

## 1. The constraint that decides the architecture

**The canvas lives in the browser. The agent runs on the server.**

`DoodleCanvas.tsx` *(exists)* persists to IndexedDB via tldraw's
`persistenceKey = doodleai-canvas-<threadId>`. There is no server copy, no D1
row, no Durable Object for the chat canvas. The Mastra agent runs inside the
Cloudflare Worker in `POST /api/chat` *(exists)* and cannot see or touch that
store.

So a naive `readCanvas` tool that "queries the canvas" is impossible without
inventing a round trip. Two workable shapes:

| Option | How | Verdict |
|---|---|---|
| **A. Digest travels with the request** | Client sends a compact scene graph in the `/api/chat` body; it lands in `RequestContext`; the read tool returns it from there | **Chosen.** Zero new infrastructure, one round trip, matches the existing `platformPicxKey` / `styleId` pattern exactly |
| B. Server pulls from a DO | Move the chat canvas onto `BoardRoom`, agent reads/writes via RPC | Correct destination eventually (§11), far too much for phase 1 |

Consequences of choosing A, which the rest of the plan is built around:

- **The agent's view is a snapshot from the start of the turn.** It never sees
  its own edits land.
- **Writes are structured output, not side effects.** `editCanvas` validates an
  op list and returns it. `/api/chat` forwards it on the stream. The client
  applies it. The tool itself touches nothing.
- **Ops must be able to reference refs created earlier in the same batch**, or
  "generate 6 poses then arrange them in a grid" needs two turns. The client
  interpreter resolves refs in order, so a single batch can create *and*
  arrange.

Full loop, one turn, no extra network calls:

```
client ──digest──▶ /api/chat ──RequestContext──▶ agent
                                                  │ readCanvas  (reads digest)
                                                  │ editCanvas  (returns ops)
client ◀──{type:"canvas",ops}── /api/chat ◀────────┘
   │
   └─▶ apply-ops.ts  →  one editor.run() = one undo step
```

---

## 2. Use cases

Each is a real creator workflow the app can already half-do, with the op
sequence that completes it. These are the acceptance tests.

1. **Storyboard from a collage.** User generates 6 poses. → `grid(refs, columns:3)`,
   `label` each `"Beat 1".."Beat 6"`, `addArrow` between consecutive frames,
   `addFrame(title:"Scene 1")` around the lot.
2. **Character sheet.** Avatar + expression sheet. → `addFrame(title:"Riya — character sheet")`,
   `stack` expressions horizontally, `label` each emotion, `setAltText` on each.
3. **Sticker sheet prep.** Sticker-pack output. → `grid` on a print-safe pitch,
   `group` by theme, `rename` groups, `addText` a cut-line note.
4. **Style comparison.** Three variants of one prompt. → `align(refs, 'top')`,
   `stack` horizontally, `addNote` under each with what changed, `addArrow` to
   the winner.
5. **Accessibility pass.** "Describe every image for screen readers." →
   `readCanvas`, then `setAltText` for every image ref. Writes the real
   `imageShapeProps.altText`, so it survives export and is genuinely useful.
   No competitor does this.
6. **Tidy the board.** "Clean this up." → `packShapes` / `grid`, de-overlap,
   `zoomTo` fit.
7. **Feedback annotation.** "Mark what to change." → `addNote` + `addArrow`
   pointing at specific images. Arrows are *bound*, so they follow the image
   when the user drags it.
8. **Mood board sectioning.** "Group these by palette." → `addFrame("Warm")`,
   `addFrame("Cool")`, move refs into frames, `rename`.
9. **Gift card layout.** Gift doodle + caption. → `addText` hand-lettered
   caption below, `align center-horizontal`, `group`.

Note that 1, 3, 4 and 8 are the ones that only work because the agent can
*read* the board first. Cutting `readCanvas` cuts most of the value.

---

## 3. The op lexicon

Semantic, not pixel-level. The client owns all geometry — LLMs are unreliable
at coordinate math and reliable at intent. There is deliberately no `setX/setY`.

Shared source of truth at `src/lib/canvas/ops.ts`, imported by **both** the
Mastra tool and the browser interpreter so the two can never drift. Same
pattern as `doodle-constants.ts` *(exists)*.

```ts
/** Where to put a new shape, relative to something already on the board. */
type Anchor = {
  rightOf?: Ref; leftOf?: Ref; below?: Ref; above?: Ref;
  gap?: number;            // default 28, matches DoodleCanvas GAP
};

type Ref = string;         // human handle, e.g. "boss-avatar", "beat-3"

type CanvasOp =
  // ---- create ----
  | { op: "addText";  ref?: Ref; text: string; at?: Anchor; size?: "s"|"m"|"l"|"xl" }
  | { op: "addNote";  ref?: Ref; text: string; at?: Anchor; color?: Color }
  | { op: "addArrow"; from: Ref; to: Ref; label?: string }
  | { op: "addShape"; ref?: Ref; kind: "rectangle"|"ellipse"|"star"|"diamond"|"triangle";
                      at?: Anchor; w?: number; h?: number; label?: string; color?: Color }
  | { op: "addFrame"; ref?: Ref; title: string; children?: Ref[] }
  // ---- annotate ----
  | { op: "label";      ref: Ref; text: string }      // caption placed under a shape
  | { op: "setAltText"; ref: Ref; altText: string }   // image shapes only
  | { op: "rename";     ref: Ref; name: string }
  // ---- arrange ----
  | { op: "group";      ref?: Ref; children: Ref[]; name?: string }
  | { op: "ungroup";    ref: Ref }
  | { op: "align";      refs: Ref[]; edge: "left"|"right"|"top"|"bottom"
                                        |"center-horizontal"|"center-vertical" }
  | { op: "stack";      refs: Ref[]; axis: "horizontal"|"vertical"; gap?: number }
  | { op: "distribute"; refs: Ref[]; axis: "horizontal"|"vertical" }
  | { op: "grid";       refs: Ref[]; columns: number; gap?: number }
  | { op: "pack";       refs: Ref[]; gap?: number }
  | { op: "move";       ref: Ref; at: Anchor }
  | { op: "resize";     ref: Ref; w?: number; h?: number; scale?: number }
  | { op: "order";      ref: Ref; to: "front"|"back" }
  | { op: "delete";     refs: Ref[] }
  | { op: "zoomTo";     refs?: Ref[] };               // omit refs = fit all
```

### Verified 1:1 mapping onto tldraw 5.3.2

Checked against the installed package, not from memory:

| Op | tldraw API |
|---|---|
| `align` | `editor.alignShapes(shapes, 'left'\|'right'\|'top'\|'bottom'\|'center-horizontal'\|'center-vertical')` |
| `stack` | `editor.stackShapes(shapes, 'horizontal'\|'vertical', gap?)` |
| `distribute` | `editor.distributeShapes(shapes, axis)` |
| `pack` | `editor.packShapes(shapes, gap?)` |
| `group` / `ungroup` | `editor.groupShapes(shapes, opts?)` / `editor.ungroupShapes(ids, opts?)` |
| `order` | `editor.bringToFront(shapes)` / `editor.sendToBack(shapes)` |
| `addText` / `addNote` | `text` / `note` shape — **`props.richText` via `toRichText(str)`, NOT `props.text`** |
| `addShape` | `geo` shape, `props.geo = kind`, label via `richText` |
| `addFrame` | `frame` shape, `props.name = title` |
| `addArrow` | `arrow` shape + `editor.createBindings([{ type:'arrow', fromId, toId, props:{ terminal:'start'\|'end', normalizedAnchor, isExact, isPrecise, snap } }])` |
| `setAltText` | `imageShapeProps.altText` — a real prop, confirmed present |
| `rename` | `shape.meta.ref` / `meta.name` |
| batch | `editor.markHistoryStoppingPoint('agent edit')` then one `editor.run()` |

`props.text` on text/note shapes is the exact schema violation that produced
the `ValidationError` crashes on this project before. The interpreter must use
`toRichText()` and nothing else.

### `addArrow` must bind, not draw

An arrow written as two fixed points is decoration that breaks the moment the
user drags an image. Binding records make it track. This is the difference
between a demo and a tool.

---

## 4. The read model

`readCanvas` returns the digest the client sent:

```ts
interface CanvasDigest {
  shapes: Array<{
    ref: Ref;                 // from meta.ref; auto-assigned if absent
    type: "image"|"text"|"note"|"arrow"|"geo"|"frame"|"group"|"draw";
    label?: string;           // richText flattened to plain text
    altText?: string;
    x: number; y: number; w: number; h: number;
    groupRef?: string;
    author?: "user"|"agent";
  }>;
  count: number;              // true total before truncation
  truncated: boolean;
  camera: { zoom: number };
}
```

Rules:

- Capped at **60 shapes**, largest-area first, then `truncated: true`. A
  200-shape board must not blow the context window.
- `richText` flattened to plain text — the agent never sees ProseMirror JSON.
- Coordinates rounded to integers.
- Every shape gets a `ref`. Images generated by a skill get a meaningful one
  (`doodle-avatar-1`); anything else gets `<type>-<n>`.

---

## 5. Files

### New

| Path | Responsibility |
|---|---|
| `src/lib/canvas/ops.ts` | Zod schema + TS types for `CanvasOp`, `Anchor`, `CanvasDigest`. Imported by server tool and browser interpreter. **The anti-drift file.** |
| `src/mastra/tools/canvas-read.ts` | `readCanvas` — returns the digest out of `RequestContext`. No IO. |
| `src/mastra/tools/canvas-edit.ts` | `editCanvas` — validates ops against the zod schema, caps count, returns `{ status:"ok", ops, applied:n }` or `{ status:"rejected", errors }`. No IO. |
| `src/components/app/canvas/apply-ops.ts` | The interpreter. Ops → tldraw calls, single undo step, per-op error isolation. |
| `src/components/app/canvas/refs.ts` | `ref` ↔ `TLShapeId` resolution via `shape.meta`, plus auto-ref assignment. |
| `src/components/app/canvas/digest.ts` | Builds `CanvasDigest` from the live editor; debounced writer to `window.__doodleCanvasDigest`. |

### Changed *(all exist)*

| Path | Change |
|---|---|
| `src/mastra/agents/doodle-agent.ts` | Register both tools; add the operator-instruction section (§7) |
| `src/pages/api/chat.ts` | Add `{ type:"canvas"; ops; label? }` to `StreamEvent`; accept `canvas` digest in the body; put it in `RequestContext`; emit ops from the `tool-result` branch alongside the existing `isDoodleTool` handling |
| `src/scripts/app/chat/api-turn.ts` | Send `canvas: window.__doodleCanvasDigest` in the request body; handle the `canvas` stream event |
| `src/scripts/app/chat/canvas.ts` | `pushCanvasOps(ops)` — dispatch + backlog, mirroring `pushToCanvas` |
| `src/components/app/DoodleCanvas.tsx` | Listen for `doodleai:canvas-ops`; publish the digest; assign refs on placement |

### Why the window bridge again

`api-turn.ts` is vanilla TS and must never import React. The existing
`window.__doodleCanvasQueue` bridge is the established pattern here; the digest
and ops channels follow it exactly (`__doodleCanvasDigest`,
`doodleai:canvas-ops`).

**The pre-hydration trap applies again.** The island is ~1 MB and reliably
mounts *after* the first events arrive — that is the documented bug that left
boards empty. The ops channel needs the same backlog-and-drain treatment, or
the first agent edit of every session is silently dropped.

---

## 6. Not a SKILL.md package

Tempting, wrong. `src/lib/skill-loader.ts` *(exists)* requires every SKILL.md
to carry `metadata.id` drawn from `GENERATION_MODES`, plus `requiresPhoto`,
`aspectRatio`, `sampleIndex`, `category` and `order`. Runnable skills are
attached to the agent **and** published into the UI marketplace, the `/` picker
and the sitemap. A canvas capability has no generation mode and must not appear
as a doodle style.

So phase 1 is **tools + a prompt section**.

If the instruction block later grows past ~80 lines, the clean move is to
extend the loader with a `kind: "capability"` skill type that attaches to the
agent and is excluded from the catalog. That is a loader + build-validation
change and is explicitly deferred.

---

## 7. Operator instructions

New section for `doodleAgent.instructions`. Written to sit alongside the
existing "How a turn works" block.

```
## The canvas

The right-hand panel is a live infinite canvas the user can see and edit. You can
edit it too, with readCanvas and editCanvas.

When to touch it:
- The user asks for arrangement, labelling, grouping, annotation or tidying.
- Immediately after you generate MULTIPLE images, where a layout obviously helps
  (a collage, a sticker pack, a pose set). Arrange them, do not just leave a pile.
- The user asks what is on the canvas.

When to leave it alone:
- A single-image generation. Placing it is already automatic. Do not decorate.
- The user is talking about something else. Never edit the canvas unprompted.

How:
1. Call readCanvas FIRST whenever you are arranging, moving, grouping or
   labelling existing work. You cannot arrange what you have not looked at.
2. Call editCanvas ONCE per turn with every op batched together. One call is one
   undo step for the user; five calls are five, which is hostile.
3. Address shapes by their `ref` only. Never invent a ref. Use refs from
   readCanvas, or refs you assign in the same batch — later ops in a batch can
   reference earlier ones.
4. Place things with `at` anchors (below, rightOf), never raw coordinates.
5. Say in ONE short sentence what you changed. Never list the ops.

Hard rules:
- NEVER `delete` unless the user explicitly asked to remove something.
- Max 40 ops per turn. If the job is bigger, do the most valuable part and say
  what is left.
- If editCanvas returns `rejected`, tell the user plainly what could not be done.
  Do not retry the same batch.
- The canvas may be closed or unavailable. Ops still queue, so proceed normally
  and do not apologise for it.
```

Design notes:
- "readCanvas FIRST" is stated as a hard sequence because the model will
  otherwise arrange from imagination.
- "editCanvas ONCE" is the undo-granularity rule, expressed as a user-empathy
  rule so it survives prompt compression.
- The multi-image trigger is what makes the feature *discoverable*. Users will
  not read docs; the agent tidying a 6-pose collage unprompted is the demo.

---

## 8. Failure modes

Silent failure is the thing to design out. The license bug hid a total canvas
outage in production for weeks precisely because nothing surfaced.

| Failure | Handling |
|---|---|
| Unknown `ref` | Skip that op, continue the batch, return the skipped refs to the agent so it can self-correct next turn. Never throw. |
| tldraw validation error | Isolate per op inside the batch. One `console.error`, one user-facing toast ("Some canvas edits couldn't be applied"). The rest of the batch still lands. |
| Island not mounted yet | Queue in the backlog, drain on mount. Same as images. |
| Canvas panel closed | Ops apply to the store anyway; the user sees them on reopen. Do not force the panel open. |
| Mobile | The canvas cannot be opened at all today (`.whiteboard-toggle { display:none }` at ≤860px + `initMobileCanvas` forcing it closed). Ops must queue, not vanish. **This is a prerequisite, not a nice-to-have — see §11.** |
| Over the 40-op cap | Truncate, apply the first 40, tell the agent it was truncated. |
| Agent loops on canvas edits | Rate-limit canvas ops per thread per minute, reusing the `kvIncrement` helper already used for generation limits. Canvas ops cost no credits, so nothing else throttles them. |
| No tldraw license in prod | The editor self-destructs 5 s after mount. Ops must no-op gracefully rather than throw against a dead editor. |
| Digest missing from request | `readCanvas` returns `{ shapes: [], count: 0 }`; the agent is told the canvas is empty rather than erroring. |

---

## 9. Guardrails

1. **One undo step per turn.** `markHistoryStoppingPoint` + one `editor.run()`.
2. **Zod at the tool boundary.** A hallucinated prop is rejected server-side,
   before it can reach the store.
3. **40 ops per turn, 60 shapes per digest, rate-limited per thread.**
4. **`meta.author = "agent"`** on everything the agent creates. Buys a visible
   "Agent edited this — revert" affordance and lets the digest tell the agent
   what is its own work.
5. **Destructive ops require explicit user intent**, enforced in the prompt and
   worth a client-side confirmation for `delete` batches over ~5 shapes.
6. **Canvas ops never charge credits.** No PicX call happens. Verify no
   accidental `spend()` path.

---

## 10. Phases

**Phase 1 — annotation.** `ops.ts`, both tools, interpreter, ref layer, digest,
transport, operator instructions. Ops: `addText`, `addNote`, `addArrow`,
`label`, `setAltText`, `rename`, `zoomTo`.
*Done when:* "label each of these poses and describe them for screen readers"
works end to end, lands as one undo step, and use cases 5 and 7 pass.

**Phase 2 — arrangement.** `align`, `stack`, `distribute`, `grid`, `pack`,
`group`, `ungroup`, `addFrame`, `addShape`, `move`, `resize`, `order`, `delete`.
*Done when:* use cases 1, 3, 4 and 8 pass, and arrows stay attached after the
user drags an image.

**Phase 3 — product surface.** Revert-agent-changes affordance, the toast path,
a small set of one-tap prompts on the canvas ("Tidy", "Label all", "Storyboard").
*Done when:* a new user discovers the feature without being told.

**Phase 4 — synced boards.** Same lexicon applied server-side through
`BoardRoom.updateStore`. `src/boards/drop-item.ts` *(exists)* already proves
that path works for images.
*Done when:* an agent-arranged board is shareable and survives a device switch.

---

## 11. Decisions needed before phase 1

1. **Local-only persistence.** The chat canvas is IndexedDB, per browser. An
   agent-arranged storyboard is invisible on another device and unshareable.
   Phase 4 is what makes this a real creator feature rather than a party trick.
   Build phase 1 on the local canvas and migrate, or go straight to boards?
   *Recommendation: local first — the lexicon is transport-agnostic by design,
   so phase 4 reuses it wholesale.*
2. **Mobile.** There is currently no way to open the canvas at all below 860px.
   Shipping agent canvas control while mobile users cannot see a canvas means
   the agent will silently arrange a board half the audience cannot open.
   *Recommendation: fix the mobile toggle first. It is a small change and it
   gates the value of everything here.*
3. **Model.** `google/gemini-3.7-flash` doing read → reason → emit 20 ops is a
   stretch. The semantic lexicon exists to reduce that load, but phase 2 may
   need a stronger model on the arrangement path.
   *Recommendation: build phase 1 on flash, measure op-validity rate, then
   decide. Do not pre-emptively upgrade.*
4. **Production license.** `licenseKey:void 0` is live right now, so the canvas
   self-destructs 5 s after mount for every real user. Nothing in this plan is
   visible until the build variable lands.

---

## 12. Out of scope

- Multiplayer cursors / presence on the chat canvas.
- Agent-authored freehand `draw` strokes (no sane semantic vocabulary).
- Agent editing image *pixels* — that is `generateDoodle`'s job.
- Migrating the chat canvas off IndexedDB (phase 4 decision, not phase 1).
- Extending the skill loader with a `capability` kind (§6).
