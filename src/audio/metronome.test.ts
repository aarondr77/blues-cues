import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_BPM,
  CALIBRATION_CLICKS,
  scheduleClicks,
} from './metronome';

interface StubbedNode {
  frequency: { value: number };
  gain: {
    setValueAtTime: (value: number, time: number) => void;
    exponentialRampToValueAtTime: (value: number, time: number) => void;
  };
  connect: (target: unknown) => StubbedNode;
  start: (time: number) => void;
  stop: (time: number) => void;
}

/**
 * Minimal AudioContext stand-in. Node has no Web Audio, so scheduleClicks is
 * exercised against a stub that records how oscillators/gains are driven.
 */
function createStubContext(currentTime = 0) {
  const oscillators: { startedAt: number[]; stoppedAt: number[] } = {
    startedAt: [],
    stoppedAt: [],
  };
  const gainRamps: { time: number; value: number }[] = [];

  const makeNode = (kind: 'osc' | 'gain'): StubbedNode => ({
    frequency: { value: 0 },
    gain: {
      setValueAtTime: (value, time) => {
        if (kind === 'gain') gainRamps.push({ time, value });
      },
      exponentialRampToValueAtTime: (value, time) => {
        if (kind === 'gain') gainRamps.push({ time, value });
      },
    },
    connect: () => makeNode('gain'),
    start: (time) => oscillators.startedAt.push(time),
    stop: (time) => oscillators.stoppedAt.push(time),
  });

  const context = {
    currentTime,
    destination: {},
    createOscillator: () => makeNode('osc'),
    createGain: () => makeNode('gain'),
  };

  return { context, oscillators, gainRamps };
}

describe('scheduleClicks', () => {
  it('schedules the default number of calibration clicks', () => {
    const { context, oscillators } = createStubContext(0);
    const schedule = scheduleClicks(context as unknown as AudioContext);

    expect(schedule.clickTimesMs.length).toBe(CALIBRATION_CLICKS);
    expect(oscillators.startedAt.length).toBe(CALIBRATION_CLICKS);
    expect(oscillators.stoppedAt.length).toBe(CALIBRATION_CLICKS);
  });

  it('spaces clicks by the beat interval derived from BPM', () => {
    const { context } = createStubContext(0);
    const bpm = 120;
    const schedule = scheduleClicks(context as unknown as AudioContext, 4, bpm, 0.5);

    const expectedIntervalMs = (60 / bpm) * 1000; // 500ms at 120 BPM
    expect(schedule.clickTimesMs[0]).toBeCloseTo(500, 6); // lead-in only
    for (let i = 1; i < schedule.clickTimesMs.length; i++) {
      expect(schedule.clickTimesMs[i] - schedule.clickTimesMs[i - 1]).toBeCloseTo(
        expectedIntervalMs,
        6,
      );
    }
  });

  it('offsets the first click by the audio clock plus the lead-in', () => {
    const { context } = createStubContext(3);
    const schedule = scheduleClicks(context as unknown as AudioContext, 2, 60, 0.5);
    // currentTime 3s + 0.5s lead-in = 3.5s = 3500ms.
    expect(schedule.clickTimesMs[0]).toBeCloseTo(3500, 6);
  });

  it('ends one second after the final click', () => {
    const { context } = createStubContext(0);
    const schedule = scheduleClicks(context as unknown as AudioContext, 3, 60, 0.5);
    const lastClick = schedule.clickTimesMs[schedule.clickTimesMs.length - 1];
    expect(schedule.endsAtMs).toBeCloseTo(lastClick + 1000, 6);
  });

  it('falls back to the audio clock for endsAtMs when no clicks are scheduled', () => {
    const { context } = createStubContext(2);
    const schedule = scheduleClicks(context as unknown as AudioContext, 0);
    expect(schedule.clickTimesMs).toEqual([]);
    // 2s clock -> 2000ms, plus the 1000ms tail.
    expect(schedule.endsAtMs).toBeCloseTo(3000, 6);
  });

  it('starts and stops each oscillator around its click time', () => {
    const { context, oscillators } = createStubContext(0);
    scheduleClicks(context as unknown as AudioContext, 2, 60, 0.5);
    for (let i = 0; i < oscillators.startedAt.length; i++) {
      // stop is scheduled 0.06s after the start of each click.
      expect(oscillators.stoppedAt[i]).toBeCloseTo(oscillators.startedAt[i] + 0.06, 6);
    }
  });

  it('uses default BPM constants when only a count is provided', () => {
    const { context } = createStubContext(0);
    const schedule = scheduleClicks(context as unknown as AudioContext, 2);
    const expectedIntervalMs = (60 / CALIBRATION_BPM) * 1000;
    expect(schedule.clickTimesMs[1] - schedule.clickTimesMs[0]).toBeCloseTo(
      expectedIntervalMs,
      6,
    );
  });
});
