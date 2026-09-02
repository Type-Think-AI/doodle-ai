/* Art families — the "what does it look like" dial.
 *
 * This is a SECOND, orthogonal axis to two things that already exist and it
 * does not replace either:
 *
 *   - `category` in the skill packages (avatars / collages / freeform / packs)
 *     answers "what SHAPE of output is this". A Doodle Avatar and an Anime
 *     Avatar are the same category, different family.
 *   - `THEMES` in ./doodle-constants.ts (pastel / neon / sunset / mono) is the
 *     PALETTE dial. It keeps working untouched. A family and a theme both feed a
 *     style hint into the same prompt; they are different knobs and compose.
 *
 * Shape mirrors `Theme` on purpose (id, label, one-line consumer blurb,
 * styleHint) with one addition, `appliesTo`, because a family may make sense for
 * stills, for animation, or for both. The selected family's `styleHint` is
 * folded into the image prompt (src/mastra/tools/generate-doodle.ts) and into
 * every video builder's house rules (src/lib/video/prompts.ts), so ONE chip
 * changes both a still and its animation.
 *
 * TWO HARD RULES, both grepped before shipping:
 *   1. DEFAULT stays the doodle look. `doodle` is first, is the fallback, and
 *      its styleHint is empty — an existing user who selects nothing gets the
 *      exact prompt they got before, byte for byte. Adding a family here can
 *      never change the no-selection path.
 *   2. NO franchise nouns. No series, studio, artist or character name appears
 *      in any id, label, blurb or styleHint — style vocabulary only, never
 *      cast. The genres the owner named ("pirate voyage", "ninja village",
 *      "monster tamer") are evoked through their craft signature — the
 *      linework, palette, face grammar and motion grammar that made them
 *      recognisable — with no mark attached. See §1 of
 *      docs/anime-expansion-brief.md.
 *
 * Consumer language: audience is non-technical Gen-Z B2C. Blurbs say animation
 * and comes-to-life, never video / render / model / 480p.
 */

/** Where a family is usable: on a still, on an animation, or both. */
export type ArtFamilyTarget = "image" | "video";

export interface ArtFamily {
  id: string;
  /** Chip label. Short, human, no trademark. */
  label: string;
  /** One line the consumer reads under the chip. No jargon. */
  blurb: string;
  /**
   * The style directive folded into the prompt. Craft vocabulary only —
   * linework, colour, face/body grammar, motion grammar — never a proper noun.
   * The `doodle` default is intentionally empty: it contributes nothing so the
   * no-selection path is unchanged.
   */
  styleHint: string;
  /** Stills, animations, or both. */
  appliesTo: ArtFamilyTarget[];
}

/** Stored value / request field for the selected family. */
export const ART_FAMILY_STORAGE_KEY = "doodleai-art-family";

/** The default. Empty styleHint == the current doodle prompt, unchanged. */
export const DEFAULT_ART_FAMILY_ID = "doodle";

