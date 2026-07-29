import { describe, expect, it } from 'vitest';
import { beatToMs, lickDurationMs, type Lick } from './types';

function makeLick(notes: Lick['notes'], bpm = 120): Lick {
  return {
    id: 'l',
    name: 'L',
    key: 'A',
    rootFret: 5,
    expectedBox: 1,
    bpm,
    difficulty: 1,
    notes,
  };
}

describe('beatToMs', () => {
  it('converts beats to milliseconds at a given tempo', () => {
    expect(beatToMs(1, 120)).toBeCloseTo(500, 6);
    expect(beatToMs(4, 120)).toBeCloseTo(2000, 6);
    expect(beatToMs(0, 120)).toBe(0);
  });

  it('scales inversely with BPM', () => {
    expect(beatToMs(1, 60)).toBeCloseTo(1000, 6);
    expect(beatToMs(1, 240)).toBeCloseTo(250, 6);
  });
});

describe('lickDurationMs', () => {
  it('uses the end of the final note (beat + duration)', () => {
    const lick = makeLick(
      [
        { midi: 60, string: 1, fret: 3, beat: 0, duration: 1 },
        { midi: 62, string: 2, fret: 5, beat: 2, duration: 2 },
      ],
      120,
    );
    // Final note ends at beat 4 -> 2000ms at 120 BPM.
    expect(lickDurationMs(lick)).toBeCloseTo(2000, 6);
  });

  it('accounts for a fractional final duration', () => {
    const lick = makeLick([{ midi: 64, string: 6, fret: 7, beat: 1, duration: 0.5 }], 120);
    // Ends at beat 1.5 -> 750ms.
    expect(lickDurationMs(lick)).toBeCloseTo(750, 6);
  });
});
