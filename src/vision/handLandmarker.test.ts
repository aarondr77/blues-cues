import { afterEach, describe, expect, it, vi } from 'vitest';

const forVisionTasks = vi.fn();
const createFromOptions = vi.fn();

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: (...args: unknown[]) => forVisionTasks(...args) },
  HandLandmarker: { createFromOptions: (...args: unknown[]) => createFromOptions(...args) },
}));

afterEach(() => {
  vi.resetModules();
  forVisionTasks.mockReset();
  createFromOptions.mockReset();
});

describe('loadHandLandmarker', () => {
  it('retries after a failed load instead of replaying the cached rejection', async () => {
    forVisionTasks
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ wasm: true });
    createFromOptions.mockResolvedValue({ id: 'landmarker' });

    const { loadHandLandmarker } = await import('./handLandmarker');

    await expect(loadHandLandmarker()).rejects.toThrow(/network down/);
    await expect(loadHandLandmarker()).resolves.toEqual({ id: 'landmarker' });
    expect(forVisionTasks).toHaveBeenCalledTimes(2);
  });

  it('loads the model only once when it succeeds', async () => {
    forVisionTasks.mockResolvedValue({ wasm: true });
    createFromOptions.mockResolvedValue({ id: 'landmarker' });

    const { loadHandLandmarker } = await import('./handLandmarker');

    await loadHandLandmarker();
    await loadHandLandmarker();
    expect(createFromOptions).toHaveBeenCalledTimes(1);
  });
});
