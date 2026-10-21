// Synthesises the three quiet interaction sounds as small mono WAVs, so the
// site needs no third-party audio. Deterministic: same output on every run.
//
//   npm run sounds   # writes public/sounds/{tap,page,cover}.wav
//
//   tap   — a soft, papery tick for the footer links (~45 ms)
//   page  — a short paper "fwip" for turning a spread (~300 ms)
//   cover — a slower board swoosh with a soft landing, for opening / closing (~520 ms)
//
// Files peak at −6 dBFS; the site plays them quieter still (src/sound.ts).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'sounds');
const RATE = 44100;

/** Seeded PRNG (mulberry32) so the noise is identical on every build. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noise = (n, seed) => {
  const r = random(seed);
  return Float64Array.from({ length: n }, () => r() * 2 - 1);
};

/** RBJ biquad filter, applied in place. */
function biquad(x, type, freq, q = 0.707) {
  const w = (2 * Math.PI * freq) / RATE;
  const a = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const [b0, b1, b2] =
    type === 'lowpass' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'highpass' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [a, 0, -a];
  const [a0, a1, a2] = [1 + a, -2 * c, 1 - a];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/** Normalise to −6 dBFS with 3 ms fades at both ends (no clicks). */
function finish(x) {
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const fade = Math.round(0.003 * RATE);
  return x.map((v, i) => (v / peak) * 0.5 * Math.min(1, i / fade, (x.length - 1 - i) / fade));
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const len = (s) => Math.round(s * RATE);
const t = (i) => i / RATE;

// tap: band-passed noise with a very fast decay, plus a faint woody tone.
function tap() {
  const x = biquad(noise(len(0.045), 7), 'bandpass', 1900, 1.1);
  for (let i = 0; i < x.length; i++) {
    x[i] = x[i] * Math.exp(-t(i) / 0.006) + 0.12 * Math.sin(2 * Math.PI * 1150 * t(i)) * Math.exp(-t(i) / 0.009);
  }
  return biquad(x, 'lowpass', 5200);
}

// page: airy paper noise in a skewed hump, roughened by slow random "crinkle".
function page() {
  const n = len(0.3);
  const x = biquad(biquad(noise(n, 11), 'highpass', 900), 'lowpass', 5500);
  const crinkle = biquad(biquad(noise(n, 12), 'lowpass', 60), 'lowpass', 60);
  const cPeak = crinkle.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const hump = Math.pow(Math.sin(Math.PI * Math.pow(p, 0.6)), 2);
    x[i] *= hump * (0.65 + 0.35 * (crinkle[i] / cPeak));
  }
  return x;
}

// cover: a darker, slower swoosh, then a soft low landing as the board settles.
function cover() {
  const n = len(0.52);
  const x = biquad(biquad(noise(n, 23), 'highpass', 180), 'lowpass', 1700);
  const landing = biquad(noise(n, 24), 'lowpass', 420);
  const at = 0.36;
  for (let i = 0; i < n; i++) {
    const s = t(i);
    const p = Math.min(1, s / at);
    const swoosh = s < at ? Math.pow(Math.sin(Math.PI * p * 0.92), 2) : Math.pow(Math.sin(Math.PI * 0.92), 2) * Math.exp(-(s - at) / 0.03);
    const after = s - at;
    const thump = after >= 0 ? Math.exp(-after / 0.05) : 0;
    x[i] = 0.55 * x[i] * swoosh + thump * (0.5 * Math.sin(2 * Math.PI * (90 - 25 * Math.min(1, after / 0.08)) * after) + 0.6 * landing[i]);
  }
  return x;
}

await mkdir(outDir, { recursive: true });
for (const [name, make] of Object.entries({ tap, page, cover })) {
  const file = path.join(outDir, `${name}.wav`);
  await writeFile(file, wav(finish(make())));
  console.log(`✓ public/sounds/${name}.wav`);
}
