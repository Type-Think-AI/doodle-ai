/* Controller for the upgrade / buy-credits contact dialog.
 *
 * There is nothing to submit here — every row is a plain link to a third-party
 * app — so this controller only does three things:
 *
 *   1. Opens the dialog on `doodleai:open-upgrade-contact`.
 *   2. Rewrites the WhatsApp and mailto prefills to name the specific thing the
 *      person clicked ("Creator · 100 credits"), so their first message already
 *      contains the answer to "which pack?". The base hrefs live in
 *      `data-base-href` so repeated opens with different packs never compound.
 *   3. Standard dismissal: close button, backdrop click, Escape (native to
 *      <dialog>), and closing after a channel is chosen so the person does not
 *      come back from WhatsApp to a stale modal.
 *
 * showModal() is used rather than show() so focus is trapped and the rest of the
 * page is inert — the dialog is a decision point, not an aside.
 */

/* These controllers are loaded as classic (non-module) scripts, so their
 * top-level declarations share one global scope. The name is prefixed to avoid
 * colliding with feedback-dialog.ts's own OPEN_EVENT — an unprefixed name here
 * produced TS2451 "Cannot redeclare block-scoped variable". */
const UPGRADE_CONTACT_OPEN_EVENT = "doodleai:open-upgrade-contact";

interface UpgradeContactDetail {
  /** Human label for what they tried to buy, e.g. "Creator · 100 credits". */
  pack?: string;
}

/** Replace the `text=` query param on a wa.me URL. */
function withWhatsappText(baseHref: string, text: string): string {
  try {
    const url = new URL(baseHref);
    url.searchParams.set("text", text);
    return url.toString();
  } catch {
    return baseHref;
  }
}

/** Build a mailto with subject and body. */
function withMailBody(baseMailto: string, subject: string, body: string): string {
  const address = baseMailto.replace(/^mailto:/, "").split("?")[0];
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function initUpgradeContactDialog(): void {
  const dialog = document.getElementById("upgradeContactDialog") as HTMLDialogElement | null;
  if (!dialog) return;

  const closeBtn = document.getElementById("upgradeContactClose");
  const sub = document.getElementById("upgradeContactSub");
  const waLink = document.getElementById("upgradeContactWhatsapp") as HTMLAnchorElement | null;
  const mailLink = document.getElementById("upgradeContactEmail") as HTMLAnchorElement | null;

  const defaultSub = sub?.textContent ?? "";

  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  closeBtn?.addEventListener("click", close);

  // Backdrop click. The <dialog> element itself is the backdrop region, so a
  // click whose target IS the dialog (not its contents) is an outside click.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  // Once a channel is picked the person leaves for another app; leaving the
  // modal open behind them means they return to a blocked page.
  dialog.querySelectorAll<HTMLAnchorElement>("a.uc-row").forEach((a) => {
    a.addEventListener("click", () => window.setTimeout(close, 120));
  });

  window.addEventListener(UPGRADE_CONTACT_OPEN_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<UpgradeContactDetail>).detail;
    const pack = detail?.pack?.trim();

    if (pack) {
      if (sub) {
        sub.textContent =
          `Checkout isn't switched on yet while Doodle AI is in its testing phase. ` +
          `Message me about ${pack} and I'll add the credits to your account by hand.`;
      }
      if (waLink?.dataset.baseHref) {
        waLink.href = withWhatsappText(
          waLink.dataset.baseHref,
          `Hi! I'd like to get credits on Doodle AI — ${pack}.`,
        );
      }
      if (mailLink?.dataset.baseHref) {
        mailLink.href = withMailBody(
          mailLink.dataset.baseHref,
          `Doodle AI — credits (${pack})`,
          `Hi Yash,\n\nI'd like to get credits on Doodle AI — ${pack}.\n\nMy account email: `,
        );
      }
    } else {
      if (sub) sub.textContent = defaultSub;
      if (waLink?.dataset.baseHref) waLink.href = waLink.dataset.baseHref;
      if (mailLink?.dataset.baseHref) {
        mailLink.href = withMailBody(
          mailLink.dataset.baseHref,
          "Doodle AI — credits",
          "Hi Yash,\n\nI'd like to get more credits on Doodle AI.\n\nMy account email: ",
        );
      }
    }

    if (!dialog.open) dialog.showModal();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUpgradeContactDialog, { once: true });
} else {
  initUpgradeContactDialog();
}
