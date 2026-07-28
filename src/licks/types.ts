export interface LickNote {
  midi: number;
  /** Display only — scoring uses `midi`. */
  string: number;
  /** Display only — scoring uses `midi`. */
  fret: number;
  /** Quarter notes from the start of the lick. */
  beat: number;
  /** Length in quarter notes. */
  duration: number;
}

export type BoxPosition = 1 | 2 | 3 | 4 | 5;

export interface Lick {
  id: string;
  name: string;
  key: string;
  /** Fret of the minor-pentatonic root on the low E string. */
  rootFret: number;
  expectedBox: BoxPosition;
  bpm: number;
  /** 1 (easiest) to 5. */
  difficulty: number;
  notes: LickNote[];
}

export function beatToMs(beat: number, bpm: number): number {
  return (beat * 60_000) / bpm;
}

export function lickDurationMs(lick: Lick): number {
  const last = lick.notes[lick.notes.length - 1];
  return beatToMs(last.beat + last.duration, lick.bpm);
}
