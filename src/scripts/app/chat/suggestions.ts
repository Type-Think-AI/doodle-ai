/* Related Prompts — turn the agent's trailing numbered follow-ups into chips.
 *
 * The agent is instructed (src/mastra/agents/doodle-agent.ts) to end every
 * successful generation with exactly 3 short follow-ups as a numbered list:
 * one Variation, one Upgrade, one Refine. Before this module existed that list
 * was rendered as part of the bubble's plain text, so the user had to RETYPE a
 * suggestion the model had already written and we had already paid for.
 *
 * This is Nielsen's "Related Prompts" prompt-augmentation pattern; Perplexity
 * reported engagement doubling after shipping the equivalent feature.
 * https://jakobnielsenphd.substack.com/p/prompt-augmentation
 *
 * Parsing is deliberately CONSERVATIVE. A false positive is worse than a miss:
 * eating real prose out of the reply loses information the user needs, while a
 * miss just leaves the old plain-text behaviour. Every guard below exists to
 * make that trade in the safe direction — see `parseSuggestions`.
 */

/** The agent is told to emit exactly 3. Accept 2 as well; never more. */
const MIN_SUGGESTIONS = 2;
const MAX_SUGGESTIONS = 3;

/**
 * Above this, the "suggestion" is really a paragraph that happens to be
 * numbered (a numbered explanation, a spec, a list of caveats). Bail out and
 * keep it as prose rather than stuffing it into a chip.
 */
const MAX_LABEL_CHARS = 140;

export interface ParsedReply {
  /** The reply with the trailing suggestion list removed. */
  body: string;
  /** Full suggestion texts, in the order the agent listed them. */
  suggestions: string[];
}

/** Strip the light markdown the model sometimes adds and collapse whitespace. */
function clean(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split an assistant reply into prose plus its trailing numbered suggestions.
 *
 * Returns `suggestions: []` (and `body` untouched) unless ALL of these hold:
 *   - the last non-blank lines are a contiguous run of `N. text` / `N) text`
 *   - there are 2 or 3 of them
 *   - they are numbered 1..N in order (so a stray "2." mid-prose is ignored)
 *   - none is longer than MAX_LABEL_CHARS (that would be prose, not a chip)
 *   - something remains as prose above them (never swallow the whole reply)
 */
export function parseSuggestions(content: string): ParsedReply {
  const original = { body: content, suggestions: [] as string[] };
  if (!content || !content.includes("\n")) return original;

  const lines = content.split("\n");

  // Ignore trailing blank lines so a reply ending in "\n\n" still parses.
  let end = lines.length - 1;
  while (end >= 0 && lines[end]!.trim() === "") end--;
  if (end < 0) return original;

  // Walk upward while the lines keep looking like numbered list items. A blank
  // line or any non-matching line ends the run — the list must be contiguous
  // and must be the very last thing in the reply.
  const reversed: { n: number; text: string }[] = [];
  let i = end;
  for (; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (line === "") break;
    const match = /^(\d{1,2})[.)]\s+(.*\S)$/.exec(line);
    if (!match) break;
    const text = clean(match[2]!);
    if (!text || text.length > MAX_LABEL_CHARS) return original;
    reversed.push({ n: Number(match[1]), text });
    // One more than the cap means the model wrote a longer list than the
    // suggestion contract describes; treat it as prose.
    if (reversed.length > MAX_SUGGESTIONS) return original;
  }

  if (reversed.length < MIN_SUGGESTIONS) return original;

  const items = reversed.reverse();
  // Must read 1, 2, 3 — this is what separates a real suggestion block from a
  // fragment of some longer list whose earlier items scrolled past our run.
  const numbered = items.every((item, idx) => item.n === idx + 1);
  if (!numbered) return original;

  const body = lines.slice(0, i + 1).join("\n").trim();
  // A reply that is ONLY a numbered list is an answer in list form, not a
  // result plus follow-ups. Leave it alone.
  if (!body) return original;

  return { body, suggestions: items.map((item) => item.text) };
}

/**
 * Build the chip row. Returns null when there is nothing to show, so callers
 * can append unconditionally.
 *
 * The chip's visible label is CSS-truncated but the full text is what gets
 * sent — a clipped label must never become a clipped prompt.
 */
export function renderSuggestions(
  suggestions: string[],
  onPick: (text: string) => void,
): HTMLElement | null {
  if (suggestions.length === 0) return null;

  const row = document.createElement("div");
  row.className = "chat-suggestions";
  // Announced as a group so screen-reader users hear these as offered options
  // rather than as three unrelated buttons after the reply.
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Suggested next steps");

  suggestions.forEach((text) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chat-suggestion";
    chip.textContent = text;
    // Full text for the tooltip and for the send path, independent of clipping.
    chip.title = text;
    chip.addEventListener("click", () => onPick(text));
    row.appendChild(chip);
  });

  return row;
}

/**
 * Keep chips on the newest assistant message only.
 *
 * Suggestions are answers to "what next" at one point in the conversation.
 * Leaving them on every historical message would offer the user a dozen stale
 * branches, and on a repainted thread (reload, hydrate) every single reply
 * would sprout its own row.
 */
export function pruneStaleSuggestions(thread: HTMLElement): void {
  const rows = thread.querySelectorAll<HTMLElement>(".chat-suggestions");
  // Keep the last one; remove the rest.
  for (let i = 0; i < rows.length - 1; i++) rows[i]!.remove();
}
