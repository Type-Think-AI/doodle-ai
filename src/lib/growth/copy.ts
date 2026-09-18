/** Homepage / onboarding conversion copy. Shared by HTML and the verify script. */

export const HERO_HEADLINE = "Turn your photo into a hand-drawn doodle";

export const HERO_SUBHEAD =
  "Stickers, couple portraits, pet doodles, and festival packs — free to start.";

export const HERO_PRIMARY_CTA = "Upload a photo";

export const HERO_SECONDARY_CTA = "Browse skills";

export const START_HERE_HEADING = "Start here";

export const CREDITS_TESTING_NOTE =
  "Credit packs are coming. During testing, credits may be topped up manually.";

export function heroProofLine(signupCredits: number): string {
  return `${signupCredits} free credits on signup · no card · results stay private`;
}

export function firstWinMessage(skillName: string, credits: number): string {
  return `Try a ${credits}-credit first doodle — attach a photo and run ${skillName}.`;
}

export function packCreditHint(name: string, images: number, credits: number): string | null {
  if (images <= 1) return null;
  const creditWord = credits === 1 ? "credit" : "credits";
  const imageWord = images === 1 ? "image" : "images";
  return `${name} uses ${credits} ${creditWord} · ${images} ${imageWord}`;
}
