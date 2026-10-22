// Synthesises the quiet interaction sounds other than the page turn as small
// mono WAVs. Deterministic: same output on every run.
//
//   npm run sounds   # writes public/sounds/{tap,cover,key1,key2,key3}.wav
//
//   tap   — a soft, papery tick for the footer links (~45 ms)
//   cover — a slower board swoosh with a soft landing, for opening / closing (~520 ms)
//   key1–3 — three slightly different typewriter keys for the opening question (~90 ms)
//
// Files peak at −6 dBFS (the keys at −1 dBFS: they are very short, so they need
// the headroom to be heard); the site plays them quieter still (src/sound.ts).
//
// public/sounds/page.wav (turning a spread) is NOT made here: it is the first of
// the five flips in public/sounds/Book Page Flip Sound Effects.mp3 (the audio of
// "Book Page Flip Sound Effects" by Zee Effects, https://youtu.be/5pOa1-qfh8Y,
// supplied by the site owner). The MP3 is kept as the untouched source and left
// out of the build (vite.config.js). The cut skips the quiet lead-in so the flick
// lands with the 200ms turn, and the gain is lowered in float first because the
// MP3 decodes slightly above full scale:
//
//   ffmpeg -i "public/sounds/Book Page Flip Sound Effects.mp3" -af "atrim=start=0.22:end=0.70,
//     asetpts=PTS-STARTPTS,pan=mono|c0=0.5*c0+0.5*c1,volume=0.56,
//     afade=t=in:d=0.02,afade=t=out:st=0.42:d=0.06" -ar 44100 -c:a pcm_s16le public/sounds/page.wav

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

/** Normalise to `level` (default −6 dBFS) with 3 ms fades at both ends (no clicks). */
function finish(x, level = 0.5) {
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const fade = Math.round(0.003 * RATE);
  return x.map((v, i) => (v / peak) * level * Math.min(1, i / fade, (x.length - 1 - i) / fade));
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

// key: a typewriter key. The key going down (a faint high tick), then the
// typebar meeting the platen a few ms later (a short band of noise over a
// woody body tone and a low thunk), the bar's small rebound off the platen,
// and a trace of metallic ring. A gentle soft clip gives the strike some body
// without an edge, and a high-pass keeps its weight in the 1–4 kHz clack that
// small laptop and phone speakers reproduce. Each variant shifts the pitches
// and timing a little so a run of keys doesn't repeat.
function key({ seed, strike, body, thunk, ring, at }) {
  const n = len(0.09);
  const press = biquad(noise(n, seed), 'highpass', 3500);
  const clack = biquad(noise(n, seed + 1), 'bandpass', strike, 1.4);
  const rebound = biquad(noise(n, seed + 2), 'bandpass', strike * 1.35, 2);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = t(i);
    const hit = s - at;
    const back = hit - 0.021;
    x[i] = 0.25 * press[i] * Math.exp(-s / 0.0015);
    if (hit >= 0) {
      x[i] +=
        clack[i] * Math.exp(-hit / 0.007) +
        0.2 * Math.sin(2 * Math.PI * body * hit) * Math.exp(-hit / 0.009) +
        0.12 * Math.sin(2 * Math.PI * thunk * hit) * Math.exp(-hit / 0.015) +
        0.05 * Math.sin(2 * Math.PI * ring * hit) * Math.exp(-hit / 0.03);
    }
    if (back >= 0) x[i] += 0.22 * rebound[i] * Math.exp(-back / 0.004);
  }
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  return biquad(biquad(x.map((v) => Math.tanh((1.8 * v) / peak)), 'highpass', 250), 'lowpass', 7000);
}

const key1 = () => key({ seed: 31, strike: 2300, body: 1050, thunk: 170, ring: 4100, at: 0.008 });
const key2 = () => key({ seed: 37, strike: 2600, body: 1180, thunk: 185, ring: 4600, at: 0.01 });
const key3 = () => key({ seed: 41, strike: 2050, body: 960, thunk: 160, ring: 3800, at: 0.007 });

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
const KEY_LEVEL = 0.89; // −1 dBFS
for (const [name, make] of Object.entries({ tap, cover, key1, key2, key3 })) {
  const file = path.join(outDir, `${name}.wav`);
  await writeFile(file, wav(finish(make(), name.startsWith('key') ? KEY_LEVEL : undefined)));
  console.log(`✓ public/sounds/${name}.wav`);
}
