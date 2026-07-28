export interface LatencyResult {
  offsetMs: number;
  stdDevMs: number;
  /** Per-click deltas that survived outlier rejection. */
  samples: number[];
  discarded: number;
  reliable: boolean;
  warning: string | null;
}

/** Beyond these the measurement is not trustworthy enough for strict timing. */
export const MAX_RELIABLE_OFFSET_MS = 400;
export const MAX_RELIABLE_STD_DEV_MS = 40;

export const LATENCY_STORAGE_KEY = 'blues-cues:latency';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Pairs each metronome click with the attack that followed it and takes the
 * median delta. Outliers (a missed click, a double pick) are rejected with a
 * median-absolute-deviation filter rather than a fixed threshold.
 */
export function computeLatencyOffset(clickTimesMs: number[], onsetTimesMs: number[]): LatencyResult {
  const deltas: number[] = [];
  const remaining = [...onsetTimesMs].sort((a, b) => a - b);

  for (const click of clickTimesMs) {
    let bestIndex = -1;
    let bestDelta = Infinity;
    remaining.forEach((onset, i) => {
      const delta = onset - click;
      // A player reacts to the click, so only look forward (with a little slack).
      if (delta < -150 || delta > 600) return;
      if (Math.abs(delta) < Math.abs(bestDelta)) {
        bestDelta = delta;
        bestIndex = i;
      }
    });
    if (bestIndex >= 0) {
      deltas.push(bestDelta);
      remaining.splice(bestIndex, 1);
    }
  }

  if (deltas.length === 0) {
    return {
      offsetMs: 0,
      stdDevMs: 0,
      samples: [],
      discarded: 0,
      reliable: false,
      warning: 'No notes were heard during calibration. Check the microphone and try again.',
    };
  }

  const rough = median(deltas);
  const deviation = median(deltas.map((d) => Math.abs(d - rough)));
  const tolerance = Math.max(3 * 1.4826 * deviation, 25);
  const kept = deltas.filter((d) => Math.abs(d - rough) <= tolerance);
  const samples = kept.length >= 3 ? kept : deltas;

  const offsetMs = median(samples);
  const mean = samples.reduce((sum, d) => sum + d, 0) / samples.length;
  const stdDevMs = Math.sqrt(
    samples.reduce((sum, d) => sum + (d - mean) ** 2, 0) / samples.length,
  );

  const reliable = offsetMs <= MAX_RELIABLE_OFFSET_MS && stdDevMs <= MAX_RELIABLE_STD_DEV_MS;
  return {
    offsetMs,
    stdDevMs,
    samples,
    discarded: deltas.length - samples.length,
    reliable,
    warning: reliable
      ? null
      : `Measured latency ${Math.round(offsetMs)}ms (±${Math.round(stdDevMs)}ms). Timing scores will be unreliable — close other audio applications and try again.`,
  };
}
