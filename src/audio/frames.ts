/** Analysis window sized by the lowest note that must resolve (low E, 82.4Hz). */
export const PITCH_FRAME_SIZE = 4096;
export const PITCH_HOP_SIZE = 1024;
/** Onsets need finer time resolution than pitch, so they use their own framing. */
export const ONSET_FRAME_SIZE = 1024;
export const ONSET_HOP_SIZE = 256;

export interface Frame {
  timeMs: number;
  samples: Float32Array;
}

/** Slices a buffer into overlapping frames, zero-padding the final partial frame. */
export function sliceFrames(
  samples: Float32Array,
  sampleRate: number,
  frameSize: number,
  hopSize: number,
): Frame[] {
  const frames: Frame[] = [];
  for (let start = 0; start + hopSize <= samples.length; start += hopSize) {
    const end = start + frameSize;
    let slice: Float32Array;
    if (end <= samples.length) {
      slice = samples.subarray(start, end);
    } else {
      slice = new Float32Array(frameSize);
      slice.set(samples.subarray(start));
    }
    frames.push({ timeMs: (start / sampleRate) * 1000, samples: slice });
  }
  return frames;
}

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}
