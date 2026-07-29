import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LATENCY_STORAGE_KEY } from '../audio/latency';

class MemoryStorage {
  readonly entries = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded');
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

async function loadStore(storage: MemoryStorage) {
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  const { useAppStore } = await import('./store');
  return useAppStore;
}

describe('stored latency', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads a well formed entry', async () => {
    const storage = new MemoryStorage();
    storage.entries.set(
      LATENCY_STORAGE_KEY,
      JSON.stringify({ offsetMs: 42, stdDevMs: 3, reliable: true }),
    );

    const store = await loadStore(storage);
    expect(store.getState().latency).toEqual({ offsetMs: 42, stdDevMs: 3, reliable: true });
  });

  it('discards an entry that is not valid JSON', async () => {
    const storage = new MemoryStorage();
    storage.entries.set(LATENCY_STORAGE_KEY, '{not json');

    const store = await loadStore(storage);
    expect(store.getState().latency).toBeNull();
    expect(storage.getItem(LATENCY_STORAGE_KEY)).toBeNull();
  });

  it('discards an entry of the wrong shape rather than trusting the cast', async () => {
    const storage = new MemoryStorage();
    storage.entries.set(LATENCY_STORAGE_KEY, JSON.stringify({ offsetMs: 'late' }));

    const store = await loadStore(storage);
    expect(store.getState().latency).toBeNull();
    expect(storage.getItem(LATENCY_STORAGE_KEY)).toBeNull();
  });

  it('keeps the measurement and reports the failure when writing is refused', async () => {
    const storage = new MemoryStorage();
    const store = await loadStore(storage);
    storage.failWrites = true;

    store.getState().setLatency({
      offsetMs: 30,
      stdDevMs: 5,
      samples: [30],
      discarded: 0,
      reliable: true,
      warning: null,
    });

    expect(store.getState().latency).toEqual({ offsetMs: 30, stdDevMs: 5, reliable: true });
    expect(store.getState().error).toMatch(/could not be saved/);
  });
});
