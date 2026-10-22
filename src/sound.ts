// Quiet, tactile interaction sounds (public/sounds; see scripts/build-sounds.mjs —
// tap, cover and the typewriter keys are synthesised there, page is cut from a
// page-flip recording).
//
// Web Audio is only started inside a user gesture (or where the browser reports
// autoplay is allowed), so nothing plays before the visitor interacts. Every
// failure — no Web Audio, a missing file, a blocked context — simply means
// silence; callers never see an error.

const VOLUME = { tap: 0.18, page: 0.28, cover: 0.32, key1: 0.18, key2: 0.18, key3: 0.18 } as const;
export type Sound = keyof typeof VOLUME;

/** A repeat of the same sound within this window is dropped, not layered. */
const MIN_GAP = 90;

const names = Object.keys(VOLUME) as Sound[];

// The files are tiny; fetching early means the first click isn't late.
// Decoding waits until there is an AudioContext.
const files = new Map(
  names.map((name) => [
    name,
    fetch(`${import.meta.env.BASE_URL}sounds/${name}.wav`)
      .then((r) => (r.ok ? r.arrayBuffer() : undefined))
      .catch(() => undefined),
  ]),
);

let ctx: AudioContext | undefined;
const buffers = new Map<Sound, Promise<AudioBuffer | undefined>>();
/** Buffers that have finished decoding, for sounds that must play on time. */
const decoded = new Map<Sound, AudioBuffer>();
const voices = new Map<Sound, { gain: GainNode; source: AudioBufferSourceNode; at: number }>();

function context() {
  if (!ctx && typeof AudioContext === 'function') {
    ctx = new AudioContext();
    for (const name of names) {
      buffers.set(
        name,
        files
          .get(name)!
          .then((data) => (data ? ctx!.decodeAudioData(data) : undefined))
          .then((buffer) => {
            if (buffer) decoded.set(name, buffer);
            return buffer;
          })
          .catch(() => undefined),
      );
    }
  }
  return ctx;
}

/**
 * Starts audio inside a user gesture. Browsers only let audio start on some
 * gestures — on touch screens the end of a tap (pointerup, touchend, click),
 * not its start — so every kind is tried until the context is running. Resuming
 * and playing one silent sample here also unlocks iOS. Decoding starts with the
 * context, before any sound is asked for.
 */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

function unlock() {
  safely(() => {
    const audio = context();
    if (!audio) return stopListening();
    if (audio.state !== 'running') {
      audio.resume().then(() => audio.state === 'running' && stopListening(), () => undefined);
      const silence = audio.createBufferSource();
      silence.buffer = audio.createBuffer(1, 1, audio.sampleRate);
      silence.connect(audio.destination);
      silence.start();
    } else {
      stopListening();
    }
  });
}

function stopListening() {
  for (const type of GESTURES) window.removeEventListener(type, unlock, { capture: true });
}

for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true });

/**
 * Starts audio without a gesture, but only where the browser says that is
 * allowed (the Autoplay Policy Detection API); elsewhere audio waits for the
 * visitor's first click, tap or key, as browsers require.
 */
export function primeAudio() {
  safely(() => {
    const nav = navigator as Navigator & { getAutoplayPolicy?: (type: 'audiocontext') => string };
    if (nav.getAutoplayPolicy?.('audiocontext') === 'allowed') unlock();
  });
}

function safely<T>(fn: () => T) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** Play one sound. Call only from a user interaction handler. */
export function play(name: Sound) {
  safely(() => {
    const now = performance.now();
    const last = voices.get(name);
    if (last && now - last.at < MIN_GAP) return;

    const audio = context();
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume().catch(() => undefined);

    // Hold the slot now, so rapid clicks during decoding don't queue up.
    const voice = { at: now } as { gain: GainNode; source: AudioBufferSourceNode; at: number };
    voices.set(name, voice);

    buffers
      .get(name)!
      .then((buffer) =>
        safely(() => {
          if (!buffer || voices.get(name) !== voice) return;
          // A still-ringing copy of this sound fades out rather than stacking.
          if (last?.source) {
            last.gain.gain.setTargetAtTime(0, audio.currentTime, 0.015);
            last.source.stop(audio.currentTime + 0.08);
          }
          const gain = audio.createGain();
          gain.gain.value = VOLUME[name];
          const source = audio.createBufferSource();
          source.buffer = buffer;
          // A touch of variation so repeated turns don't sound mechanical.
          source.playbackRate.value = 0.96 + Math.random() * 0.08;
          source.connect(gain).connect(audio.destination);
          source.start();
          voice.gain = gain;
          voice.source = source;
        }),
      )
      .catch(() => undefined);
  });
}

/**
 * Play a sound now or not at all: only once audio is running (after the
 * visitor's first click, tap or key, or at once where autoplay is allowed) and
 * the sound is decoded, and never while the page is hidden. For sounds timed to
 * an animation (the typewriter keys), so they are never late, queued up, or
 * released in a burst when audio unlocks.
 * `level` scales its volume. Unlike play(), this never creates the context.
 */
export function tick(name: Sound, level = 1) {
  safely(() => {
    const buffer = decoded.get(name);
    if (!ctx || ctx.state !== 'running' || !buffer || document.hidden) return;
    const audio = ctx;
    const last = voices.get(name);
    if (last?.source) {
      last.gain.gain.setTargetAtTime(0, audio.currentTime, 0.005);
      last.source.stop(audio.currentTime + 0.03);
    }
    const gain = audio.createGain();
    gain.gain.value = VOLUME[name] * level;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.96 + Math.random() * 0.08;
    source.connect(gain).connect(audio.destination);
    source.start();
    voices.set(name, { gain, source, at: performance.now() });
  });
}

/** Silence these sounds at once (a very short fade, so there is no click). */
export function hush(names: readonly Sound[]) {
  safely(() => {
    if (!ctx) return;
    for (const name of names) {
      const voice = voices.get(name);
      if (!voice?.source) continue;
      voice.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.004);
      voice.source.stop(ctx.currentTime + 0.02);
      voices.delete(name);
    }
  });
}
