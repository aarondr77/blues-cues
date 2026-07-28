import { computeSpectralFrames, detectOnsets, type OnsetOptions } from './onsets';
import { applyJumpHysteresis, snapToExpectedOctave } from './octave';
import { detectPitchTrack } from './pitch';
import type { DetectedNote, Onset, PitchFrame } from './types';

export interface DetectNotesOptions {
  /**
   * The lick being played, in order. Used only as an octave prior — a strong
   * one, since the tracker's octave errors are exactly an octave wide.
   */
  expectedMidis?: number[];
  /** Pitch is taken as the median over this window after each onset. */
  pitchWindowMs?: number;
  onsetOptions?: Partial<OnsetOptions>;
}

const DEFAULT_PITCH_WINDOW_MS = 60;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Pairs each onset with the pitch that follows it, applying octave correction. */
export function notesFromOnsets(
  onsets: Onset[],
  pitchFrames: PitchFrame[],
  options: DetectNotesOptions = {},
): DetectedNote[] {
  const windowMs = options.pitchWindowMs ?? DEFAULT_PITCH_WINDOW_MS;
  const notes: DetectedNote[] = [];

  onsets.forEach((onset, index) => {
    let candidates = pitchFrames.filter(
      (frame) =>
        frame.midi != null && frame.timeMs >= onset.timeMs && frame.timeMs <= onset.timeMs + windowMs,
    );
    if (candidates.length === 0) {
      // Fall back to a longer look-ahead before giving up on the attack.
      candidates = pitchFrames.filter(
        (frame) =>
          frame.midi != null &&
          frame.timeMs >= onset.timeMs &&
          frame.timeMs <= onset.timeMs + windowMs * 3,
      );
    }
    if (candidates.length === 0) return;

    const rawMidi = medianOf(candidates.map((frame) => frame.midi as number));
    const expected = options.expectedMidis?.[Math.min(index, options.expectedMidis.length - 1)];
    const midi = snapToExpectedOctave(rawMidi, expected ?? null);
    const clarity = medianOf(candidates.map((frame) => frame.clarity));

    notes.push({
      timeMs: onset.timeMs,
      midi,
      hz: 440 * Math.pow(2, (midi - 69) / 12),
      clarity,
    });
  });

  return notes;
}

/**
 * Full offline pipeline: buffer in, note events out. Live capture calls the same
 * functions frame by frame, so fixtures exercise the real detection path.
 */
export function detectNotes(
  samples: Float32Array,
  sampleRate: number,
  options: DetectNotesOptions = {},
): DetectedNote[] {
  const onsets = detectOnsets(computeSpectralFrames(samples, sampleRate), options.onsetOptions);
  const pitchFrames = applyJumpHysteresis(detectPitchTrack(samples, sampleRate));
  return notesFromOnsets(onsets, pitchFrames, options);
}
