/**
 * Shared keyboard/focus plumbing for every modal surface in the app.
 *
 * Two kinds of modal live in this codebase and they need different amounts of
 * help:
 *
 *  1. Native `<dialog>` + `showModal()` — AuthDialog, FeedbackDialog,
 *     TeamNameDialog, JoinTeamDialog, InviteTeamDialog, UpgradeContactDialog.
 *     The browser already gives Escape, a real focus trap, and inert
 *     background. What it does NOT give is a sensible *initial* focus (it lands
 *     on the first focusable node, which in all six is the close button) and it
 *     silently gives up on focus restoration when the opener is no longer
 *     focusable — e.g. the account menu popover is hidden before the dialog is
 *     opened, so the opener is `display: none` by the time the dialog closes.
 *     `openModalDialog()` fixes exactly those two things.
 *
 *  2. Hand-rolled div overlays — Lightbox, the composer camera dialog. These
 *     are the ones with real bugs: `role="dialog" aria-modal="true"` claims a
 *     trap that does not exist, so Tab walks straight out of the overlay into
 *     the page behind it. `createOverlayModal()` supplies the trap, Escape, the
 *     scroll lock, and focus restoration that a native dialog would have given
 *     for free.
 *
 * Nothing here touches presentation: no classes are added, no styles are set
 * beyond the body scroll lock the callers already applied themselves.
 */

/* Natively focusable elements, plus anything given an explicit tabindex.
   `[tabindex]` is filtered down to non-negative values below, since
   tabindex="-1" is programmatically focusable but deliberately not tabbable. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "iframe",
  "audio[controls]",
  "video[controls]",
  '[contenteditable="true"]',
  "[tabindex]",
].join(",");

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  // offsetParent is null inside a display:none subtree — which is how both
  // overlays hide their optional controls (lightbox prev/next, camera
  // retake/use). It is also null for position:fixed elements, hence the
  // client-rect fallback rather than using it as the only test.
  if (element.offsetParent !== null) return true;
  return element.getClientRects().length > 0;
}

function isDisabled(element: HTMLElement): boolean {
  if ("disabled" in element && element.disabled === true) return true;
  return element.getAttribute("aria-disabled") === "true";
}

/** Focusable, visible, enabled descendants of `root`, in DOM (tab) order. */
export function getTabbableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (isDisabled(element) || !isVisible(element)) return false;
    if (element instanceof HTMLInputElement && element.type === "hidden") return false;
    const tabindex = element.getAttribute("tabindex");
    if (tabindex !== null && Number(tabindex) < 0) return false;
    return true;
  });
}

/* A dismissal is the worst possible first focus target: the first thing a
   keyboard or screen-reader user reaches should be what the dialog is *for*,
   not the way back out of it. Detected rather than configured so every dialog
   gets the behaviour without each controller having to opt in. */
function isDismissControl(element: HTMLElement): boolean {
  const label = (element.getAttribute("aria-label") ?? "").trim().toLowerCase();
  if (label === "close" || label.startsWith("close ")) return true;
  return Array.from(element.classList).some((token) => token === "close" || token.endsWith("-close"));
}

/** Focus `element`, making it programmatically focusable first if it is a plain
 *  container (adds tabindex="-1" only — no visual change, and it never enters
 *  the tab order). */
function focusElement(element: HTMLElement): void {
  if (!element.hasAttribute("tabindex") && element.tabIndex < 0) element.tabIndex = -1;
  element.focus();
}

export interface InitialFocusOptions {
  /** The one control the dialog exists for. Focused when it is usable. */
  prefer?: HTMLElement | null;
  /** Extra controls to skip when auto-picking (close buttons are skipped already). */
  skip?: readonly (Element | null | undefined)[];
}

/**
 * Put focus on the first meaningful control inside `root`.
 *
 * Order of preference: the caller's `prefer` element, then the first tabbable
 * control that is not a dismissal, then any tabbable control, then `root`
 * itself. The last fallback matters — it is what keeps focus from being left on
 * `<body>` while a modal is open.
 */
export function focusInitial(root: HTMLElement, options: InitialFocusOptions = {}): HTMLElement {
  const prefer = options.prefer ?? null;
  if (prefer && isVisible(prefer) && !isDisabled(prefer)) {
    focusElement(prefer);
    return prefer;
  }

  const skip = new Set(options.skip?.filter((entry): entry is Element => Boolean(entry)) ?? []);
  const tabbable = getTabbableElements(root);
  const target =
    tabbable.find((element) => !skip.has(element) && !isDismissControl(element)) ?? tabbable[0] ?? root;
  focusElement(target);
  return target;
}

/** The focused element, treating `<body>`/`<html>` as "nothing is focused". */
function currentFocus(): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active === document.body || active === document.documentElement) return null;
  return active;
}

/* ------------------------------------------------------------------ *
 * Body scroll lock
 * ------------------------------------------------------------------ */

let scrollLockCount = 0;
let previousBodyOverflow: string | null = null;

/**
 * Reference-counted body scroll lock. Counting is the point: the camera dialog
 * previously stashed `body.style.overflow` on every open, so a second open
 * before a close recorded "hidden" as the value to restore and the page stayed
 * unscrollable for good.
 *
 * `className` is toggled as well for callers whose CSS already hooks a class
 * (Lightbox.astro's `body.lightbox-lock`), so that stylesheet keeps working
 * untouched.
 */
export function lockBodyScroll(className?: string): void {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
  if (className) document.body.classList.add(className);
}

