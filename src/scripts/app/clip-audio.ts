/* Hearing a tile animation, without ever ambushing anyone.
 *
 * THE RULE THIS ENCODES. Hovering a tile plays the animation SILENTLY. Sound is
 * opt-in, once, via a speaker control on the tile — and after that one opt-in
 * every clip the visitor hovers for the rest of the visit comes up with sound
 * already on. So the quiet default and "I want to hear these" are both honoured
 * without asking twice.
 *
 * WHY THE FIRST UNMUTE MUST BE A CLICK, and this is not a choice we get to make:
 * every current browser blocks audible autoplay until the visitor has interacted
 * with the page (Chrome's autoplay policy and its Media Engagement Index,
 * Safari's and Firefox's equivalents). A `video.muted = false` before any gesture
 * does not produce sound — it makes `play()` REJECT, so the clip stops moving
 * too. That is strictly worse than staying muted: the visitor loses the animation
 * and gains no audio. Hence: muted until a real click, sticky afterwards.
 *
 * WHY EXCLUSIVE. A wall of tiles hover-plays one clip at a time today, but the
 * showcase page stacks several and an IntersectionObserver can have more than one
 * running. Two soundtracks at once is unusable, so at most ONE clip on the page
 * is ever audible — the same rule, and the same reasoning, as
 * src/lib/canvas/video-audio.ts applies to the board.
 *
 * SCOPE. Every participating clip carries `data-clip-audio`, so this module is
 * surface-agnostic: the skills wall and the showcase share one exclusivity group
 * and one preference. It never calls `play()` or `pause()` on its own — playback
 * is each surface's business, and this only decides what is audible.
 *
 * The lightbox is deliberately NOT in this group. Opening the viewer is already a
 * deliberate act and it plays with sound on purpose (see src/scripts/app/
 * lightbox.ts); routing it through a shared mute preference would let a tile
 * toggle silence the viewer.
 */

/** Marks a clip as a member of the shared exclusivity group. */
const CLIP_SELECTOR = "video[data-clip-audio]";

/**
 * Per-TAB, not permanent. A visitor who turns sound on while browsing skills
 * means it for this visit; resurrecting it silently on a cold visit weeks later
 * is the kind of surprise this whole module exists to avoid. sessionStorage
 * expresses exactly that lifetime.
 */
const STORAGE_KEY = "doodle:clip-sound";

/** Safari's private mode throws on storage access, so every touch is guarded. */
function readStoredPreference(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeStoredPreference(on: boolean): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* Storage unavailable. The in-memory value below still governs this page. */
  }
}

/* Mirrored in memory so the preference keeps working when storage is blocked. */
let soundOn = readStoredPreference();

/** Whether the visitor has asked to hear clips during this visit. */
export function isClipSoundOn(): boolean {
  return soundOn;
}

function allClips(): HTMLVideoElement[] {
  return Array.from(document.querySelectorAll<HTMLVideoElement>(CLIP_SELECTOR));
}

/** Silence every clip except `keep`. */
function muteOthers(keep: HTMLVideoElement | null): void {
  for (const clip of allClips()) {
    if (clip !== keep) clip.muted = true;
  }
}

/**
 * Decide whether THIS clip should be audible, at the moment it starts playing.
 *
 * Called by each surface's own start path in place of a hardcoded
 * `video.muted = true`. With sound off (the default) this is exactly the old
 * behaviour. With sound on it unmutes this clip and silences the rest, which is
 * the "already on for the next one" half of the feature.
 */
export function applyClipSound(video: HTMLVideoElement): void {
  if (!soundOn) {
    video.muted = true;
    return;
  }
  muteOthers(video);
  video.muted = false;
}

/**
 * Flip the visitor's sound preference. MUST be called from a real click handler:
 * being inside a genuine user gesture is what makes the resulting audible
 * playback legal (see the autoplay note at the top).
 *
 * `video` is the clip the visitor clicked on, so turning sound ON makes that one
 * audible immediately rather than waiting for the next hover. Passing null is
 * fine — the preference still flips and applies to whatever plays next.
 *
 * Returns the state actually reached, so a caller renders what happened.
 */
export function toggleClipSound(video: HTMLVideoElement | null): boolean {
  soundOn = !soundOn;
  writeStoredPreference(soundOn);

  if (!soundOn) {
    /* Off means off everywhere, not just on the tile that was clicked. */
    muteOthers(null);
    return false;
  }

  if (video) {
    muteOthers(video);
    video.muted = false;
    /* If the visitor asked for sound on a clip that is sitting paused, a silent
       still is a button that said yes and did nothing. A rejected play() is
       swallowed: the unmute has already happened and a rejection is not
       something the visitor can act on. */
    if (video.paused) void video.play().catch(() => {});
  }
  return true;
}

/**
 * Paint one speaker control to match the current preference.
 *
 * Centralised so both surfaces label it identically, and in consumer words: this
 * audience is told "sound", never "audio track" or "unmute".
 */
export function syncSoundButton(button: HTMLButtonElement): void {
  const on = soundOn;
  button.setAttribute("aria-pressed", on ? "true" : "false");
  const label = on ? "Turn sound off" : "Turn sound on";
  button.setAttribute("aria-label", label);
  button.title = label;
}

/** Repaint every speaker control on the page. */
export function syncAllSoundButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-clip-sound]")) {
    syncSoundButton(button);
  }
}
