import { fretAt } from './geometry';
import type { BoxPosition, HandLandmark, NeckGeometry, Point } from './types';

/** Fret span of each pentatonic box, relative to the root fret. */
export const BOX_SPANS: Record<BoxPosition, [number, number]> = {
  1: [0, 3],
  2: [2, 5],
  3: [4, 7],
  4: [7, 10],
  5: [9, 12],
};

/** Below this the boxes are too ambiguous to say anything useful. */
export const MIN_BOX_CONFIDENCE = 0.6;

/** MCP joints — the knuckle row, which lies along the neck when fretting. */
const MCP_LANDMARKS = [5, 9, 13, 17];

export interface BoxEstimate {
  box: BoxPosition;
  confidence: number;
  /** Continuous fret position of the hand centre. */
  fret: number;
  span: [number, number];
}

function toImagePoint(landmark: HandLandmark, frameWidth: number, frameHeight: number): Point {
  return { x: landmark.x * frameWidth, y: landmark.y * frameHeight };
}

/** Fret coordinates the hand covers, from its knuckle row. */
export function handFretSpan(
  geometry: NeckGeometry,
  landmarks: HandLandmark[],
  frameWidth: number,
  frameHeight: number,
): { span: [number, number]; centre: number } | null {
  const frets = MCP_LANDMARKS.map((index) => landmarks[index])
    .filter((landmark): landmark is HandLandmark => landmark != null)
    .map((landmark) => fretAt(geometry, toImagePoint(landmark, frameWidth, frameHeight)))
    .filter((fret): fret is number => fret != null);
  if (frets.length < 2) return null;

  const index = landmarks[5];
  const pinky = landmarks[17];
  if (!index || !pinky) return null;
  const centre = fretAt(geometry, {
    x: ((index.x + pinky.x) / 2) * frameWidth,
    y: ((index.y + pinky.y) / 2) * frameHeight,
  });
  if (centre == null) return null;

  return { span: [Math.min(...frets), Math.max(...frets)], centre };
}

/** The fretting hand is the one nearer the headstock along the neck axis. */
export function pickFrettingHand(
  geometry: NeckGeometry,
  hands: HandLandmark[][],
  frameWidth: number,
  frameHeight: number,
): HandLandmark[] | null {
  let best: { hand: HandLandmark[]; fret: number } | null = null;
  for (const hand of hands) {
    const estimate = handFretSpan(geometry, hand, frameWidth, frameHeight);
    if (!estimate) continue;
    if (!best || estimate.centre < best.fret) best = { hand, fret: estimate.centre };
  }
  return best?.hand ?? null;
}

function overlap(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

/**
 * Five-way classification with a "can't tell" option. Adjacent boxes overlap by
 * design, so the confidence is the winner's share of all box overlaps.
 */
export function classifyBox(
  geometry: NeckGeometry,
  landmarks: HandLandmark[],
  rootFret: number,
  frameWidth: number,
  frameHeight: number,
): BoxEstimate | null {
  const hand = handFretSpan(geometry, landmarks, frameWidth, frameHeight);
  if (!hand) return null;

  // A hand always covers about four frets, even when the knuckle row is
  // foreshortened to nothing by the camera angle.
  const width = Math.max(hand.span[1] - hand.span[0], 3);
  const centre = (hand.span[0] + hand.span[1]) / 2;
  const span: [number, number] = [centre - width / 2, centre + width / 2];

  const overlaps = (Object.keys(BOX_SPANS) as unknown as string[])
    .map((key) => Number(key) as BoxPosition)
    .map((box) => {
      const [from, to] = BOX_SPANS[box];
      return { box, value: overlap(span, [rootFret + from, rootFret + to]) };
    });

  const total = overlaps.reduce((sum, entry) => sum + entry.value, 0);
  if (total <= 0) return null;
  const best = overlaps.reduce((a, b) => (b.value > a.value ? b : a));

  return {
    box: best.box,
    confidence: best.value / total,
    fret: hand.centre,
    span,
  };
}
