import { describe, expect, it } from 'vitest';
import { detectNotes } from '../audio/analyze';
import { computeLatencyOffset } from '../audio/latency';
import { lickById, LICKS } from '../licks';
import { synthesizePerformance } from '../test/lickAudio';
import { scoreAttempt } from './score';

const LICK = lickById('box1-descending')!;

function judgmentsOf(
  options: Parameters<typeof synthesizePerformance>[1],
  extraOffsetMs = 0,
) {
  const performance = synthesizePerformance(LICK, options);
  const detected = detectNotes(performance.audio, performance.sampleRate, {
    expectedMidis: LICK.notes.map((note) => note.midi),
  });
  const offsetMs = performance.leadInMs + (options?.latencyMs ?? 0) + extraOffsetMs;
  return { score: scoreAttempt(LICK, detected, offsetMs), detected };
}

describe('scoreAttempt', () => {
  it('scores a clean, calibrated take as all perfect', () => {
    const { score } = judgmentsOf({});
    expect(score.judgments.map((j) => j.judgment)).toEqual(
      LICK.notes.map(() => 'perfect'),
    );
    expect(score.extraNotes).toBe(0);
    expect(score.percentage).toBe(100);
  });

  it('grades deliberate early and late notes by their window', () => {
    const timingErrorsMs = [0, 90, -90, 160, 0, -160, -300, 0];
    const { score } = judgmentsOf({ timingErrorsMs });
    const judgments = score.judgments.map((j) => j.judgment);

    expect(judgments[0]).toBe('perfect');
    expect(judgments[1]).toBe('good');
    expect(judgments[2]).toBe('good');
    expect(judgments[3]).toBe('late');
    expect(judgments[5]).toBe('early');
    expect(judgments[6]).toBe('miss');
    expect(score.percentage).toBeLessThan(100);
  });

  it('misses a wrong pitch played at the right time and counts it as an extra', () => {
    const { score } = judgmentsOf({ midiOverrides: { 3: LICK.notes[3].midi + 2 } });
    expect(score.judgments[3].judgment).toBe('miss');
    expect(score.extraNotes).toBe(1);
    expect(score.extraPenaltyPoints).toBe(2);
  });

  it('subtracts the measured latency instead of penalising a lagging system', () => {
    const latencyMs = 120;
    const { score } = judgmentsOf({ latencyMs });
    expect(score.judgments.every((j) => j.judgment === 'perfect')).toBe(true);
  });

  it('caps the penalty so a burst of string noise cannot tank a run', () => {
    const performance = synthesizePerformance(LICK, {});
    const detected = detectNotes(performance.audio, performance.sampleRate);
    const noiseBurst = Array.from({ length: 12 }, (_, i) => ({
      timeMs: performance.leadInMs + 4000 + i * 80,
      midi: 60,
      hz: 261.63,
      clarity: 0.9,
    }));
    const score = scoreAttempt(LICK, [...detected, ...noiseBurst], performance.leadInMs);
    expect(score.extraNotes).toBe(12);
    expect(score.extraPenaltyPoints).toBe(10);
    expect(score.percentage).toBe(90);
  });

  it('widens every window when calibration was skipped', () => {
    const timingErrorsMs = [150, 0, 0, 0, 0, 0, 0, 0];
    const performance = synthesizePerformance(LICK, { timingErrorsMs });
    const detected = detectNotes(performance.audio, performance.sampleRate);
    const strict = scoreAttempt(LICK, detected, performance.leadInMs);
    const loose = scoreAttempt(LICK, detected, performance.leadInMs, { calibrated: false });

    expect(strict.judgments[0].judgment).toBe('late');
    expect(loose.judgments[0].judgment).toBe('perfect');
    expect(loose.calibrated).toBe(false);
  });
});

describe('latency calibration', () => {
  it('recovers a known offset from clicks and attacks, ignoring a missed click', () => {
    const clicks = Array.from({ length: 8 }, (_, i) => i * 750);
    const trueOffset = 95;
    const jitter = [4, -6, 2, 0, -3, 5, -2, 1];
    const onsets = clicks
      .map((click, i) => click + trueOffset + jitter[i])
      .filter((_, i) => i !== 4);

    const result = computeLatencyOffset(clicks, onsets);
    expect(Math.abs(result.offsetMs - trueOffset)).toBeLessThanOrEqual(6);
    expect(result.reliable).toBe(true);
    expect(result.warning).toBeNull();
  });

  it('warns when the measurement is too noisy to trust', () => {
    const clicks = Array.from({ length: 8 }, (_, i) => i * 750);
    const onsets = clicks.map((click, i) => click + [20, 180, 60, 240, 30, 200, 90, 260][i]);
    const result = computeLatencyOffset(clicks, onsets);
    expect(result.reliable).toBe(false);
    expect(result.warning).toContain('unreliable');
  });
});

describe('lick library', () => {
  it('ships 20 playable licks with consistent fret/midi data', () => {
    const openStrings: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
    expect(LICKS).toHaveLength(20);
    for (const lick of LICKS) {
      expect(lick.notes.length).toBeGreaterThan(0);
      for (const note of lick.notes) {
        expect(note.midi).toBe(openStrings[note.string] + note.fret);
      }
      const beats = lick.notes.map((note) => note.beat);
      expect([...beats].sort((a, b) => a - b)).toEqual(beats);
    }
  });
});
