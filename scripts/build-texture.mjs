// Builds the paper texture behind the scrapbook (Screen 2).
//
// Fully procedural: no source image is read, so the output is original and
// safe to publish. The unverified Figma photo in assets-src/ is NOT used.
//
// Output: public/texture/wall-texture.webp — a seamless TILE×TILE tile, shown
// at half size (see .texture in src/styles.css) so it stays crisp on 2× screens.
// Every layer wraps around the tile edges, and the final mean colour is pinned
// to --cream (#f4f0e8) so the surface reads as the same cream, just tactile.
//
// Deterministic: the same SEED always produces the same file.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public', 'texture', 'wall-texture.webp');

const TILE = 1024;
const SEED = 0x1fe5c4a9;
const CREAM = [0xf4, 0xf0, 0xe8];

// ─── Helpers ─────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const wrap = (v) => ((v % TILE) + TILE) % TILE;
const idx = (x, y) => wrap(y) * TILE + wrap(x);
const N = TILE * TILE;

/** Value noise on a `cells`×`cells` lattice that repeats exactly once per tile. */
function periodicNoise(cells) {
  const lattice = Float32Array.from({ length: cells * cells }, () => rand() * 2 - 1);
  const out = new Float32Array(N);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let y = 0; y < TILE; y++) {
    const gy = (y / TILE) * cells;
    const y0 = Math.floor(gy);
    const ty = fade(gy - y0);
    const r0 = (y0 % cells) * cells;
    const r1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < TILE; x++) {
      const gx = (x / TILE) * cells;
      const x0 = Math.floor(gx);
      const tx = fade(gx - x0);
      const c0 = x0 % cells;
      const c1 = (x0 + 1) % cells;
      const a = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * tx;
      const b = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * tx;
      out[y * TILE + x] = a + (b - a) * ty;
    }
  }
  return out;
}

function fbm(baseCells, octaves) {
  const out = new Float32Array(N);
  let amp = 1;
  let total = 0;
  for (let o = 0, cells = baseCells; o < octaves; o++, cells *= 2, amp *= 0.55) {
    const layer = periodicNoise(cells);
    for (let i = 0; i < N; i++) out[i] += layer[i] * amp;
    total += amp;
  }
  for (let i = 0; i < N; i++) out[i] /= total;
  return out;
}

/** Separable box blur with wrap-around, so blurring never creates a seam. */
function blur(src, radius) {
  const tmp = new Float32Array(N);
  const out = new Float32Array(N);
  const span = radius * 2 + 1;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[idx(x + k, y)];
      tmp[y * TILE + x] = s / span;
    }
  }
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += tmp[idx(x, y + k)];
      out[y * TILE + x] = s / span;
    }
  }
  return out;
}

/** Soft round stamp merged into `buf` by keeping the max value, wrapping across tile edges. */
function stamp(buf, cx, cy, radius, value) {
  const r = Math.ceil(radius + 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(x0 + dx + 0.5 - cx, y0 + dy + 0.5 - cy);
      const cover = Math.min(1, Math.max(0, radius + 0.5 - d));
      if (cover > 0) {
        const i = idx(x0 + dx, y0 + dy);
        buf[i] = Math.max(buf[i], cover * value);
      }
    }
  }
}

/** A gently curving fibre, drawn as overlapping stamps along a random walk. */
function fibre(buf, length, width, strength) {
  let x = rand() * TILE;
  let y = rand() * TILE;
  // Slight machine-direction bias, as in real paper.
  let angle = rand() < 0.4 ? gauss() * 0.35 : rand() * Math.PI;
  const bend = 0.04 + rand() * 0.1;
  for (let s = 0; s < length; s += 0.6) {
    const taper = Math.sin(Math.PI * (s / length)) ** 0.6;
    stamp(buf, x, y, (width / 2) * (0.6 + 0.4 * taper), strength * taper);
    angle += gauss() * bend;
    x += Math.cos(angle) * 0.6;
    y += Math.sin(angle) * 0.6;
  }
}

// ─── Layers ──────────────────────────────────────────────────

