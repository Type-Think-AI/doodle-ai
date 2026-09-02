/* Turning a stored failure code into something a person can act on.
 *
 * THE PROBLEM THIS FIXES. Every failed generation used to reach the user as one
 * sentence — "That didn't come out. Your credits were refunded" — no matter what
 * actually went wrong. The `generation` row has carried an `errorCode` all along
 * and /api/v1/videos/[id] has always returned it; the chat simply never read it.
 * So a photo we could not read, a prompt that was refused, and a provider outage
 * were indistinguishable, and in every case the only suggested action was "try
 * again" — which for an unreadable photo will fail again in exactly the same way.
 *
 * CONSUMER WORDS ONLY. This audience is not told about renders, models,
 * resolutions, providers, HTTP codes or queues. A picture, a moving doodle, a
 * photo. The raw code stays in the database for us; none of it is shown.
 *
 * HONESTY ABOUT MONEY. A line only claims credits came back when the caller
 * knows they did. `refunded` is a real row state, so the caller passes it in
 * rather than this module guessing — telling someone they were refunded when they
 * were not is worse than saying nothing about it.
 */

export interface FailureCopy {
  /** One sentence, consumer words, no jargon. */
  message: string;
  /** True when trying the identical thing again is expected to fail again. */
  retryIsPointless: boolean;
}

/* Matched case-insensitively against the stored code, which may be our own short
   code or raw upstream text we passed through. Order matters: the first match
   wins, so the specific patterns sit above the generic ones. */
const PATTERNS: { match: RegExp; copy: FailureCopy }[] = [
  {
    /* Our own preflight code, plus the upstream wording it exists to prevent.
       This is the 2026-09-02 failure: the photo could not be downloaded. */
    match: /input_image_unreachable|failed to download|image_urls/i,
    copy: {
      message:
        "We could not read that photo, so the doodle never started. Nothing was charged. " +
        "Attaching the photo again usually fixes it.",
      retryIsPointless: true,
    },
  },
  {
    match: /image_too_small|too small/i,
    copy: {
      message:
        "That photo is too small to work from. Nothing was charged. Try one at least 256 pixels wide.",
      retryIsPointless: true,
    },
  },
  {
    match: /content_policy|safety|moderation|refused/i,
    copy: {
      message:
        "That one could not be drawn, so nothing was charged. Rewording it, or using a different photo, usually works.",
      retryIsPointless: true,
    },
  },
  {
    match: /credits_exhausted|insufficient/i,
    copy: {
      message: "We are temporarily out of drawing capacity. Nothing was charged — please try again shortly.",
      retryIsPointless: false,
    },
  },
  {
    match: /missing_scope|not_configured|webhook_not_configured|ignored_callback_url|without_generation_id/i,
    copy: {
      /* Ours, not theirs. Do not invite a retry that cannot succeed until we
         deploy a fix, and do not imply the user did anything wrong. */
      message: "Something on our side is misconfigured, so this could not start. Nothing was charged — we are on it.",
      retryIsPointless: true,
    },
  },
  {
    match: /timeout|timed out/i,
    copy: {
      message: "That took too long and was stopped. Nothing was charged for it.",
      retryIsPointless: false,
    },
  },
];

const GENERIC: FailureCopy = {
  message: "That didn't come out.",
  retryIsPointless: false,
};

/**
 * Describe a terminal failure.
 *
 * `refunded` should be true only when the row actually reached the refunded
 * state. When it is true and the matched copy does not already account for the
 * money, a refund sentence is appended.
 */
export function describeGenerationFailure(
  errorCode: string | null | undefined,
  refunded = false,
): FailureCopy {
  const code = (errorCode ?? "").trim();
  const matched = code ? PATTERNS.find((entry) => entry.match.test(code))?.copy : undefined;
  const base = matched ?? GENERIC;

  /* Several messages already say "nothing was charged", so only add the refund
     sentence when the copy is silent about money. */
  const mentionsMoney = /charged|refund/i.test(base.message);
  if (!refunded || mentionsMoney) {
    return base.message === GENERIC.message
      ? { ...base, message: `${base.message} Want to try again?` }
      : base;
  }
  return { ...base, message: `${base.message} Your credits were refunded.` };
}
