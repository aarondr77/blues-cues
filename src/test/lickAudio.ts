import { beatToMs, type Lick } from '../licks/types';
import { synthesizeNotes, type SynthNote, type SynthOptions } from './synth';

export interface PerformanceOptions extends SynthOptions {
  /** Silence before the first note, so nothing starts at sample zero. */
  leadInMs?: number;
  /** Per-note timing error in milliseconds; positive is late. */
  timingErrorsMs?: number[];
  /** Per-note pitch substitution, keyed by note index. */
  midiOverrides?: Record<number, number>;
  /** Note indices the player simply did not play. */
  skipIndices?: number[];
  /** Constant lag added to everything, e.g. system audio latency. */
  latencyMs?: number;
}

export interface SynthesizedPerformance {
  audio: Float32Array;
  sampleRate: number;
  /** Ground truth for the attacks actually present in `audio`. */
  labels: { timeMs: number; midi: number }[];
  leadInMs: number;
}

/** Renders a (possibly imperfect) performance of a lick for fixture-free testing. */
export function synthesizePerformance(
  lick: Lick,
  options: PerformanceOptions = {},
): SynthesizedPerformance {
  const sampleRate = options.sampleRate ?? 44100;
  const leadInMs = options.leadInMs ?? 500;
  const latencyMs = options.latencyMs ?? 0;
  const skip = new Set(options.skipIndices ?? []);

  const notes: SynthNote[] = [];
  const labels: { timeMs: number; midi: number }[] = [];

  lick.notes.forEach((note, index) => {
    if (skip.has(index)) return;
    const midi = options.midiOverrides?.[index] ?? note.midi;
    const startMs =
      leadInMs + latencyMs + beatToMs(note.beat, lick.bpm) + (options.timingErrorsMs?.[index] ?? 0);
    const durationMs = Math.max(220, beatToMs(note.duration, lick.bpm) * 0.9);
    notes.push({ midi, startMs, durationMs });
    labels.push({ timeMs: startMs, midi });
  });

  return {
    audio: synthesizeNotes(notes, { ...options, sampleRate }),
    sampleRate,
    labels,
    leadInMs,
  };
}
