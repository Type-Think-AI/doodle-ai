// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = "Doodle AI";
export const SITE_DESCRIPTION = "Turn a photo into a playful hand-drawn doodle avatar with Doodle AI, powered by PicX AI.";

/**
 * Open Graph images for the static pages, which have no article frontmatter to
 * store a `heroImage` in. Articles carry their own; these cover the routes that
 * would otherwise fall back to the square app icon, which crops badly in a
 * 1.91:1 social card and tells a reader nothing about the page.
 *
 * Generated in the same doodle house style as the article thumbnails via:
 *   node scripts/generate-blog-thumbnails.mjs --pages
 * Re-run that and paste the printed URLs here to refresh them.
 */
export const OG_IMAGE = {
	home: "https://cdn.picxstudio.com/api/generated/image_865ab5a7-8bb6-41bf-abf7-a699d702a0b1.png",
	learn: "https://cdn.picxstudio.com/api/generated/image_1ec39073-cdbf-420b-9198-2ad1d1dbbd6c.png",
	skills: "https://cdn.picxstudio.com/api/generated/image_1b9d3b74-6e31-44cd-9906-f414a92a2d70.png",
	forStudios: "https://cdn.picxstudio.com/api/generated/image_f8d97467-263f-49d1-a410-68e0304cc4b0.png",
} as const;

/**
 * Sample avatars shown in the sign-in dialog carousel.
 *
 * These replaced a hand-rolled SVG (`buildAvatarSVG` in src/lib/doodle-avatar.ts)
 * whose glasses and hair paths rendered misaligned over the face — it had been
 * assembled from path geometry without anyone looking at the result. Generated
 * portraits are used instead because they were visually verified, and because
 * they show a prospective user roughly what the Doodle Avatar skill produces.
 *
 * Regenerate with:
 *   node scripts/generate-blog-thumbnails.mjs --avatars
 *
 * They are illustrative samples, not output from any real user's photo.
 */
export const AUTH_AVATARS = [
	{
		name: "Nova",
		src: "https://cdn.picxstudio.com/api/generated/image_8e49ae56-a6d9-42f5-ae26-011e03e1b5c9.png",
		alt: "Hand-drawn doodle avatar of a person with long wavy hair and round glasses",
	},
	{
		name: "Juno",
		src: "https://cdn.picxstudio.com/api/generated/image_af9449aa-7e1e-481b-9711-f45eca01e5ae.png",
		alt: "Hand-drawn doodle avatar of a person with curly hair in a top bun and hoop earrings",
	},
	{
		name: "Pip",
		src: "https://cdn.picxstudio.com/api/generated/image_b991b561-8c11-4541-8869-145eac6070f6.png",
		alt: "Hand-drawn doodle avatar of a person in a knitted beanie with a wide grin",
	},
] as const;
