/**
 * contact.ts — Single source of truth for how a human reaches us.
 *
 * These strings were previously inlined in four places (footer nav, privacy
 * policy, terms of service, status page), which is how the support address
 * drifted. Anything user-facing that offers a way to get in touch imports from
 * here so there is exactly one line to edit when a channel changes.
 *
 * WHATSAPP_NUMBER is intentionally allowed to be empty: `contactChannels()`
 * omits the WhatsApp entry when it is unset, so a missing number renders no
 * link rather than a wa.me URL that opens an error page.
 */

/** Support inbox. Reachable from the site footer, legal pages and status page. */
export const SUPPORT_EMAIL = "yash@picxstudio.com";

/**
 * PicX Studio community server — shared with picxstudio.com rather than a
 * separate Doodle AI server, so support and feedback land in one place.
 */
export const DISCORD_INVITE = "https://discord.com/invite/962wmzZyEs";

/**
 * WhatsApp number in international format: country code + number, digits only,
 * no `+`, spaces or dashes (wa.me rejects anything else). Example for India:
 * "919876543210". Empty string = no WhatsApp link is rendered anywhere.
 */
export const WHATSAPP_NUMBER = "919685304505";

/** Text pre-filled into the WhatsApp composer so the first message has context. */
const WHATSAPP_PREFILL = "Hi! I'm testing Doodle AI and wanted to connect.";

/** Absolute wa.me deep link, or null when no number is configured. */
export function whatsappUrl(prefill: string = WHATSAPP_PREFILL): string | null {
	const digits = WHATSAPP_NUMBER.replace(/\D/g, "");
	if (!digits) return null;
	return `https://wa.me/${digits}?text=${encodeURIComponent(prefill)}`;
}

/** `mailto:` URL, optionally with a subject line. */
export function supportMailto(subject?: string): string {
	return subject
		? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
		: `mailto:${SUPPORT_EMAIL}`;
}

export interface ContactChannel {
	label: string;
	href: string;
	/** True for Discord/WhatsApp — needs rel=noopener and opens off-site. */
	external: boolean;
}

/**
 * The channels to advertise, in the order a person should try them.
 * Discord first (fastest answer, mirrors picxstudio.com's own guidance),
 * then WhatsApp when configured, then email as the always-available fallback.
 */
export function contactChannels(): ContactChannel[] {
	const channels: ContactChannel[] = [
		{ label: "Join Discord", href: DISCORD_INVITE, external: true },
	];

	const wa = whatsappUrl();
	if (wa) channels.push({ label: "Chat on WhatsApp", href: wa, external: true });

	channels.push({ label: "Support (email)", href: supportMailto(), external: false });
	return channels;
}
