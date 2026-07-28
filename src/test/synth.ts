import { midiToHz } from '../audio/notes';

export interface SynthNote {
  midi: number;
  startMs: number;
  durationMs: number;
  /** Peak amplitude, 0..1. */
  gain?: number;
}

export interface SynthOptions {
  sampleRate?: number;
  /** Extra tail after the last note, in milliseconds. */
  tailMs?: number;
  /** Broadband noise floor amplitude. */
  noiseAmplitude?: number;
  /** Deterministic seed so fixtures are reproducible. */
  seed?: number;
}

/** Mulberry32 — small, deterministic, good enough for noise. */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A plucked-string approximation: a decaying harmonic stack with a fast attack
 * and a noisy pick transient. Enough structure to exercise pitch tracking,
 * spectral flux and octave correction without a real guitar in the room.
 */
export function synthesizeNotes(notes: SynthNote[], options: SynthOptions = {}): Float32Array {
  const sampleRate = options.sampleRate ?? 44100;
  const tailMs = options.tailMs ?? 500;
  const random = makeRandom(options.seed ?? 1);
  const endMs = notes.reduce((max, n) => Math.max(max, n.startMs + n.durationMs), 0) + tailMs;
  const out = new Float32Array(Math.ceil((endMs / 1000) * sampleRate));

  for (const note of notes) {
    const f0 = midiToHz(note.midi);
    const gain = note.gain ?? 0.6;
    const start = Math.floor((note.startMs / 1000) * sampleRate);
    const length = Math.floor((note.durationMs / 1000) * sampleRate);
    const attack = Math.floor(0.004 * sampleRate);
    // Strings are damped, not cut: an abrupt end would be a click, i.e. an onset.
    const release = Math.floor(0.03 * sampleRate);
    const phase = random() * Math.PI * 2;

    const partials: { hz: number; amp: number }[] = [];
    for (let h = 1; h <= 12; h++) {
      const hz = f0 * h;
      if (hz > sampleRate / 2 - 1000) break;
      // Wound strings put a lot of energy in the upper partials, which is what
      // makes octave errors so common.
      partials.push({ hz, amp: 1 / Math.pow(h, 1.2) });
    }
    const norm = partials.reduce((sum, p) => sum + p.amp, 0);

    for (let i = 0; i < length; i++) {
      const idx = start + i;
      if (idx >= out.length) break;
      const t = i / sampleRate;
      const remaining = length - i;
      const env =
        (i < attack ? i / attack : 1) *
        (remaining < release ? remaining / release : 1) *
        Math.exp(-t * (2.2 + 0.002 * f0)) *
        gain;
      let sample = 0;
      for (const p of partials) {
        // Higher partials die faster, as on a real string.
        const decay = Math.exp((-t * p.hz) / 900);
        sample += p.amp * decay * Math.sin(2 * Math.PI * p.hz * t + phase);
      }
      sample /= norm;
      const pick = i < attack ? (random() * 2 - 1) * 0.5 * (1 - i / attack) : 0;
      out[idx] += env * (sample + pick);
    }
  }

  const noise = options.noiseAmplitude ?? 0.0015;
  if (noise > 0) {
    for (let i = 0; i < out.length; i++) out[i] += (random() * 2 - 1) * noise;
  }
  return out;
}

/** Room tone plus typing clicks and a muted-string scratch — nothing musical. */
export function synthesizeRoomNoise(durationMs: number, options: SynthOptions = {}): Float32Array {
  const sampleRate = options.sampleRate ?? 44100;
  const random = makeRandom(options.seed ?? 7);
  const out = new Float32Array(Math.ceil((durationMs / 1000) * sampleRate));

  let brown = 0;
  for (let i = 0; i < out.length; i++) {
    brown = (brown + (random() * 2 - 1) * 0.02) * 0.995;
    out[i] = brown * 0.35 + (random() * 2 - 1) * 0.004;
  }

  // Keyboard clicks: short broadband bursts.
  for (let clickMs = 600; clickMs < durationMs - 200; clickMs += 430) {
    const start = Math.floor((clickMs / 1000) * sampleRate);
    const length = Math.floor(0.012 * sampleRate);
    for (let i = 0; i < length; i++) {
      const env = Math.exp(-i / (0.0015 * sampleRate));
      out[start + i] += (random() * 2 - 1) * 0.25 * env;
    }
  }

  // Muted-string scratch: filtered noise burst with no stable fundamental.
  const scratchStart = Math.floor((durationMs / 2 / 1000) * sampleRate);
  const scratchLength = Math.floor(0.25 * sampleRate);
  let lp = 0;
  for (let i = 0; i < scratchLength; i++) {
    lp = lp * 0.6 + (random() * 2 - 1) * 0.4;
    const env = Math.sin((Math.PI * i) / scratchLength);
    out[scratchStart + i] += lp * 0.3 * env;
  }
  return out;
}
