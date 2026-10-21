// Quiet, tactile interaction sounds (public/sounds, made by scripts/build-sounds.mjs).
//
// Web Audio is only started inside a user gesture, so nothing plays before the
// visitor interacts. Every failure — no Web Audio, a missing file, a blocked
// context — simply means silence; callers never see an error.

const VOLUME = { tap: 0.18, page: 0.28, cover: 0.32 } as const;
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
          .catch(() => undefined),
      );
    }
  }
  return ctx;
}

// Start decoding on the visitor's first gesture, before any sound is asked for.
for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, () => void safely(context), { capture: true, once: true });
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
