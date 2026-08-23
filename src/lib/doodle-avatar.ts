/* SVG doodle-avatar builder, migrated from DoodleMe (src/app/page.tsx).
   Pure string builders — safe to call at build time (Astro) or in the browser.
   Used to render the decorative sample rail. */

import type { AvatarAttrs, Theme } from "./doodle-constants";
import { ACC_POOL, EARRING_STYLES, EXPR_KEYS, HAIR_COLORS, HAIR_KEYS, MOUTH_KEYS, SKIN_TONES, pick } from "./doodle-constants";

function wobbleFilterDefs(): string {
  return '<filter id="wob" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.01 0.03" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter>';
}

const HAIR: Record<string, (c: string) => string> = {
  "curly-crop": (c) => {
    const xs = [58, 74, 90, 106, 122, 138, 154, 170, 182];
    return xs.map((x, i) => `<circle cx="${x}" cy="${62 + (i % 2 === 0 ? 0 : 6)}" r="16" fill="${c}" stroke="#20180F" stroke-width="4"/>`).join("");
  },
  "long-wavy": (c) => `<path d="M58 100 C50 55, 80 30, 120 30 C160 30, 190 55, 182 100 C188 140, 178 195, 160 215 C168 170, 158 140, 150 118 C150 150, 145 190, 132 210 C138 170, 132 140, 120 122 C120 155, 112 195, 100 212 C104 172, 96 140, 88 118 C82 150, 70 190, 58 208 C68 168, 62 140, 58 100 Z" fill="${c}" stroke="#20180F" stroke-width="4"/>`,
  "spiky": (c) => `<polygon points="60,95 72,40 86,92 100,32 114,92 128,38 142,92 156,42 168,92 180,95" fill="${c}" stroke="#20180F" stroke-width="4" stroke-linejoin="round"/>`,
  "buzz-fade": (c) => `<path d="M60 95 C58 55, 85 38, 120 38 C155 38, 182 55, 180 95 C180 80, 160 62, 120 62 C80 62, 60 80, 60 95 Z" fill="${c}" stroke="#20180F" stroke-width="4"/><circle cx="90" cy="55" r="2" fill="#20180F" opacity=".5"/><circle cx="110" cy="48" r="2" fill="#20180F" opacity=".5"/><circle cx="132" cy="50" r="2" fill="#20180F" opacity=".5"/><circle cx="150" cy="58" r="2" fill="#20180F" opacity=".5"/>`,
  "double-bun": (c) => `<path d="M60 98 C58 60, 84 42, 120 42 C156 42, 182 60, 180 98 Z" fill="${c}" stroke="#20180F" stroke-width="4"/><circle cx="82" cy="44" r="17" fill="${c}" stroke="#20180F" stroke-width="4"/><circle cx="158" cy="44" r="17" fill="${c}" stroke="#20180F" stroke-width="4"/>`,
  "straight-bob": (c) => `<path d="M56 130 C52 60, 82 34, 120 34 C158 34, 188 60, 184 130 L184 108 C184 84, 158 66, 120 66 C82 66, 56 84, 56 108 Z" fill="${c}" stroke="#20180F" stroke-width="4"/><path d="M112 66 L108 96 M128 66 L132 96" stroke="#20180F" stroke-width="3" fill="none"/>`,
};

const EYES: Record<string, string> = {
  smile: '<path d="M84 122 Q95 112 106 122" stroke="#20180F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M134 122 Q145 112 156 122" stroke="#20180F" stroke-width="4" fill="none" stroke-linecap="round"/>',
  wink: '<path d="M84 122 Q95 112 106 122" stroke="#20180F" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="145" cy="120" r="6" fill="#20180F"/><circle cx="147" cy="118" r="1.6" fill="#fff"/>',
  surprised: '<circle cx="95" cy="122" r="9" fill="#fff" stroke="#20180F" stroke-width="3.5"/><circle cx="95" cy="122" r="4" fill="#20180F"/><circle cx="145" cy="122" r="9" fill="#fff" stroke="#20180F" stroke-width="3.5"/><circle cx="145" cy="122" r="4" fill="#20180F"/>',
  smirk: '<path d="M82 114 Q95 108 108 113" stroke="#20180F" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="95" cy="122" r="5" fill="#20180F"/><path d="M136 120 Q146 116 156 120" stroke="#20180F" stroke-width="4" fill="none" stroke-linecap="round"/>',
  serious: '<path d="M85 121 L107 121" stroke="#20180F" stroke-width="4" stroke-linecap="round"/><path d="M135 121 L157 121" stroke="#20180F" stroke-width="4" stroke-linecap="round"/><path d="M82 111 L108 115" stroke="#20180F" stroke-width="3" stroke-linecap="round"/><path d="M134 115 L160 111" stroke="#20180F" stroke-width="3" stroke-linecap="round"/>',
};

