// Builds the background texture used behind both screens.
//
// Source: the image fill of layer "425379127320117182 1" (58:94 / 58:99) in the
// Figma file `playground`, downloaded once to assets-src/wall-texture.png.
// LOCAL USE ONLY: its rights are unverified, so the source and the output are
// gitignored and must not be deployed until the source is confirmed.
//
// In Figma the 3418×4096 image fills a 3609×4325 layer centred on the frame
// (≈1.056 CSS px per image px), so only its middle is ever visible. We keep
// that native scale and export just the central region a large desktop needs.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.join(root, 'assets-src', 'wall-texture.png');
const output = path.join(root, 'public', 'texture', 'wall-texture.webp');

// Central crop in image pixels; displayed at 2745×1901 CSS px (see surface.css).
const CROP = { width: 2600, height: 1800 };

const image = sharp(input, { limitInputPixels: false });
const { width, height } = await image.metadata();
if (width !== 3418 || height !== 4096) {
  throw new Error(`Unexpected texture size ${width}×${height}; the CSS sizing assumes 3418×4096.`);
}

await mkdir(path.dirname(output), { recursive: true });
await image
  .extract({
    left: Math.round((width - CROP.width) / 2),
    top: Math.round((height - CROP.height) / 2),
    width: CROP.width,
    height: CROP.height,
  })
  .webp({ quality: 72, effort: 6 })
  .toFile(output);

console.log(`✓ ${path.relative(root, output)} (${CROP.width}×${CROP.height})`);
