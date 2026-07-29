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

/** Widest offset the calibrator can produce; anything beyond it did not come from us. */
const MAX_STORED_OFFSET_MS = 2000;

/** Anything can end up in localStorage, so a stored offset is only trusted within calibration limits. */
export function parseStoredLatency(raw: string): StoredLatency | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const { offsetMs, stdDevMs, reliable } = value as Record<string, unknown>;
  if (typeof offsetMs !== 'number' || !Number.isFinite(offsetMs)) return null;
  if (typeof stdDevMs !== 'number' || !Number.isFinite(stdDevMs) || stdDevMs < 0) return null;
  if (typeof reliable !== 'boolean') return null;
  if (Math.abs(offsetMs) > MAX_STORED_OFFSET_MS || stdDevMs > MAX_STORED_OFFSET_MS) return null;

  return { offsetMs, stdDevMs, reliable };
}

function loadLatency(): StoredLatency | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(LATENCY_STORAGE_KEY);
  if (!raw) return null;
  return parseStoredLatency(raw);
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
      localStorage.removeItem(LATENCY_STORAGE_KEY);
      set({ latency: null });
      return;
    }
    const stored: StoredLatency = {
      offsetMs: result.offsetMs,
      stdDevMs: result.stdDevMs,
      reliable: result.reliable,
    };
    localStorage.setItem(LATENCY_STORAGE_KEY, JSON.stringify(stored));
    set({ latency: stored });
  },
  selectLick: (selectedLickId) => set({ selectedLickId }),
  finishAttempt: (score, boxVerdict) => set({ score, boxVerdict, phase: 'results' }),
  setError: (error) => set({ error }),
}));
