/**
 * Post-signin first-win targeting.
 *
 * Prefer Sticker Pack when it is 1 credit (About: 1 credit per image). Fall back
 * to Doodle Avatar (`normal`) if that ever stops being true — never invent a
 * cheaper skill.
 */

export const FIRST_WIN_PREFERRED_ID = "stickers";
export const FIRST_WIN_FALLBACK_ID = "normal";

export const FIRST_WIN_DISMISS_KEY = "doodleai-first-win-dismissed";

export function resolveFirstWinSkillId(creditCostFor: (id: string) => number): string {
  try {
    if (creditCostFor(FIRST_WIN_PREFERRED_ID) === 1) return FIRST_WIN_PREFERRED_ID;
  } catch {
    /* unknown / unpriced — fall through */
  }
  return FIRST_WIN_FALLBACK_ID;
}

export function threadHasGeneration(
  threads: ReadonlyArray<{ thumbnailUrl?: string | null }>,
): boolean {
  return threads.some((thread) => Boolean(thread.thumbnailUrl));
}

export function shouldShowFirstWinNudge(input: {
  signedIn: boolean;
  hasGeneration: boolean;
  dismissed: boolean;
}): boolean {
  return input.signedIn && !input.hasGeneration && !input.dismissed;
}