// Broad cloudiness of pulp density, plus a finer mottle.
const cloud = fbm(3, 4);
const mottle = fbm(16, 3);

// Fibres: darker beige strands and paler ivory ones. Size in tile px (÷2 = CSS px).
const darkFibres = new Float32Array(N);
const lightFibres = new Float32Array(N);
for (let i = 0; i < 2600; i++) {
  const long = rand() < 0.18;
  const length = long ? 50 + rand() * 90 : 10 + rand() * 40;
  const width = 0.8 + rand() * (long ? 1.6 : 1.1);
  fibre(darkFibres, length, width, 0.35 + rand() * 0.65);
}
for (let i = 0; i < 1400; i++) {
  fibre(lightFibres, 12 + rand() * 60, 1 + rand() * 1.8, 0.4 + rand() * 0.6);
}
const darkSoft = blur(darkFibres, 1);
const lightSoft = blur(lightFibres, 1);

// Speckles: small pulp inclusions, mostly warm brown, a few pale flecks.
const specks = new Float32Array(N);
const flecks = new Float32Array(N);
for (let i = 0; i < 900; i++) {
  const big = rand() < 0.08;
  stamp(specks, rand() * TILE, rand() * TILE, big ? 1.4 + rand() * 1.4 : 0.5 + rand() * 0.9, 0.3 + rand() * 0.7);
}
for (let i = 0; i < 500; i++) stamp(flecks, rand() * TILE, rand() * TILE, 0.6 + rand() * 1.2, 0.4 + rand() * 0.6);

// Fine tooth: lightly blurred per-pixel grain.
const tooth = blur(Float32Array.from({ length: N }, () => rand() * 2 - 1), 1);

// Relief: a height field lit from the upper left gives the surface physical depth.
const height = new Float32Array(N);
for (let i = 0; i < N; i++) {
  height[i] = tooth[i] * 0.9 + darkSoft[i] * 0.8 + lightSoft[i] * 1.1 + mottle[i] * 0.6;
}

// ─── Compose ─────────────────────────────────────────────────

// `tone` < 0 darkens towards warm beige, > 0 lifts towards pale ivory.
const tone = new Float32Array(N);
for (let y = 0; y < TILE; y++) {
  for (let x = 0; x < TILE; x++) {
    const i = y * TILE + x;
    const light = (height[idx(x - 1, y - 1)] - height[idx(x + 1, y + 1)]) * 0.5;
    tone[i] =
      cloud[i] * 0.045 +
      mottle[i] * 0.03 +
      tooth[i] * 0.1 +
      light * 0.14 -
      darkSoft[i] * 0.17 +
      lightSoft[i] * 0.07 -
      specks[i] * 0.32 +
      flecks[i] * 0.06;
  }
}

const IVORY = [0xfc, 0xf9, 0xf2];
const BEIGE = [0xc9, 0xb8, 0x9c];
const rgb = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  const t = tone[i];
  for (let c = 0; c < 3; c++) {
    rgb[i * 3 + c] = t >= 0
      ? CREAM[c] + (IVORY[c] - CREAM[c]) * Math.min(1, t * 6)
      : CREAM[c] + (BEIGE[c] - CREAM[c]) * Math.min(1, -t * 3.2);
  }
}

// Pin the mean to --cream so the page colour is unchanged at a glance.
for (let c = 0; c < 3; c++) {
  let sum = 0;
  for (let i = 0; i < N; i++) sum += rgb[i * 3 + c];
  const shift = CREAM[c] - sum / N;
  for (let i = 0; i < N; i++) rgb[i * 3 + c] += shift;
}

const pixels = Buffer.alloc(N * 3);
for (let i = 0; i < N * 3; i++) pixels[i] = Math.max(0, Math.min(255, Math.round(rgb[i])));

await mkdir(path.dirname(output), { recursive: true });
await sharp(pixels, { raw: { width: TILE, height: TILE, channels: 3 } })
  .webp({ quality: 90, effort: 6, smartSubsample: true })
  .toFile(output);

console.log(`✓ ${path.relative(root, output)} (${TILE}×${TILE}, seamless tile)`);
