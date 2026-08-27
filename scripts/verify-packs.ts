/* Contract check for the multi-image PACK skills.
 *
 * These are the invariants `tsc` and `astro build` cannot see, and each one has
 * already broken in practice at least once:
 *
 *   1. Every id in PACK_SKILL_IDS resolves to a registered builder. The registry
 *      once shipped as an empty object typed `Record<string, …>`, which compiled
 *      cleanly while every pack skill silently fell through to the generic
 *      single-image prompt.
 *   2. A builder returns exactly as many variants as IMAGES_PER_RUN charges for.
 *      A mismatch is a mischarge, so generate-doodle.ts also asserts it at run
 *      time; this catches it before a user does.
 *   3. Variant prompts are distinct. Identical prompts mean paying N credits for
 *      N copies of one image.
 *   4. Each prompt front-loads its MEDIUM. Detail-preservation language early in
 *      a prompt drags the model toward smooth semi-realistic vector art — this
 *      is exactly how the Pet Portrait skill first shipped wrong.
 *
 * Run: npx esbuild scripts/verify-packs.ts --bundle --platform=node --format=esm \
 *        --outfile=/tmp/verify-packs.mjs && node /tmp/verify-packs.mjs
 * (Bundled because the source uses extensionless imports Node's ESM resolver
 * will not follow.)
 */

import { packBuilderFor } from "../src/lib/prompts/index";
import { PACK_SKILL_IDS, creditCostForSkill, imageCountForSkill } from "../src/lib/credits/costs";

/* Skills that deliberately do NOT apply the user's visual theme, because the
   thing they vary IS the look: `moods` varies emotional register, `style-roll`
   varies the drawing medium. A shared theme would flatten either back into one
   image. Any other pack skill is expected to honour the theme. */
const THEME_OPT_OUT = new Set<string>(["moods", "style-roll"]);

/* A prompt must name its medium up front. The vocabulary is broad because
   style-roll's four variants are four different media by design. */
const MEDIUM = /marker|ink|doodle|crayon|watercolour|watercolor|pen sketch|pencil|webtoon|hand-drawn/i;
const MEDIUM_WINDOW = 180;

const THEME_HINT = "Apply this visual style distinctly: soft pastel palette.";

let failures = 0;
const fail = (id: string, msg: string) => {
  console.log(`  FAIL ${id}: ${msg}`);
  failures++;
};

for (const id of PACK_SKILL_IDS) {
  const builder = packBuilderFor(id);
  if (!builder) {
    fail(id, "no builder registered in SKILL_PACK_BUILDERS");
    continue;
  }

  const variants = builder({
    themeHint: THEME_HINT,
    styleHint: "soft pastel palette",
    description: undefined,
  });

  const expected = imageCountForSkill(id);
  if (variants.length !== expected) {
    fail(id, `returned ${variants.length} variants but is charged for ${expected}`);
  }

  if (new Set(variants.map((v) => v.prompt)).size !== variants.length) {
    fail(id, "duplicate prompts — would charge per image for identical output");
  }

  const lateMedium = variants.filter((v) => !MEDIUM.test(v.prompt.slice(0, MEDIUM_WINDOW)));
  if (lateMedium.length > 0) {
    fail(id, `medium not named in first ${MEDIUM_WINDOW} chars of: ${lateMedium.map((v) => v.label).join(", ")}`);
  }

  const themed = variants.filter((v) => v.prompt.includes("soft pastel palette")).length;
  if (THEME_OPT_OUT.has(id)) {
    if (themed > 0) fail(id, `opts out of the visual theme but ${themed} variant(s) applied it`);
  } else if (themed !== variants.length) {
    fail(id, `should apply the visual theme but only ${themed}/${variants.length} variants did`);
  }

  const unlabelled = variants.filter((v) => !v.label?.trim());
  if (unlabelled.length > 0) fail(id, `${unlabelled.length} variant(s) missing a label`);

  console.log(
    `  ok   ${id.padEnd(12)} ${variants.length} images / ${creditCostForSkill(id)} credits  ${variants.map((v) => v.label).join(", ")}`,
  );
}

console.log(
  failures === 0
    ? `\nAll ${PACK_SKILL_IDS.length} pack skills pass.`
    : `\n${failures} contract violation(s).`,
);
process.exit(failures === 0 ? 0 : 1);
