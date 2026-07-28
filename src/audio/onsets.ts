import { hannWindow, magnitudeSpectrum } from './fft';
import { ONSET_FRAME_SIZE, ONSET_HOP_SIZE, sliceFrames } from './frames';
import type { Onset, SpectralFrame } from './types';

export interface OnsetOptions {
  /** Frames closer together than this are treated as one attack. */
  refractoryMs: number;
  /** Half-width of the moving-median window used for the adaptive threshold. */
  medianWindowMs: number;
  /** Flux must exceed `median * multiplier + delta` to count. */
  multiplier: number;
  delta: number;
  /** Absolute floor, keeping room tone from ever producing flux peaks. */
  minFlux: number;
  /**
   * Peaks must also reach this fraction of the loudest attack nearby, which
   * rejects the flux ripple a decaying string leaves behind an attack.
   */
  localPeakRatio: number;
  /** Half-width of the neighbourhood used for the local-max and ratio tests. */
  peakNeighbourhoodMs: number;
  /**
   * Frames are timestamped at their start, so a peak sits slightly ahead of
   * the attack that caused it. Subtracting this signed correction lands the
   * reported onset on the attack.
   */
  peakLagMs: number;
}

export const DEFAULT_ONSET_OPTIONS: OnsetOptions = {
  refractoryMs: 50,
  medianWindowMs: 150,
  multiplier: 2.2,
  delta: 0.6,
  minFlux: 1.2,
  localPeakRatio: 0.2,
  peakNeighbourhoodMs: 700,
  peakLagMs: -10,
};

export function computeSpectralFrames(
  samples: Float32Array,
  sampleRate: number,
  frameSize = ONSET_FRAME_SIZE,
  hopSize = ONSET_HOP_SIZE,
): SpectralFrame[] {
  const window = hannWindow(frameSize);
  return sliceFrames(samples, sampleRate, frameSize, hopSize).map((frame) => ({
    timeMs: frame.timeMs,
    magnitudes: magnitudeSpectrum(frame.samples, window),
  }));
}

/** Sum of positive frame-to-frame differences of log magnitudes. */
export function spectralFlux(frames: SpectralFrame[]): Float32Array {
  const flux = new Float32Array(frames.length);
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1].magnitudes;
    const cur = frames[i].magnitudes;
    let sum = 0;
    for (let bin = 0; bin < cur.length; bin++) {
      const diff = Math.log1p(cur[bin]) - Math.log1p(prev[bin]);
      if (diff > 0) sum += diff;
    }
    flux[i] = sum;
  }
  return flux;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Peak-picks the flux curve against a moving-median threshold. Pure over the
 * spectral frames, which is what makes the fixture runner possible.
 */
export function detectOnsets(
  frames: SpectralFrame[],
  options: Partial<OnsetOptions> = {},
): Onset[] {
  const opts = { ...DEFAULT_ONSET_OPTIONS, ...options };
  if (frames.length < 3) return [];

  const flux = spectralFlux(frames);
  const hopMs = frames.length > 1 ? frames[1].timeMs - frames[0].timeMs : 1;
  const medianRadius = Math.max(1, Math.round(opts.medianWindowMs / hopMs));
  const neighbourRadius = Math.max(2, Math.round(opts.peakNeighbourhoodMs / hopMs));
  const localMaxRadius = Math.max(1, Math.round(20 / hopMs));

  const onsets: Onset[] = [];
  let lastOnsetMs = -Infinity;
  for (let i = 1; i < flux.length - 1; i++) {
    const value = flux[i];
    if (value < opts.minFlux) continue;

    let isLocalMax = true;
    for (let k = Math.max(0, i - localMaxRadius); k <= Math.min(flux.length - 1, i + localMaxRadius); k++) {
      if (flux[k] > value) {
        isLocalMax = false;
        break;
      }
    }
    if (!isLocalMax) continue;

    let neighbourhoodMax = 0;
    for (let k = Math.max(0, i - neighbourRadius); k <= Math.min(flux.length - 1, i + neighbourRadius); k++) {
      if (flux[k] > neighbourhoodMax) neighbourhoodMax = flux[k];
    }
    if (value < neighbourhoodMax * opts.localPeakRatio) continue;

    const from = Math.max(0, i - medianRadius);
    const to = Math.min(flux.length, i + medianRadius + 1);
    const local = median(Array.from(flux.subarray(from, to)));
    const threshold = local * opts.multiplier + opts.delta;

    if (value < threshold) continue;

    const timeMs = Math.max(0, frames[i].timeMs - opts.peakLagMs);
    if (timeMs - lastOnsetMs < opts.refractoryMs) {
      // Keep the stronger of two attacks inside the refractory window.
      const previous = onsets[onsets.length - 1];
      if (previous && value > previous.strength) {
        previous.timeMs = timeMs;
        previous.strength = value;
        lastOnsetMs = timeMs;
      }
      continue;
    }

    onsets.push({ timeMs, strength: value });
    lastOnsetMs = timeMs;
  }
  return onsets;
}
