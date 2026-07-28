import type { PitchFrame } from './types';

export const OCTAVE_SNAP_TOLERANCE_CENTS = 50;
const JUMP_SEMITONES = 12;
const PERSIST_FRAMES = 3;

/**
 * Pitch trackers report octave errors constantly on wound strings. When the
 * lick tells us what note to expect, a reading that is an exact octave away
 * from it is far more likely to be a tracker error than a real note.
 */
export function snapToExpectedOctave(
  midi: number,
  expectedMidi: number | null | undefined,
  toleranceCents = OCTAVE_SNAP_TOLERANCE_CENTS,
): number {
  if (expectedMidi == null) return midi;
  const semitoneDiff = midi - expectedMidi;
  const octaves = Math.round(semitoneDiff / 12);
  if (octaves === 0) return midi;
  const residualCents = Math.abs(semitoneDiff - octaves * 12) * 100;
  if (residualCents > toleranceCents) return midi;
  return midi - octaves * 12;
}

/**
 * Drops isolated octave/harmonic jumps: a reading more than an octave from the
 * previous one only survives if the next few frames agree with it.
 */
export function applyJumpHysteresis(
  frames: PitchFrame[],
  jumpSemitones = JUMP_SEMITONES,
  persistFrames = PERSIST_FRAMES,
): PitchFrame[] {
  const out = frames.map((frame) => ({ ...frame }));
  let previous: number | null = null;

  for (let i = 0; i < out.length; i++) {
    const midi = out[i].midi;
    if (midi == null) continue;
    if (previous == null || Math.abs(midi - previous) <= jumpSemitones) {
      previous = midi;
      continue;
    }

    let agreeing = 1;
    for (let j = i + 1; j < out.length && agreeing < persistFrames; j++) {
      const next = out[j].midi;
      if (next == null || Math.abs(next - midi) > 1) break;
      agreeing++;
    }

    if (agreeing >= persistFrames) {
      previous = midi;
    } else {
      out[i].midi = null;
      out[i].hz = 0;
    }
  }
  return out;
}
