import { describe, expect, it } from 'vitest';
import { detectNotes } from './analyze';
import { computeSpectralFrames, detectOnsets } from './onsets';
import { synthesizeNotes, synthesizeRoomNoise, type SynthNote } from '../test/synth';
import { centsOff } from './notes';

const SAMPLE_RATE = 44100;

function lickNotes(midis: number[], startMs = 300, stepMs = 375, durationMs = 340): SynthNote[] {
  return midis.map((midi, i) => ({ midi, startMs: startMs + i * stepMs, durationMs }));
}

function matchOnsets(expectedMs: number[], detectedMs: number[], toleranceMs: number) {
  const remaining = [...detectedMs];
  let matched = 0;
  let worstError = 0;
  for (const expected of expectedMs) {
    let bestIndex = -1;
    let bestError = Infinity;
    remaining.forEach((time, i) => {
      const error = Math.abs(time - expected);
      if (error < bestError) {
        bestError = error;
        bestIndex = i;
      }
    });
    if (bestIndex >= 0 && bestError <= toleranceMs) {
      matched++;
      worstError = Math.max(worstError, bestError);
      remaining.splice(bestIndex, 1);
    }
  }
  return { matched, worstError, extra: remaining.length };
}

describe('onset detection', () => {
  it('finds every attack within 30ms, including repeated notes', () => {
    // Repeated notes are the case pitch tracking alone cannot see.
    const midis = [69, 72, 72, 74, 72, 69, 69, 67];
    const notes = lickNotes(midis);
    const audio = synthesizeNotes(notes, { sampleRate: SAMPLE_RATE });

    const onsets = detectOnsets(computeSpectralFrames(audio, SAMPLE_RATE));
    const { matched, worstError, extra } = matchOnsets(
      notes.map((n) => n.startMs),
      onsets.map((o) => o.timeMs),
      30,
    );

    expect(matched).toBe(notes.length);
    expect(worstError).toBeLessThanOrEqual(30);
    expect(extra).toBe(0);
  });

  it('reports nothing on room tone, typing and muted-string scratch', () => {
    const noise = synthesizeRoomNoise(30_000, { sampleRate: SAMPLE_RATE });
    expect(detectNotes(noise, SAMPLE_RATE)).toHaveLength(0);
  });
});

describe('pitch detection', () => {
  it('names every note of a lick correctly', () => {
    const midis = [69, 72, 74, 75, 74, 72, 69, 67, 69];
    const notes = lickNotes(midis);
    const audio = synthesizeNotes(notes, { sampleRate: SAMPLE_RATE });

    const detected = detectNotes(audio, SAMPLE_RATE);
    expect(detected).toHaveLength(midis.length);
    detected.forEach((note, i) => {
      expect(Math.round(note.midi)).toBe(midis[i]);
      expect(Math.abs(centsOff(note.hz, midis[i]))).toBeLessThan(50);
    });
  });

  it('survives a chromatic run on the low E string', () => {
    // Octave-error torture test: wound strings, weak fundamentals.
    const midis = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52];
    const notes = lickNotes(midis, 300, 400, 360);
    const audio = synthesizeNotes(notes, { sampleRate: SAMPLE_RATE });

    const detected = detectNotes(audio, SAMPLE_RATE, { expectedMidis: midis });
    const correct = detected.filter((note, i) => Math.round(note.midi) === midis[i]).length;
    expect(detected.length).toBe(midis.length);
    expect(correct / midis.length).toBeGreaterThanOrEqual(0.95);
  });
});
