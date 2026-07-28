import { describe, expect, it } from 'vitest';
import { detectNotes } from '../audio/analyze';
import { lickById } from '../licks';
import { scoreAttempt } from '../scoring/score';
import { listAudioFixtures, matchTimes } from './fixtures';

/**
 * Acceptance tests for §5 against Aaron's recordings. They are skipped until
 * `fixtures/audio/<category>/` exists, so the suite stays green before the
 * recordings land and turns into the real gate the moment they do.
 */
const clean = listAudioFixtures('clean');
const lowNotes = listAudioFixtures('low-notes');
const noise = listAudioFixtures('noise');
const wrongNote = listAudioFixtures('wrong-note');
const offTime = listAudioFixtures('off-time');

const ONSET_TOLERANCE_MS = 30;

function detectionRates(fixtures: ReturnType<typeof listAudioFixtures>) {
  let expectedTotal = 0;
  let onsetsMatched = 0;
  let pitchCorrect = 0;
  let extras = 0;

  for (const fixture of fixtures) {
    const labels = fixture.labels;
    if (!labels) throw new Error(`${fixture.path}: missing sibling label JSON`);
    const detected = detectNotes(fixture.samples, fixture.sampleRate, {
      expectedMidis: labels.notes.map((note) => note.midi),
    });

    const match = matchTimes(
      labels.notes.map((note) => note.timeMs),
      detected.map((note) => note.timeMs),
      ONSET_TOLERANCE_MS,
    );
    expectedTotal += labels.notes.length;
    onsetsMatched += match.matched;
    extras += match.extra;

    labels.notes.forEach((label) => {
      const nearest = detected
        .map((note) => ({ note, error: Math.abs(note.timeMs - label.timeMs) }))
        .sort((a, b) => a.error - b.error)[0];
      if (nearest && nearest.error <= ONSET_TOLERANCE_MS && Math.round(nearest.note.midi) === label.midi) {
        pitchCorrect++;
      }
    });
  }

  return {
    onsetRate: onsetsMatched / expectedTotal,
    pitchRate: pitchCorrect / expectedTotal,
    extras,
  };
}

describe.skipIf(clean.length === 0)('fixtures: clean takes', () => {
  it('detects ≥95% of labelled onsets within 30ms and ≥95% of pitches', () => {
    const rates = detectionRates(clean);
    expect(rates.onsetRate).toBeGreaterThanOrEqual(0.95);
    expect(rates.pitchRate).toBeGreaterThanOrEqual(0.95);
  });
});

describe.skipIf(lowNotes.length === 0)('fixtures: low notes', () => {
  it('survives the octave-error torture test', () => {
    const rates = detectionRates(lowNotes);
    expect(rates.onsetRate).toBeGreaterThanOrEqual(0.95);
    expect(rates.pitchRate).toBeGreaterThanOrEqual(0.95);
  });
});

describe.skipIf(noise.length === 0)('fixtures: room tone', () => {
  it('registers no note events at all', () => {
    for (const fixture of noise) {
      expect(detectNotes(fixture.samples, fixture.sampleRate), fixture.name).toHaveLength(0);
    }
  });
});

describe.skipIf(wrongNote.length + offTime.length === 0)('fixtures: scored takes', () => {
  it('computes the hand-labelled judgments', () => {
    for (const fixture of [...wrongNote, ...offTime]) {
      const labels = fixture.labels;
      if (!labels?.lickId || !labels.judgments) {
        throw new Error(`${fixture.path}: scored fixtures need lickId and judgments`);
      }
      const lick = lickById(labels.lickId);
      if (!lick) throw new Error(`${fixture.path}: unknown lick ${labels.lickId}`);

      const detected = detectNotes(fixture.samples, fixture.sampleRate, {
        expectedMidis: lick.notes.map((note) => note.midi),
      });
      const score = scoreAttempt(lick, detected, labels.offsetMs ?? 0);
      expect(score.judgments.map((j) => j.judgment), fixture.name).toEqual(labels.judgments);
      if (labels.extraNotes != null) {
        expect(score.extraNotes, fixture.name).toBe(labels.extraNotes);
      }
    }
  });
});
