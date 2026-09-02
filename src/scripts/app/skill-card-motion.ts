/* The one controller that makes skill tiles move, hoisted once per page however
 * many tiles render — a single document-level listener set, not per-tile
 * behaviour. Split out of SkillCard.astro for the 300-line component limit.
 */
/* Hoisted once per page by Astro however many cards render, so this is a
   single document-level controller rather than per-tile behaviour.
 *
 * Policy:
 *   reduced motion               -> never starts, on any pointer. The still
 *                                   stands, and the marker is left disabled so
 *                                   it reads and behaves as a plain marker.
 *   hover + fine pointer         -> pointer-enter or keyboard focus on the LINK
 *                                   starts one tile; leaving stops and rewinds
 *                                   it. Unchanged.
 *   touch / coarse pointer       -> nothing autoplays, ever, and a tap on the
 *                                   art is still the link. A tap on the amber
 *                                   marker starts THAT one animation inline and
 *                                   a second tap stops it. Before this, a
 *                                   phone-first audience never saw a tile move
 *                                   at all; the bandwidth rule that produced
 *                                   that is kept — nothing loads until the tap.
 *
 * At most ONE tile plays at a time, on every path. `src` is assigned on the
 * first play intent and never before, and playback is only revealed once the
 * element reports it is painting frames — a refused or broken load leaves the
 * still in place with no error text on the art. Muted on every path; no audio
 * track is ever surfaced and there are no controls.
 */
import {
  applyClipSound,
  syncSoundButton,
  toggleClipSound,
} from './clip-audio';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');

const cards = Array.from(document.querySelectorAll<HTMLElement>('.skill-card[data-clip="true"]'));

if (cards.length > 0) {
  let active: HTMLElement | null = null;

  const videoOf = (card: HTMLElement) => card.querySelector<HTMLVideoElement>('video[data-skill-clip]');
  const buttonOf = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('button[data-skill-play]');
  const soundOf = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('button[data-clip-sound]');

  const stop = (card: HTMLElement | null) => {
    if (!card) return;
    const video = videoOf(card);
    if (video && !video.paused) video.pause();
    if (video) {
      try {
        video.currentTime = 0;
      } catch {
        /* Seeking before metadata is loaded throws in some engines; harmless. */
      }
    }
    if (card.dataset.motionState !== 'refused') card.dataset.motionState = 'idle';
    buttonOf(card)?.setAttribute('aria-pressed', 'false');
    if (active === card) active = null;
  };

  const start = (card: HTMLElement) => {
    if (reduceMotion.matches) return;
    const video = videoOf(card);
    if (!video) return;
    if (active && active !== card) stop(active);
    active = card;
    buttonOf(card)?.setAttribute('aria-pressed', 'true');

    if (!video.getAttribute('src')) {
      const url = video.dataset.src;
      if (!url) return;
      video.addEventListener('playing', () => {
        card.dataset.motionState = 'playing';
      });
      video.addEventListener('error', () => {
        card.dataset.motionState = 'refused';
      });
      video.setAttribute('src', url);
    }
    /* Muted unless the visitor has explicitly asked to hear clips this visit —
       see src/scripts/app/clip-audio.ts for why the first unmute has to come
       from a click rather than from hover. */
    applyClipSound(video);
    const played = video.play();
    if (played && typeof played.catch === 'function') {
      played.catch(() => {
        /* Autoplay policy said no, or the file will not decode. The still is
           already what the user is looking at, so there is nothing to undo. */
        card.dataset.motionState = 'refused';
        buttonOf(card)?.setAttribute('aria-pressed', 'false');
      });
    }
  };

  /* The marker ships disabled so that no-JS and reduced-motion visitors get a
     marker instead of a dead control. This is the one place it turns into a
     button, and it turns back the moment reduced motion is switched on. */
  const syncMarkers = () => {
    const playable = !reduceMotion.matches;
    for (const card of cards) {
      const button = buttonOf(card);
      if (button) {
        button.disabled = !playable;
        const label = playable
          ? button.dataset.playLabel ?? button.dataset.idleLabel ?? ''
          : button.dataset.idleLabel ?? '';
        if (label) {
          button.setAttribute('aria-label', label);
          button.title = label;
        }
      }
      /* Sound is only meaningful where something can play, so it follows the
         same reduced-motion gate as the play pill. */
      const sound = soundOf(card);
      if (sound) {
        sound.disabled = !playable;
        syncSoundButton(sound);
      }
    }
  };
  syncMarkers();

  for (const card of cards) {
    const button = buttonOf(card);
    button?.addEventListener('click', (event) => {
      /* Home delegates tile clicks off the grid to pin a skill into the
         composer (src/scripts/app/home.ts). This tap means "show me it move",
         not "use this skill", so it must not reach that listener. */
      event.preventDefault();
      event.stopPropagation();
      if (reduceMotion.matches) return;
      const video = videoOf(card);
      if (video && !video.paused) stop(card);
      else start(card);
    });

    /* Sound toggle. Being inside a real click is precisely what makes the
       resulting audible playback legal, so the flip happens here and nowhere
       else. Repaints EVERY tile's control, not just this one, because the
       preference is page-wide. */
    soundOf(card)?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (reduceMotion.matches) return;
      toggleClipSound(videoOf(card));
      for (const other of cards) {
        const button = soundOf(other);
        if (button) syncSoundButton(button);
      }
    });

    if (!hoverPointer.matches) continue;
    /* Desktop hover-play, unchanged in behaviour. Bound to the link rather
       than the tile so that tabbing to the play marker does not also trip the
       focus preview — the marker is its own control now. */
    const link = card.querySelector<HTMLAnchorElement>('a.skill-card-link');
    card.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      start(card);
    });
    card.addEventListener('pointerleave', () => stop(card));
    /* Keyboard users get the same preview as mouse users. */
    link?.addEventListener('focus', () => start(card));
    link?.addEventListener('blur', () => stop(card));
  }

  /* Someone turning reduced motion on mid-session should see it take effect
     without a reload. */
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) stop(active);
    syncMarkers();
  });
}
