import { PitchDetector } from 'pitchy';
import { PITCH_FRAME_SIZE, PITCH_HOP_SIZE, rms, sliceFrames } from './frames';
import { hzToMidiFloat } from './notes';
import type { PitchFrame } from './types';

/** Below this clarity the McLeod estimate is noise rather than a note. */
export const MIN_CLARITY = 0.85;
/** Guitar range with headroom: low E (82.4Hz) to the 24th fret of the high E (1319Hz). */
export const MIN_HZ = 70;
export const MAX_HZ = 1400;

const detectors = new Map<number, PitchDetector<Float32Array>>();

function detectorFor(size: number): PitchDetector<Float32Array> {
  let detector = detectors.get(size);
  if (!detector) {
    detector = PitchDetector.forFloat32Array(size);
    detectors.set(size, detector);
  }
  return detector;
}

/**
 * Estimates the fundamental of a single analysis window. Pure: the same buffer
 * always yields the same frame, so this runs identically live and over fixtures.
 */
export function detectPitch(samples: Float32Array, sampleRate: number, timeMs = 0): PitchFrame {
  const [hz, clarity] = detectorFor(samples.length).findPitch(samples, sampleRate);
  const usable = clarity >= MIN_CLARITY && hz >= MIN_HZ && hz <= MAX_HZ;
  return {
    timeMs,
    hz: usable ? hz : 0,
    clarity,
    midi: usable ? hzToMidiFloat(hz) : null,
    rms: rms(samples),
  };
}

export function detectPitchTrack(
  samples: Float32Array,
  sampleRate: number,
  frameSize = PITCH_FRAME_SIZE,
  hopSize = PITCH_HOP_SIZE,
): PitchFrame[] {
  return sliceFrames(samples, sampleRate, frameSize, hopSize).map((frame) =>
    detectPitch(frame.samples, sampleRate, frame.timeMs),
  );
}