export const ART_FAMILIES: ArtFamily[] = [
  {
    id: "doodle",
    label: "Doodle",
    blurb: "The classic hand-drawn look.",
    // Intentionally empty. This is the default; contributing no extra directive
    // keeps the existing doodle prompt byte-for-byte unchanged. Do not fill it.
    styleHint: "",
    appliesTo: ["image", "video"],
  },
  /* The six families below were first written from memory. They are now
     reconciled against docs/anime-style-research.md Parts 1–2, which cites a
     source per dial (linework / colour / face-body / motion / shot). Where the
     research and the guess disagreed, the research wins — most importantly on
     speed lines, which streak the BACKGROUND and hold the subject sharp. */
  {
    id: "shonen-action",
    label: "Action Hero",
    blurb: "Bold lines and big energy.",
    styleHint:
      "Shonen action-anime styling: bold clear high-readability outlines with heavier lids and stronger eyelines " +
      "than the romance register, hair treated as a major design element with a spiky silhouette, angular " +
      "determined eyes, saturated cel fills resolved into two or three discrete shadow blocks at hero-clear high " +
      "contrast, athletic seven-to-eight-head proportions. Motion is drawn on the background, not on the figure: " +
      "speed lines streak the background while the subject stays in sharp focus, the pose is dynamic and " +
      "foreshortened, and a single high-contrast impact frame is held for a beat on an exaggerated silhouette. " +
      "Framing favours the power-up stance and the clash freeze.",
    appliesTo: ["image", "video"],
  },
  {
    id: "magical-girl",
    label: "Sparkle",
    blurb: "Soft, dreamy and full of sparkle.",
    styleHint:
      "Magical-girl anime styling: clean rounded fine linework close to the romance register, large bright eyes " +
      "with layered catchlights, youthful slender proportions, flowing hair and fabric. Colour is coded rather " +
      "than merely pretty — one saturated costume colour carrying the character's identity, heavy pink and pastel " +
      "around it, glowing accents. The signature beat is the transformation: glowing ribbons wrapping the figure, " +
      "a radiant aura, floating accessories, rising hearts and stars, a colour change or glowing eyes marking the " +
      "power-up, caught mid-air in a twirling spin. Graceful and hopeful.",
    appliesTo: ["image", "video"],
  },
  {
    id: "chibi",
    label: "Chibi",
    blurb: "Tiny, cute and squishy.",
    styleHint:
      "Chibi super-deformed anime styling: two to three heads tall, with the head about one-third to one-half of " +
      "the whole figure — an oversized head and huge round sparkling eyes, a barely-there dot nose and small " +
      "mouth, short stubby near-boneless limbs and stubby fingers. Simple rounded outlines with minimal internal " +
      "detail, bright flat cheerful fills, almost no shading. Motion is bouncy exaggerated squash and tiny fast " +
      "reactions; framing is the mascot pose, the sticker-sheet grid or the reaction cut-in.",
    appliesTo: ["image", "video"],
  },
  {
    id: "slice-of-life",
    label: "Cozy",
    blurb: "Calm, warm everyday vibes.",
    styleHint:
      "Slice-of-life anime styling: clean gentle unfussy linework, natural approachable proportions and " +
      "understated eyes, in a soft muted nostalgic palette that refuses harshness and wraps the scene in a gentle " +
      "haze. The emphasis sits on the world rather than the figure — a richly detailed everyday background doing " +
      "the emotional work, a dusk-lit shop front or a crowded station under golden late light. Movement is ambient " +
      "rather than dramatic: drifting steam, a curtain lifting, light shifting across a room, one quiet unhurried " +
      "held moment.",
    appliesTo: ["image", "video"],
  },
  {
    id: "retro-cel",
    label: "Retro",
    blurb: "That nostalgic 90s cartoon feel.",
    styleHint:
      "Retro 90s cel-animation styling: hand-inked lines whose edges read soft and analog rather than crisp and " +
      "digital, flat hand-painted cel fills in a slightly faded limited palette, two or three hard discrete shadow " +
      "blocks, and none of the gradient work modern digital anime puts into hair and eyes, so eyes read softer and " +
      "less glossy. The analog artefacts are the signature: visible film grain, an optical lens flare, a slight " +
      "colour shift, and a painted background plate behind the figures. Motion is cel-era limited animation — held " +
      "cels, reused frames, a low painted cadence of roughly twelve to twenty-four frames a second.",
    appliesTo: ["image", "video"],
  },
  {
    id: "ink-wash",
    label: "Ink Wash",
    blurb: "Painterly brush and ink.",
    styleHint:
      "Watercolour-and-ink anime styling: a soft broken ink line laid over the washes rather than a hard outline " +
      "containing them, wet-on-wet colour bleed, salt-grain texture, paper tooth showing through, edges dissolving " +
      "into wash. A gentle seasonal palette, limited and harmonious — painterly and atmospheric rather than flat " +
      "cel. The medium implies stillness: a contemplative held moment, an atmospheric portrait or landscape, " +
      "movement only as slow drift and pigment spreading.",
    appliesTo: ["image", "video"],
  },
  /* The three genres the owner named by their famous shows. Each is the CRAFT
     SIGNATURE that makes the look recognisable — never the series, studio or
     character — so the family evokes the genre through drawing technique, not
     trademark. Cues lifted from docs/anime-style-research.md Part 3, which cites
     a source per dial. */
  {
    id: "pirate-voyage",
    label: "Pirate Crew",
    blurb: "Big adventure on the open sea.",
    styleHint:
      "Bold adventurous cel-shaded anime illustration: exaggerated rubbery elastic limb proportions, expressive " +
      "comedic faces, a bright tropical-island palette of warm sea-and-sky blues and sun-warm sand, heavy hand-drawn " +
      "motion lines with elastic stretch-and-snap action, figures on a ship deck under open sky.",
    appliesTo: ["image", "video"],
  },
  {
    id: "ninja-village",
    label: "Ninja Village",
    blurb: "Stealth, scrolls and glowing power.",
    styleHint:
      "Detailed shonen-action anime illustration: athletic figures in wrapped stealth gear, a muted earth-tone and " +
      "sandy palette with ONE saturated glowing accent for the technique effect, dense crosshatch shading, a " +
      "hands-together focusing gesture just before a glowing power effect, background speed lines and smoke.",
    appliesTo: ["image", "video"],
  },
  {
    id: "monster-tamer",
    label: "Monster Tamer",
    blurb: "You and your own little creature.",
    styleHint:
      "Bright cheerful creature-collector anime illustration: clean rounded friendly outlines, an ORIGINAL rounded " +
      "creature with a strong silhouette readable at coin size and one clear signature feature, a limited " +
      "high-identity colour palette, a young companion beside it, flat cel shading, outdoor adventure setting.",
    appliesTo: ["image", "video"],
  },
  {
    id: "gag-comic",
    label: "Gag Comic",
    blurb: "Round, silly, retro TV comedy.",
    styleHint:
      "Retro gag-manga anime styling: a thick ink outline of EVEN weight all the way round, very rounded simple shapes, " +
      "flat primary-colour fills (postbox red, sky blue, school-bus yellow) with almost no shading, oversized round eyes " +
      "with simple dot-and-line features, an ordinary suburban everyday setting, four-panel comic timing that lands on one " +
      "broad reaction, and a soft Showa-era broadcast look with faint paper grain.",
    appliesTo: ["image", "video"],
  },
  /* Three more genres added Sep 2026 for thumbnail-wall variety (lane in
     docs/anime-style-research.md Part 4). Each was chosen because its palette
     and subject register share nothing with the existing four genre families
     or with each other: a metallic hard-surface machine, a dark neon city, and
     a near-monochrome shadow frame. Craft signatures only — no series, studio,
     artist or character noun. Cues lifted from research Part 2 §5/§9 and Part 4,
     each citing a source per dial. */
  {
    id: "mecha-pilot",
    label: "Mecha Pilot",
    blurb: "You and your giant robot.",
    styleHint:
      "Hard-surface mecha anime styling: an original giant robot rendered with crisp precise panel-line detail all " +
      "over its hard-surface plating, clean mechanical edges and visible joints, a metallic grey body with one or " +
      "two saturated accent-plate colours, and a cool metallic rim light tracing every edge and joint. A glowing " +
      "neon heads-up-display overlay and an anamorphic lens flare read the scene as a cockpit. Colour is a " +
      "restrained industrial palette — gunmetal and steel with the accent plating and the HUD glow as the only " +
      "bright notes. The signature framing is the towering low-angle hero shot that makes the machine feel " +
      "colossal and stable; motion is weighty and deliberate for scale, with a hard glint or flare on the " +
      "decisive beat. No emblem, insignia or badge on the plating.",
    appliesTo: ["image", "video"],
  },
  {
    id: "neon-city",
    label: "Neon City",
    blurb: "After dark, lit by the city.",
    styleHint:
      "Cyberpunk neon-city anime styling: an inky near-black base — deep charcoal and midnight blue — cut by " +
      "high-saturation neon accents in cyan, magenta and electric pink, with the light source coming from the " +
      "signage rather than the sky so the figure is lit from the side and below. Rain-slicked streets throw long " +
      "mirror reflections of the neon, holographic advertisements and stacked glowing signs tower over cramped " +
      "alleys, and a light haze of smog and steam catches the glow. Clean confident outlines with a slight glow " +
      "bleed where neon meets an edge; the subject wears invented near-future streetwear with thin light-line " +
      "accents. The framing is the perpetual-twilight street level under a wall of signage; motion is a slow drift " +
      "of steam and flickering light. No brand names or real logos on any sign.",
    appliesTo: ["image", "video"],
  },
  {
    id: "eerie-shadow",
    label: "Eerie Shadow",
    blurb: "Spooky, shadowy and tense.",
    styleHint:
      "Supernatural-horror manga styling built on selective contrast and on what stays hidden: heavy solid black " +
      "ink masses, high-contrast crosshatching and screentone stipple for the mid-greys, and most of the frame " +
      "dropping to near-silhouette so a single carrying highlight — a catch of light in one eye, the edge of a " +
      "tooth, a wet streak — does the work. A near-monochrome palette, deep blacks against paper white with one " +
      "restrained cold accent at most, empty white negative space used as tense silence against the dense blacks. " +
      "Line favours form over detail, jagged and weighty where it shows. The framing is the low-key ominous " +
      "close-up half-lost in shadow; motion is minimal and held, an unsettling stillness broken by one small " +
      "movement. Eerie and tense, never gory.",
    appliesTo: ["image", "video"],
  },
];

const FAMILY_BY_ID = new Map(ART_FAMILIES.map((f) => [f.id, f]));

/** The default family object (the doodle look). */
export function defaultArtFamily(): ArtFamily {
  return FAMILY_BY_ID.get(DEFAULT_ART_FAMILY_ID) ?? ART_FAMILIES[0]!;
}

/**
 * Resolve a stored/requested family id to its style hint, for a given target.
 *
 * Returns an EMPTY string in every no-op case — an unknown id, a missing id, or
 * a family that does not apply to this target — so the caller can concatenate
 * the result unconditionally and the no-selection path stays byte-for-byte
 * identical to today. The `doodle` default also resolves to "" by design.
 *
 * @param familyId  stored/requested id, or null/undefined for none
 * @param target    "image" for a still, "video" for an animation
 */
export function resolveFamilyHint(
  familyId: string | null | undefined,
  target: ArtFamilyTarget,
): string {
  if (!familyId) return "";
  const family = FAMILY_BY_ID.get(familyId);
  if (!family) return "";
  if (!family.appliesTo.includes(target)) return "";
  return family.styleHint.trim();
}
