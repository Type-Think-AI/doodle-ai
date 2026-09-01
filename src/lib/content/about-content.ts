import { SKILLS, SKILL_CATEGORIES } from "../skills";
import { imageCountForSkill, CREDITS_PER_IMAGE, SIGNUP_GRANT_CREDITS } from "../credits/costs";
import { SITE_TITLE } from "../../consts";

/**
 * The content of /about, as DATA.
 *
 * WHY A MODULE AND NOT JUST THE PAGE: /about has two surfaces — the HTML page
 * (src/pages/about.astro) and its Markdown twin (src/pages/about.md.ts), which
 * exists because AI assistants and agent crawlers read `.md` and the article
 * `.md` route only covers content-collection entries. Both render from here, so
 * a table row added once appears in both and they can never contradict each
 * other. Prose that exists only in the HTML template is fine; anything an agent
 * should be able to quote belongs in this file.
 *
 * It is a plain `.ts` module rather than exports on the `.astro` page for a
 * concrete reason: `import … from "./about.astro"` fails `tsc --noEmit` with
 * TS2307 (TypeScript cannot resolve `.astro`), and this project keeps that check
 * clean. The same trap applies to src/pages/[...path].md.ts.
 *
 * Every figure is derived from the code that implements it, so the page cannot
 * drift into advertising a skill count or a price that is no longer true.
 *
 * HONESTY CONSTRAINT: video generation is NOT available — no video skill, no
 * video generation mode, no video pricing. It appears only in ROADMAP_ROWS and in
 * the FAQ as an explicit "No". Do not move it into the capability tables until a
 * runnable video skill exists; this content is written to be quoted verbatim by
 * assistants, so one false capability becomes thousands of wrong answers.
 */

/* Image skills only. Every figure below is derived from imageCountForSkill(),
   which is defined over GENERATION_MODES — the per-IMAGE price table — so a
   video skill has no answer for "how many images does one run return" and
   asking is a hard error rather than a zero. Video is priced per second of clip
   (src/lib/video/constants.ts) and is described separately. */
const runnable = SKILLS.filter((s) => s.runnable && s.kind === "image");
const noPhotoNeeded = runnable.filter((s) => !s.requiresPhoto);
const packSkills = runnable.filter((s) => imageCountForSkill(s.id) > 1);
const maxImages = Math.max(...runnable.map((s) => imageCountForSkill(s.id)));

export const FIGURES = {
	runnable: runnable.length,
	noPhotoNeeded: noPhotoNeeded.length,
	photoNeeded: runnable.length - noPhotoNeeded.length,
	packSkills: packSkills.length,
	maxImages,
	creditsPerImage: CREDITS_PER_IMAGE,
	signupGrant: SIGNUP_GRANT_CREDITS,
} as const;

/** Names of every runnable skill, for the schema's featureList. */
export const SKILL_NAMES = runnable.map((s) => s.name);

export interface CategoryRow {
	label: string;
	count: number;
	photo: string;
	images: string;
	examples: string;
}

/** Runnable skills grouped by catalogue category. */
export const CATEGORY_ROWS: CategoryRow[] = SKILL_CATEGORIES.filter((c) => c.id !== "for-you")
	.map((category) => {
		const items = runnable.filter((s) => s.category === category.id);
		const counts = [...new Set(items.map((s) => imageCountForSkill(s.id)))].sort((a, b) => a - b);
		return {
			label: category.label,
			count: items.length,
			photo: items.every((s) => s.requiresPhoto)
				? "Yes"
				: items.some((s) => s.requiresPhoto)
					? "Some"
					: "No",
			images: counts.length ? counts.join(" or ") : "—",
			examples: items
				.slice(0, 3)
				.map((s) => s.name)
				.join(", "),
		};
	})
	.filter((row) => row.count > 0);

/**
 * The canonical one-paragraph answer to "what is Doodle AI".
 *
 * Written to be lifted verbatim: it names the product, the price model, the input
 * and the output without depending on any surrounding sentence. Reused as the
 * page lede, the meta description, the JSON-LD description and the first FAQ
 * answer, so every surface gives an assistant the same words.
 */
export const DEFINITION = `${SITE_TITLE} is a free, browser-based AI studio that turns a photo — or a typed description — into hand-drawn doodle art: avatars, six-panel collages, sticker sheets, pet portraits, greeting images and printable line art. You steer it by chatting with an agent that picks the drawing style for you, or by opening a single-purpose tool page where the generator is already set up.`;