/** Release one lock taken by `lockBodyScroll`. Safe to call when not locked. */
export function releaseBodyScroll(className?: string): void {
  if (className) document.body.classList.remove(className);
  if (scrollLockCount === 0) return;
  scrollLockCount -= 1;
  if (scrollLockCount > 0) return;
  document.body.style.overflow = previousBodyOverflow ?? "";
  previousBodyOverflow = null;
}

/* ------------------------------------------------------------------ *
 * Native <dialog>
 * ------------------------------------------------------------------ */

const dialogOpeners = new WeakMap<HTMLDialogElement, HTMLElement>();
const restoreWired = new WeakSet<HTMLDialogElement>();

/**
 * Restore focus to whatever opened `dialog` in the cases where the browser's
 * own restoration gave up. Idempotent — calling it twice wires one listener.
 */
export function wireDialogFocusRestore(dialog: HTMLDialogElement): void {
  if (restoreWired.has(dialog)) return;
  restoreWired.add(dialog);

  dialog.addEventListener("close", () => {
    const opener = dialogOpeners.get(dialog);
    dialogOpeners.delete(dialog);
    if (!opener) return;

    // `close` is fired from a queued task, so the browser has already had its
    // turn at restoring focus by now — and another dialog may have taken focus
    // on purpose (TeamName → JoinTeam hands off exactly like that). Only step in
    // when focus was actually dropped on the body.
    if (currentFocus() !== null) return;
    if (!opener.isConnected || !isVisible(opener) || isDisabled(opener)) return;
    opener.focus();
  });
}

/**
 * `showModal()` with the two things the platform leaves out: remember the
 * opener for restoration, and land focus on the first meaningful control instead
 * of the close button.
 */
export function openModalDialog(dialog: HTMLDialogElement, options: InitialFocusOptions = {}): void {
  const opener = currentFocus();
  if (opener && !dialog.contains(opener)) dialogOpeners.set(dialog, opener);
  wireDialogFocusRestore(dialog);
  if (!dialog.open) dialog.showModal();
  focusInitial(dialog, options);
}

/* ------------------------------------------------------------------ *
 * Hand-rolled overlays
 * ------------------------------------------------------------------ */

export interface OverlayModalOptions {
  /** The overlay root carrying role="dialog" aria-modal="true". */
  container: HTMLElement;
  /** True while the overlay is visible. */
  isOpen: () => boolean;
  /** Escape and backdrop click funnel here; it must do the actual hiding. */
  requestClose: () => void;
  /** Keys handled while open, after Escape and Tab have been dealt with. */
  onKeyDown?: (event: KeyboardEvent) => void;
  /** Clicking the container itself (its backdrop region) closes. Default true. */
  closeOnBackdropClick?: boolean;
  /** Body class toggled alongside the scroll lock, for CSS that already hooks it. */
  scrollLockClass?: string;
  /** Picks the control focused on open. Falls back to the usual auto-pick. */
  initialFocus?: () => HTMLElement | null;
}

export interface OverlayModal {
  /** Call once the overlay has been made visible. */
  activate: () => void;
  /** Call once the overlay has been hidden. Safe to call when already released. */
  release: () => void;
  /** Remove the document-level listeners. Releases first if still active. */
  destroy: () => void;
}

/** Keep Tab inside `container`, wrapping at both ends. */
function trapTab(container: HTMLElement, event: KeyboardEvent): void {
  const tabbable = getTabbableElements(container);
  const active = currentFocus();

  if (tabbable.length === 0) {
    // Nothing to tab to (e.g. a single-image lightbox whose only control is
    // hidden) — hold focus on the container rather than letting it escape.
    event.preventDefault();
    focusElement(container);
    return;
  }

  const first = tabbable[0]!;
  const last = tabbable[tabbable.length - 1]!;
  const inside = active !== null && container.contains(active);

  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Give a div-based overlay the behaviour a native modal `<dialog>` has:
 * Escape-to-close, a Tab/Shift+Tab trap, a balanced body scroll lock, and focus
 * restoration to the element that opened it.
 */
export function createOverlayModal(options: OverlayModalOptions): OverlayModal {
  const { container } = options;
  let active = false;
  let opener: HTMLElement | null = null;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!options.isOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      options.requestClose();
      return;
    }
    if (event.key === "Tab") {
      trapTab(container, event);
      return;
    }
    options.onKeyDown?.(event);
  };

  const onClick = (event: MouseEvent): void => {
    if (options.closeOnBackdropClick === false) return;
    if (!options.isOpen()) return;
    if (event.target === container) options.requestClose();
  };

  document.addEventListener("keydown", onKeyDown);
  container.addEventListener("click", onClick);

  const activate = (): void => {
    if (active) return;
    active = true;
    opener = currentFocus();
    lockBodyScroll(options.scrollLockClass);
    focusInitial(container, { prefer: options.initialFocus?.() ?? null });
  };

  const release = (): void => {
    if (!active) return;
    active = false;
    releaseBodyScroll(options.scrollLockClass);

    const target = opener;
    opener = null;
    if (!target) return;
    // Only pull focus back if it is still inside the overlay we just hid;
    // anything else means something took focus deliberately.
    const focused = currentFocus();
    if (focused !== null && !container.contains(focused)) return;
    if (!target.isConnected || !isVisible(target) || isDisabled(target)) return;
    target.focus();
  };

  return {
    activate,
    release,
    destroy: () => {
      release();
      document.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("click", onClick);
    },
  };
}
