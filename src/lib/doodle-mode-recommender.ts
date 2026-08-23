export type DoodleMode = "normal" | "collage" | "full-body";

export interface DoodleModeRecommendation {
  mode: DoodleMode;
  reason: string;
}

const FULL_BODY_TERMS = [
  "full body",
  "full-body",
  "head to toe",
  "action",
  "karate",
  "martial art",
  "dance",
  "dancing",
  "jump",
  "running",
  "run",
  "sports",
  "workout",
  "standing pose",
  "movement",
];

const COLLAGE_TERMS = [
  "collage",
  "six panel",
  "six-panel",
  "3x2",
  "three by two",
  "different faces",
  "different expressions",
  "multiple poses",
  "close-up",
  "close up",
  "contact sheet",
  "grid",
];

/**
 * Local skills-layer recommendation used by the UI when no model provider is
 * configured. The rules are intentionally small and predictable so local
 * development never depends on an API key or a third-party preview model.
 */
export function recommendDoodleMode(message: string): DoodleModeRecommendation {
  const normalized = message.trim().toLowerCase();

  if (matchesAny(normalized, FULL_BODY_TERMS)) {
    return {
      mode: "full-body",
      reason: "Your request emphasizes movement or a head-to-toe action pose.",
    };
  }

  if (matchesAny(normalized, COLLAGE_TERMS)) {
    return {
      mode: "collage",
      reason: "Your request asks for multiple close-up poses, faces, or panels.",
    };
  }

  return {
    mode: "normal",
    reason: "A single expressive doodle avatar best fits this request.",
  };
}

function matchesAny(message: string, terms: string[]): boolean {
  return terms.some((term) => message.includes(term));
}