const MOUTHS: Record<string, string> = {
  "smile-open": '<path d="M100 158 Q120 176 140 158 Q120 168 100 158 Z" fill="#B23A2E" stroke="#20180F" stroke-width="3.5"/>',
  "smile-closed": '<path d="M100 160 Q120 172 140 160" stroke="#20180F" stroke-width="4" fill="none" stroke-linecap="round"/>',
  "smirk-mouth": '<path d="M102 162 Q122 168 136 156" stroke="#20180F" stroke-width="4" fill="none" stroke-linecap="round"/>',
  "neutral": '<path d="M104 162 L136 162" stroke="#20180F" stroke-width="4" stroke-linecap="round"/>',
  "surprised-o": '<ellipse cx="120" cy="162" rx="8" ry="10" fill="#B23A2E" stroke="#20180F" stroke-width="3.5"/>',
};

function earringsSVG(style: string, accent: string): string {
  if (style === "stud") return `<circle cx="58" cy="140" r="4" fill="${accent}" stroke="#20180F" stroke-width="2"/><circle cx="182" cy="140" r="4" fill="${accent}" stroke="#20180F" stroke-width="2"/>`;
  if (style === "hoop") return `<circle cx="58" cy="146" r="8" fill="none" stroke="${accent}" stroke-width="4"/><circle cx="182" cy="146" r="8" fill="none" stroke="${accent}" stroke-width="4"/>`;
  return `<path d="M58 138 q0 16 0 22" stroke="${accent}" stroke-width="3"/><circle cx="58" cy="164" r="5" fill="${accent}" stroke="#20180F" stroke-width="2"/><path d="M182 138 q0 16 0 22" stroke="${accent}" stroke-width="3"/><circle cx="182" cy="164" r="5" fill="${accent}" stroke="#20180F" stroke-width="2"/>`;
}

function glassesSVG(): string {
  return '<circle cx="95" cy="122" r="17" fill="#fff" fill-opacity=".15" stroke="#20180F" stroke-width="3.5"/><circle cx="145" cy="122" r="17" fill="#fff" fill-opacity=".15" stroke="#20180F" stroke-width="3.5"/><path d="M112 122 L128 122" stroke="#20180F" stroke-width="3.5"/>';
}

function frecklesSVG(): string {
  return [[88, 138], [96, 142], [104, 136], [136, 136], [144, 142], [152, 138]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#20180F" opacity=".55"/>`).join("");
}

function headbandSVG(accent: string): string {
  return `<path d="M58 92 Q120 74 182 92" stroke="${accent}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
}

function noseRingSVG(): string {
  return '<circle cx="118" cy="145" r="3.5" fill="none" stroke="#20180F" stroke-width="2.5"/>';
}

export function buildAvatarSVG(attrs: AvatarAttrs, theme: Theme): string {
  const hairFn = HAIR[attrs.hairStyle] || HAIR["curly-crop"];
  const eyes = EYES[attrs.expression] || EYES.smile;
  const mouth = MOUTHS[attrs.mouth] || MOUTHS["smile-closed"];
  let overlays = "";
  if (attrs.accessories.includes("earrings")) overlays += earringsSVG(attrs.earringStyle || "hoop", theme.accent);
  if (attrs.accessories.includes("glasses")) overlays += glassesSVG();
  if (attrs.accessories.includes("nose-ring")) overlays += noseRingSVG();
  if (attrs.accessories.includes("freckles")) overlays += frecklesSVG();
  if (attrs.accessories.includes("headband")) overlays += headbandSVG(theme.accent);
  return `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Doodle avatar"><defs>${wobbleFilterDefs()}</defs><rect width="240" height="240" fill="${theme.bg}"/><g filter="url(#wob)"><ellipse cx="120" cy="132" rx="62" ry="58" fill="${attrs.skinTone}" stroke="#20180F" stroke-width="5"/><ellipse cx="60" cy="132" rx="9" ry="13" fill="${attrs.skinTone}" stroke="#20180F" stroke-width="4"/><ellipse cx="180" cy="132" rx="9" ry="13" fill="${attrs.skinTone}" stroke="#20180F" stroke-width="4"/>${hairFn(attrs.hairColor)}<ellipse cx="90" cy="152" rx="10" ry="6" fill="${theme.accent}" opacity=".45"/><ellipse cx="150" cy="152" rx="10" ry="6" fill="${theme.accent}" opacity=".45"/>${eyes}${mouth}${overlays}</g></svg>`;
}

export function randomAttrs(): AvatarAttrs {
  const accCount = Math.floor(Math.random() * 3);
  const pool = [...ACC_POOL];
  const accs: string[] = [];
  for (let i = 0; i < accCount; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    accs.push(pool.splice(idx, 1)[0]);
  }
  return {
    hairStyle: pick(HAIR_KEYS),
    hairColor: pick(HAIR_COLORS),
    skinTone: pick(SKIN_TONES),
    expression: pick(EXPR_KEYS),
    mouth: pick(MOUTH_KEYS),
    accessories: accs,
    earringStyle: pick(EARRING_STYLES),
  };
}
