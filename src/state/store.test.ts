import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LATENCY_STORAGE_KEY, type LatencyResult } from '../audio/latency';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}

function latencyResult(overrides: Partial<LatencyResult> = {}): LatencyResult {
  return {
    offsetMs: 42,
    stdDevMs: 5,
    samples: [40, 44],
    discarded: 1,
    reliable: true,
    warning: null,
    ...overrides,
  };
}

/**
 * The store reads localStorage at module-load time, so the storage mock must be
 * installed before importing it and the module registry reset between tests to
 * pick up different persisted states.
 */
async function loadStore() {
  vi.resetModules();
  return import('./store');
}

describe('useAppStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts on the permissions phase with sensible defaults', async () => {
    const { useAppStore } = await loadStore();
    const state = useAppStore.getState();
    expect(state.phase).toBe('permissions');
    expect(state.micReady).toBe(false);
    expect(state.cameraReady).toBe(false);
    expect(state.visionEnabled).toBe(true);
    expect(state.framingPassed).toBe(false);
    expect(state.latency).toBeNull();
    expect(state.selectedLickId).toBeNull();
    expect(state.score).toBeNull();
  });

  it('updates simple phase and readiness flags', async () => {
    const { useAppStore } = await loadStore();
    useAppStore.getState().setPhase('framing');
    useAppStore.getState().setMicReady(true);
    useAppStore.getState().setCameraReady(true);
    useAppStore.getState().setFramingPassed(true);

    const state = useAppStore.getState();
    expect(state.phase).toBe('framing');
    expect(state.micReady).toBe(true);
    expect(state.cameraReady).toBe(true);
    expect(state.framingPassed).toBe(true);
  });

  it('skipVision disables vision and clears framing', async () => {
    const { useAppStore } = await loadStore();
    useAppStore.getState().setFramingPassed(true);
    useAppStore.getState().skipVision();

    const state = useAppStore.getState();
    expect(state.visionEnabled).toBe(false);
    expect(state.framingPassed).toBe(false);
  });

  it('persists latency to localStorage and keeps only the stored fields', async () => {
    const { useAppStore } = await loadStore();
    useAppStore.getState().setLatency(latencyResult());

    const state = useAppStore.getState();
    expect(state.latency).toEqual({ offsetMs: 42, stdDevMs: 5, reliable: true });

    const raw = localStorage.getItem(LATENCY_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ offsetMs: 42, stdDevMs: 5, reliable: true });
  });

  it('clears persisted latency when set to null', async () => {
    const { useAppStore } = await loadStore();
    useAppStore.getState().setLatency(latencyResult());
    useAppStore.getState().setLatency(null);

    expect(useAppStore.getState().latency).toBeNull();
    expect(localStorage.getItem(LATENCY_STORAGE_KEY)).toBeNull();
  });

  it('hydrates latency from localStorage at load time', async () => {
    localStorage.setItem(
      LATENCY_STORAGE_KEY,
      JSON.stringify({ offsetMs: 12, stdDevMs: 3, reliable: false }),
    );
    const { useAppStore } = await loadStore();
    expect(useAppStore.getState().latency).toEqual({
      offsetMs: 12,
      stdDevMs: 3,
      reliable: false,
    });
  });

  it('ignores corrupt persisted latency', async () => {
    localStorage.setItem(LATENCY_STORAGE_KEY, 'not-json');
    const { useAppStore } = await loadStore();
    expect(useAppStore.getState().latency).toBeNull();
  });

  it('selectLick stores the chosen lick id', async () => {
    const { useAppStore } = await loadStore();
    useAppStore.getState().selectLick('box1-ascending');
    expect(useAppStore.getState().selectedLickId).toBe('box1-ascending');
  });

  it('finishAttempt records the score and box verdict and moves to results', async () => {
    const { useAppStore } = await loadStore();
    const score = { total: 90 } as never;
    const boxVerdict = { estimate: null, expectedBox: 2 };
    useAppStore.getState().finishAttempt(score, boxVerdict);

    const state = useAppStore.getState();
    expect(state.phase).toBe('results');
    expect(state.score).toBe(score);
    expect(state.boxVerdict).toEqual(boxVerdict);
  });

  it('setError stores and clears the error message', async () => {
    const { useAppStore } = await loadStore();
    useAppStore.getState().setError('mic denied');
    expect(useAppStore.getState().error).toBe('mic denied');
    useAppStore.getState().setError(null);
    expect(useAppStore.getState().error).toBeNull();
  });
});
