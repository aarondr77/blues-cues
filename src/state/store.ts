import { create } from 'zustand';
import { LATENCY_STORAGE_KEY, type LatencyResult } from '../audio/latency';
import type { Score } from '../scoring/score';
import type { BoxEstimate } from '../vision/boxes';

export type Phase = 'permissions' | 'framing' | 'latency' | 'select' | 'play' | 'results';

export interface StoredLatency {
  offsetMs: number;
  stdDevMs: number;
  reliable: boolean;
}

export interface BoxVerdict {
  estimate: BoxEstimate | null;
  expectedBox: number;
}

interface AppState {
  phase: Phase;
  micReady: boolean;
  cameraReady: boolean;
  visionEnabled: boolean;
  framingPassed: boolean;
  latency: StoredLatency | null;
  selectedLickId: string | null;
  score: Score | null;
  boxVerdict: BoxVerdict | null;
  error: string | null;

  setPhase: (phase: Phase) => void;
  setMicReady: (ready: boolean) => void;
  setCameraReady: (ready: boolean) => void;
  skipVision: () => void;
  setFramingPassed: (passed: boolean) => void;
  setLatency: (result: LatencyResult | null) => void;
  selectLick: (id: string) => void;
  finishAttempt: (score: Score, boxVerdict: BoxVerdict | null) => void;
  setError: (error: string | null) => void;
}

function isStoredLatency(value: unknown): value is StoredLatency {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.offsetMs === 'number' &&
    Number.isFinite(candidate.offsetMs) &&
    typeof candidate.stdDevMs === 'number' &&
    Number.isFinite(candidate.stdDevMs) &&
    typeof candidate.reliable === 'boolean'
  );
}

/**
 * A corrupt entry is discarded rather than trusted: parsed JSON of the wrong
 * shape used to sail through the cast and produce NaN timing offsets.
 */
function loadLatency(): StoredLatency | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LATENCY_STORAGE_KEY);
  } catch (error) {
    console.warn('[store] could not read stored latency', error);
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn('[store] stored latency is not valid JSON; discarding it', error);
    forgetStoredLatency();
    return null;
  }
  if (!isStoredLatency(parsed)) {
    console.warn('[store] stored latency has an unexpected shape; discarding it', parsed);
    forgetStoredLatency();
    return null;
  }
  return { offsetMs: parsed.offsetMs, stdDevMs: parsed.stdDevMs, reliable: parsed.reliable };
}

/** Persistence is best-effort — private mode and full quotas must not break calibration. */
function forgetStoredLatency(): void {
  try {
    localStorage.removeItem(LATENCY_STORAGE_KEY);
  } catch (error) {
    console.warn('[store] could not clear stored latency', error);
  }
}

function persistLatency(stored: StoredLatency): string | null {
  try {
    localStorage.setItem(LATENCY_STORAGE_KEY, JSON.stringify(stored));
    return null;
  } catch (error) {
    console.warn('[store] could not persist latency', error);
    return `Calibration is active for this session but could not be saved: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

export const useAppStore = create<AppState>((set) => ({
  phase: 'permissions',
  micReady: false,
  cameraReady: false,
  visionEnabled: true,
  framingPassed: false,
  latency: loadLatency(),
  selectedLickId: null,
  score: null,
  boxVerdict: null,
  error: null,

  setPhase: (phase) => set({ phase }),
  setMicReady: (micReady) => set({ micReady }),
  setCameraReady: (cameraReady) => set({ cameraReady }),
  skipVision: () => set({ visionEnabled: false, framingPassed: false }),
  setFramingPassed: (framingPassed) => set({ framingPassed }),
  setLatency: (result) => {
    if (!result) {
      forgetStoredLatency();
      set({ latency: null });
      return;
    }
    const stored: StoredLatency = {
      offsetMs: result.offsetMs,
      stdDevMs: result.stdDevMs,
      reliable: result.reliable,
    };
    const failure = persistLatency(stored);
    set(failure ? { latency: stored, error: failure } : { latency: stored });
  },
  selectLick: (selectedLickId) => set({ selectedLickId }),
  finishAttempt: (score, boxVerdict) => set({ score, boxVerdict, phase: 'results' }),
  setError: (error) => set({ error }),
}));
