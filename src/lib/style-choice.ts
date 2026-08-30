import { THEMES } from "./doodle-constants";

/**
 * Resolving a stored style choice into prompt text.
 *
 * The composer persists ONE string (localStorage -> `styleId` on the chat request
 * -> `style_id` in D1), so the two non-theme choices are encoded in that same
 * string rather than by widening the request shape or the schema:
 *
 *   "pastel" | "neon" | …   one of THEMES
 *   "none"                  impose no palette at all
 *   "custom:#RRGGBB"        build the palette around one user-picked colour
 *
 * WHY THIS FILE EXISTS: both prompt paths previously did
 * `THEMES.find(t => t.id === styleId) || THEMES[0]`, which silently resolves any
 * unrecognised id to Pastel. Adding menu options without this resolver would have
 * produced a picker that looks like it works and quietly generates Pastel every
 * time. Centralising it means the chat tool and the batch builder cannot diverge.
 *
 * Deliberately NOT added as fields on THEMES in doodle-constants.ts: "none" has
 * no palette and "custom" has no fixed one, so neither is a Theme. This module
 * only READS THEMES.
 */

/** Stored value meaning "no themed palette". */
export const STYLE_NONE = "none";
/** Prefix for a user-picked colour, followed by a 6-digit hex. */
export const STYLE_CUSTOM_PREFIX = "custom:";

export type StyleKind = "theme" | "none" | "custom";

export interface ResolvedStyle {
  kind: StyleKind;
  /** Sentence injected where prompts want an emphasised style directive. */
  themeHint: string;
  /** Raw palette description handed to the pack builders. */
  styleHint: string;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Uppercased `#RRGGBB`, or null when the value is not a plain 6-digit hex. */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  return HEX_RE.test(trimmed) ? trimmed.toUpperCase() : null;
}

/** The hex inside a `custom:` value, or null if this is not a custom choice. */
export function customHexFrom(styleId: string | null | undefined): string | null {
  if (!styleId || !styleId.startsWith(STYLE_CUSTOM_PREFIX)) return null;
  return normalizeHex(styleId.slice(STYLE_CUSTOM_PREFIX.length));
}

/**
 * Palette prose for one user-chosen colour.
 *
 * Asks for a small harmonious set built AROUND the colour rather than the colour
 * alone — a single flat hue reads as a fill-bucket accident, not a chosen style.
 */
function customStyleHint(hex: string): string {
  return (
    `Build the palette around the colour ${hex}: use it as the dominant colour for ` +
    `the linework and the main fills, supported by two or three harmonious ` +
    `neighbouring tones and a soft neutral paper background. Keep it warm and ` +
    `hand-drawn — flat marker and ink colour, not gradients or corporate flat design.`
  );
}

/**
 * The "None" choice still says something, on purpose. Left with no palette
 * instruction at all the model tends to drift toward photographic colour, which
 * is the one thing every skill here is trying to avoid — so this suppresses a
 * *themed* palette without silently dropping the constraint.
 */
const NONE_STYLE_HINT =
  "Do not impose a themed colour palette. Keep colour minimal and natural, led by " +
  "the linework itself, with a plain neutral background.";

export function resolveStyle(styleId: string | null | undefined): ResolvedStyle {
  if (styleId === STYLE_NONE) {
    return { kind: "none", themeHint: NONE_STYLE_HINT, styleHint: NONE_STYLE_HINT };
  }

  const customHex = customHexFrom(styleId);
  if (customHex) {
    const hint = customStyleHint(customHex);
    return {
      kind: "custom",
      themeHint: `Apply this visual style distinctly: ${hint}`,
      styleHint: hint,
    };
  }

  // Unknown ids keep the historical fallback to the first theme.
  const theme = THEMES.find((t) => t.id === styleId) || THEMES[0]!;
  return {
    kind: "theme",
    themeHint: `Apply this visual style distinctly: ${theme.styleHint}`,
    styleHint: theme.styleHint,
  };
}
