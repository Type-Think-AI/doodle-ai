#!/usr/bin/env node

/**
 * Generate Doodle AI brand assets from the logo used in
 * src/components/app/Sidebar.astro.
 *
 * This intentionally uses macOS `sips` instead of adding an image package to
 * the application. The sidebar logo remains the source of truth: a yellow
 * rounded square and the dark hand-drawn wave path.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const brandDir = join(publicDir, "brand");
const generatedDir = mkdtempSync(join(tmpdir(), "doodleai-brand-"));

const BRAND_YELLOW = "#FAB700";
const BRAND_INK = "#3D2900";

const wavePath =
  '<path d="M2.5 15c1.5-6.5 3-9.5 4.8-9.5S9 10 11 10s2-6 4.3-6 2.6 6.8 4.2 6.8 1.5-2.3 3-2.3" stroke="' +
  BRAND_INK +
  '" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>';

function logoSvg({ maskable = false } = {}) {
  const background = maskable
    ? '<rect width="128" height="128" fill="' + BRAND_YELLOW + '"/>'
    : '<rect width="128" height="128" rx="28" fill="' + BRAND_YELLOW + '"/>';
  const mark = '<g transform="translate(25 26) scale(3.2)">' + wavePath + "</g>";

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">',
    background,
    mark,
    "</svg>",
    "",
  ].join("\n");
}

function writeSvg(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function rasterize(source, output, size) {
  mkdirSync(dirname(output), { recursive: true });
  execFileSync("sips", ["-s", "format", "png", "-z", String(size), String(size), source, "--out", output], {
    stdio: "ignore",
  });
}

function createIco(output, pngPaths) {
  const pngs = pngPaths.map((entry) => ({
    size: entry.size,
    data: readFileSync(entry.path),
  }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const directory = Buffer.alloc(16 * pngs.length);
  let offset = header.length + directory.length;
  pngs.forEach(({ size, data }, index) => {
    const base = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, base);
    directory.writeUInt8(size >= 256 ? 0 : size, base + 1);
    directory.writeUInt8(0, base + 2);
    directory.writeUInt8(0, base + 3);
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(data.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += data.length;
  });

  writeFileSync(output, Buffer.concat([header, directory, ...pngs.map(({ data }) => data)]));
}

mkdirSync(brandDir, { recursive: true });
mkdirSync(generatedDir, { recursive: true });

const normalSvg = join(generatedDir, "doodleai-mark.svg");
const maskableSvg = join(generatedDir, "doodleai-mark-maskable.svg");
writeSvg(normalSvg, logoSvg());
writeSvg(maskableSvg, logoSvg({ maskable: true }));

writeSvg(join(brandDir, "doodleai-mark.svg"), logoSvg());
writeSvg(join(publicDir, "favicon.svg"), logoSvg());

const normalPngs = [
  { size: 16, path: join(generatedDir, "favicon-16.png") },
  { size: 32, path: join(generatedDir, "favicon-32.png") },
  { size: 48, path: join(generatedDir, "favicon-48.png") },
  { size: 180, path: join(publicDir, "apple-touch-icon.png") },
  { size: 192, path: join(publicDir, "icon-192.png") },
  { size: 512, path: join(publicDir, "icon-512.png") },
];
normalPngs.forEach(({ size, path }) => rasterize(normalSvg, path, size));
rasterize(maskableSvg, join(publicDir, "icon-maskable-512.png"), 512);

createIco(join(publicDir, "favicon.ico"), normalPngs.slice(0, 3));
rmSync(generatedDir, { recursive: true, force: true });

console.log("Generated Doodle AI brand assets:");
console.log("  public/brand/doodleai-mark.svg");
console.log("  public/favicon.svg");
console.log("  public/favicon.ico");
console.log("  public/apple-touch-icon.png");
console.log("  public/icon-192.png");
console.log("  public/icon-512.png");
console.log("  public/icon-maskable-512.png");
