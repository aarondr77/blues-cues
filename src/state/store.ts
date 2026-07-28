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

function loadLatency(): StoredLatency | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(LATENCY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredLatency;
  } catch {
    return null;
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
