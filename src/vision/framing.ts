import { estimateNeckGeometry } from './geometry';
import { meanBrightness, toGrayscale, type GrayImage } from './imageOps';
import type { Frame, HandLandmark, NeckGeometry, Point } from './types';

export type FramingCheckId =
  | 'neck-quad'
  | 'inlay-dots'
  | 'fret-range'
  | 'fretboard-width'
  | 'brightness'
  | 'hand-landmarks';

export interface FramingCheck {
  id: FramingCheckId;
  label: string;
  passed: boolean;
  /** Shown only when the check fails. */
  prompt: string;
}

export interface FramingReport {
  checks: FramingCheck[];
  passed: boolean;
  geometry: NeckGeometry | null;
}

export const MIN_FRETBOARD_WIDTH_PX = 60;
export const MIN_BRIGHTNESS = 45;
export const MAX_BRIGHTNESS = 215;
/** Frets 1-12 have to be in shot for the box feedback to mean anything. */
export const REQUIRED_FRET_RANGE = { min: 1, max: 12 };
export const MIN_DOTS_VISIBLE = 4;

const PROMPTS: Record<FramingCheckId, { label: string; prompt: string }> = {
  'neck-quad': {
    label: 'Neck detected',
    prompt: 'Point the guitar neck toward the camera',
  },
  'inlay-dots': {
    label: '4 or more inlay dots visible',
    prompt: 'Rotate the guitar so the strings face me a little more',
  },
  'fret-range': {
    label: 'Frets 1-12 in frame',
    prompt: 'Back up until the whole neck fits',
  },
  'fretboard-width': {
    label: 'Fretboard at least 60px wide',
    prompt: 'Move a bit closer',
  },
  brightness: {
    label: 'Lighting in range',
    prompt: 'Add some light on the fretboard',
  },
  'hand-landmarks': {
    label: 'Fretting hand detected',
    prompt: 'Put your hand on the neck',
  },
};

function check(id: FramingCheckId, passed: boolean): FramingCheck {
  return { id, passed, ...PROMPTS[id] };
}

function insidePolygon(polygon: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.y > y !== b.y > y;
    if (straddles && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function meanBrightnessInQuad(gray: GrayImage, quad: Point[]): number {
  let sum = 0;
  let count = 0;
  const minX = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.x))));
  const maxX = Math.min(gray.width - 1, Math.ceil(Math.max(...quad.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.y))));
  const maxY = Math.min(gray.height - 1, Math.ceil(Math.max(...quad.map((p) => p.y))));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!insidePolygon(quad, x + 0.5, y + 0.5)) continue;
      sum += gray.data[y * gray.width + x];
      count++;
    }
  }
  return count > 0 ? sum / count : meanBrightness(gray);
}

export interface FramingInput {
  frame: Frame;
  /** Pass the cached geometry to avoid re-running the fit on every frame. */
  geometry?: NeckGeometry | null;
  hands?: HandLandmark[][];
}

/**
 * The gate in front of the first lick: every check must pass, and each failure
 * carries the prompt that tells the player how to fix it.
 */
export function checkFraming(input: FramingInput): FramingReport {
  const { frame, hands = [] } = input;
  const geometry = input.geometry !== undefined ? input.geometry : estimateNeckGeometry(frame);
  const gray = toGrayscale(frame);
  // What matters is light on the fretboard, not on the wall behind it.
  const brightness = geometry ? meanBrightnessInQuad(gray, geometry.quad) : meanBrightness(gray);

  const checks: FramingCheck[] = [
    check('neck-quad', geometry != null),
    check('inlay-dots', (geometry?.dots.length ?? 0) >= MIN_DOTS_VISIBLE),
    check(
      'fret-range',
      geometry != null &&
        geometry.visibleFrets.min <= REQUIRED_FRET_RANGE.min &&
        geometry.visibleFrets.max >= REQUIRED_FRET_RANGE.max,
    ),
    check('fretboard-width', (geometry?.widthPx ?? 0) >= MIN_FRETBOARD_WIDTH_PX),
    check('brightness', brightness >= MIN_BRIGHTNESS && brightness <= MAX_BRIGHTNESS),
    check('hand-landmarks', hands.some((hand) => hand.length >= 21)),
  ];

  return { checks, passed: checks.every((entry) => entry.passed), geometry };
}

export function firstFailure(report: FramingReport): FramingCheck | null {
  return report.checks.find((entry) => !entry.passed) ?? null;
}
