import { describe, expect, it } from 'vitest';
import { A4_HZ, A4_MIDI, centsOff, hzToMidiFloat, midiToHz, noteName } from './notes';

describe('midiToHz / hzToMidiFloat', () => {
  it('anchors A4 to 440 Hz / MIDI 69', () => {
    expect(midiToHz(A4_MIDI)).toBeCloseTo(A4_HZ, 6);
    expect(hzToMidiFloat(A4_HZ)).toBeCloseTo(A4_MIDI, 6);
  });

  it('moves an octave for every 12 semitones', () => {
    expect(midiToHz(A4_MIDI + 12)).toBeCloseTo(880, 6);
    expect(midiToHz(A4_MIDI - 12)).toBeCloseTo(220, 6);
  });

  it('round-trips hz -> midi -> hz', () => {
    for (const midi of [40, 55, 69, 72, 88]) {
      expect(hzToMidiFloat(midiToHz(midi))).toBeCloseTo(midi, 6);
    }
  });
});

describe('centsOff', () => {
  it('is zero when the pitch is exactly in tune', () => {
    expect(centsOff(midiToHz(60), 60)).toBeCloseTo(0, 6);
  });

  it('is +100 cents for a pitch one semitone sharp', () => {
    expect(centsOff(midiToHz(61), 60)).toBeCloseTo(100, 4);
  });

  it('is negative when the pitch is flat', () => {
    expect(centsOff(midiToHz(59), 60)).toBeCloseTo(-100, 4);
  });
});

describe('noteName', () => {
  it('names A4 and middle C', () => {
    expect(noteName(69)).toBe('A4');
    expect(noteName(60)).toBe('C4');
  });

  it('rounds fractional MIDI values to the nearest note', () => {
    expect(noteName(69.2)).toBe('A4');
    expect(noteName(68.7)).toBe('A4');
  });

  it('wraps note names correctly for low octaves and sharps', () => {
    expect(noteName(0)).toBe('C-1');
    expect(noteName(70)).toBe('A#4');
    expect(noteName(59)).toBe('B3');
  });
});