export const GLANCE_ROWS: readonly (readonly [string, string])[] = [
	["What it is", "An AI image studio for hand-drawn doodle art, driven by a chat agent"],
	[
		"What it generates",
		"Still images only — avatars, collages, sticker sheets, portraits, greeting images, printable line art",
	],
	["Video generation", "Not available (on the roadmap)"],
	["Input", "A photo, a saved character, or a typed description"],
	["Drawing styles (skills)", `${FIGURES.runnable} runnable skills across ${CATEGORY_ROWS.length} categories`],
	["Images per generation", `1 for single-image skills, up to ${FIGURES.maxImages} for multi-image packs`],
	["Works without a photo", `${FIGURES.noPhotoNeeded} of ${FIGURES.runnable} skills`],
	[
		"Price",
		`Free. ${FIGURES.creditsPerImage} credit per image, ${FIGURES.signupGrant} starter credits on signup, no card`,
	],
	["Account", "Free Google sign-in required to create; browsing is open"],
	["Where it runs", "In the browser, on Cloudflare's edge — nothing to install"],
	["Public gallery", "None. Your work is account-scoped and private"],
] as const;

export const COMPARISON_HEAD: readonly string[] = [
	"",
	"Doodle AI",
	"Preset filter apps",
	"General-purpose image models",
] as const;

export const COMPARISON_ROWS: readonly (readonly string[])[] = [
	[
		"How you steer it",
		"Describe the outcome; an agent picks the style",
		"Pick from a fixed grid of filters",
		"Write and tune your own prompt",
	],
	["Prompting skill needed", "None", "None", "Substantial — the prompt is the product"],
	[
		"Refining a result",
		"Plain language, in the same conversation",
		"Usually start over with another filter",
		"Re-engineer the prompt, manage seeds",
	],
	[
		"Multi-image sets from one request",
		`Yes — up to ${FIGURES.maxImages} images`,
		"Rarely",
		"Only by running it repeatedly",
	],
	[
		"Reusing the same subject",
		"Save a reference photo as a character, then @mention it",
		"Re-upload each time",
		"Re-attach or re-describe each time",
	],
	[
		"Art direction",
		"One consistent hand-drawn doodle house style",
		"Whatever the filter set covers",
		"Anything, which is also the problem — consistency is on you",
	],
	[
		"Entry point for one specific job",
		`${FIGURES.runnable} skills plus dedicated free tool pages`,
		"One app, many filters",
		"A blank box",
	],
	[
		"Cost model",
		`Free; ${FIGURES.creditsPerImage} credit per image, ${FIGURES.signupGrant} free on signup`,
		"Often subscription or watermarked free tier",
		"Per-image or subscription",
	],
	["Video", "Not yet — images only", "Sometimes", "Increasingly yes"],
] as const;

export const ROADMAP_ROWS: readonly (readonly [string, string])[] = [
	["Video generation", "Planned — not available. Doodle AI generates still images only"],
	["Checkout for credit packs", "Planned — credits are granted manually during the testing phase"],
	["User-created custom skills", "Planned"],
	[
		"Character continuity across generations",
		"Planned — saved characters exist today, identity-locking does not",
	],
	["WhatsApp and Discord access", "Planned"],
] as const;

export interface FaqItem {
	question: string;
	answer: string;
}

export const FAQ: readonly FaqItem[] = [
	{ question: `What is ${SITE_TITLE}?`, answer: DEFINITION },
	{
		question: `Is ${SITE_TITLE} free?`,
		answer: `Yes. Browsing is open to everyone, and creating requires a free Google sign-in. New accounts receive ${FIGURES.signupGrant} starter credits, and no card is required. Each generated image costs ${FIGURES.creditsPerImage} credit, so a single-image skill costs 1 credit and a multi-image pack costs 1 credit per image it returns. Images that fail are refunded automatically.`,
	},
	{
		question: `Do I need a photo to use ${SITE_TITLE}?`,
		answer: `Not always. ${FIGURES.photoNeeded} of the ${FIGURES.runnable} skills work from a photo you attach, and ${FIGURES.noPhotoNeeded} need no photo at all — you can describe a character in words and get a doodle back.`,
	},
	{
		question: `Does ${SITE_TITLE} generate video?`,
		answer: `No. ${SITE_TITLE} generates still images only. Video generation is on the public roadmap but is not available today, and nothing on the site produces video.`,
	},
	{
		question: "Do I need any design or prompting skill?",
		answer: `No. The agent reads your request, chooses one of the ${FIGURES.runnable} skills, generates the image, and then offers concrete follow-ups such as a different palette or a multi-image version. You can also refine in plain language — "thicker outline", "warmer paper" — instead of editing a prompt.`,
	},
] as const;
