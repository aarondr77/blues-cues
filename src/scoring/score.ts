import type { DetectedNote } from '../audio/types';
import { centsOff } from '../audio/notes';
import { beatToMs, type Lick } from '../licks/types';

export type Judgment = 'perfect' | 'good' | 'early' | 'late' | 'miss';

export interface NoteJudgment {
  noteIndex: number;
  expectedMidi: number;
  expectedTimeMs: number;
  judgment: Judgment;
  /** Latency-corrected time of the matched attack. */
  detectedTimeMs: number | null;
  /** Positive means the player was late. */
  errorMs: number | null;
  centsOff: number | null;
}

export interface Score {
  judgments: NoteJudgment[];
  /** Attacks that matched no expected note. */
  extraNotes: number;
  extraPenaltyPoints: number;
  percentage: number;
  /** False when latency calibration was skipped, which widens every window. */
  calibrated: boolean;
}

export interface ScoringWindows {
  perfectMs: number;
  goodMs: number;
  slopMs: number;
  pitchToleranceCents: number;
}

export const CALIBRATED_WINDOWS: ScoringWindows = {
  perfectMs: 60,
  goodMs: 120,
  slopMs: 200,
  pitchToleranceCents: 50,
};

/** Skipping calibration means timing is only meaningful to about a tenth of a second. */
export const UNCALIBRATED_SLACK_MS = 100;

const JUDGMENT_POINTS: Record<Judgment, number> = {
  perfect: 1,
  good: 0.85,
  early: 0.5,
  late: 0.5,
  miss: 0,
};

/** Percentage points lost per extra attack, and the cap on that loss. */
export const EXTRA_NOTE_PENALTY_POINTS = 2;
export const MAX_EXTRA_NOTE_PENALTY_POINTS = 10;

export function windowsFor(calibrated: boolean): ScoringWindows {
  if (calibrated) return CALIBRATED_WINDOWS;
  return {
    perfectMs: CALIBRATED_WINDOWS.perfectMs + UNCALIBRATED_SLACK_MS,
    goodMs: CALIBRATED_WINDOWS.goodMs + UNCALIBRATED_SLACK_MS,
    slopMs: CALIBRATED_WINDOWS.slopMs + UNCALIBRATED_SLACK_MS,
    pitchToleranceCents: CALIBRATED_WINDOWS.pitchToleranceCents,
  };
}

function judge(errorMs: number, windows: ScoringWindows): Judgment {
  const magnitude = Math.abs(errorMs);
  if (magnitude <= windows.perfectMs) return 'perfect';
  if (magnitude <= windows.goodMs) return 'good';
  if (magnitude <= windows.slopMs) return errorMs < 0 ? 'early' : 'late';
  return 'miss';
}

export interface ScoreOptions {
  calibrated?: boolean;
  windows?: ScoringWindows;
}

/**
 * Matches detected attacks to the lick. Pure over the detection output, so a
 * hand-labelled fixture can be scored without any audio hardware.
 */
export function scoreAttempt(
  lick: Lick,
  detectedNotes: DetectedNote[],
  offsetMs: number,
  options: ScoreOptions = {},
): Score {
  const calibrated = options.calibrated ?? true;
  const windows = options.windows ?? windowsFor(calibrated);

  const corrected = detectedNotes
    .map((note, index) => ({ ...note, index, timeMs: note.timeMs - offsetMs }))
    .sort((a, b) => a.timeMs - b.timeMs);
  const used = new Set<number>();

  const judgments: NoteJudgment[] = lick.notes.map((note, noteIndex) => {
    const expectedTimeMs = beatToMs(note.beat, lick.bpm);
    let best: (typeof corrected)[number] | null = null;
    let bestError = Infinity;

    for (const candidate of corrected) {
      if (used.has(candidate.index)) continue;
      const error = candidate.timeMs - expectedTimeMs;
      if (Math.abs(error) > windows.slopMs) continue;
      if (Math.abs(centsOff(candidate.hz, note.midi)) > windows.pitchToleranceCents) continue;
      if (Math.abs(error) < Math.abs(bestError)) {
        best = candidate;
        bestError = error;
      }
    }

    if (!best) {
      return {
        noteIndex,
        expectedMidi: note.midi,
        expectedTimeMs,
        judgment: 'miss',
        detectedTimeMs: null,
        errorMs: null,
        centsOff: null,
      };
    }

    used.add(best.index);
    return {
      noteIndex,
      expectedMidi: note.midi,
      expectedTimeMs,
      judgment: judge(bestError, windows),
      detectedTimeMs: best.timeMs,
      errorMs: bestError,
      centsOff: centsOff(best.hz, note.midi),
    };
  });

  const extraNotes = corrected.length - used.size;
  const extraPenaltyPoints = Math.min(
    extraNotes * EXTRA_NOTE_PENALTY_POINTS,
    MAX_EXTRA_NOTE_PENALTY_POINTS,
  );
  const earned = judgments.reduce((sum, j) => sum + JUDGMENT_POINTS[j.judgment], 0);
  const base = lick.notes.length > 0 ? (earned / lick.notes.length) * 100 : 0;

  return {
    judgments,
    extraNotes,
    extraPenaltyPoints,
    percentage: Math.max(0, Math.round(base - extraPenaltyPoints)),
    calibrated,
  };
}
