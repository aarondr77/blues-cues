import { degToRad } from '../utils/math';
import type { Point } from './types';

export interface Line {
  rho: number;
  theta: number;
  votes?: number;
}

/** Unit vector along the line (perpendicular to its normal). */
export function lineDirection(line: Line): Point {
  return { x: -Math.sin(line.theta), y: Math.cos(line.theta) };
}

export function lineNormal(line: Line): Point {
  return { x: Math.cos(line.theta), y: Math.sin(line.theta) };
}

/** Signed distance from the line; the sign says which side the point is on. */
export function signedDistance(line: Line, point: Point): number {
  return point.x * Math.cos(line.theta) + point.y * Math.sin(line.theta) - line.rho;
}

export function intersect(a: Line, b: Line): Point | null {
  const det = Math.cos(a.theta) * Math.sin(b.theta) - Math.sin(a.theta) * Math.cos(b.theta);
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: (a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det,
    y: (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det,
  };
}

/** Smallest angle between two line orientations, 0..π/2. */
export function angleBetween(a: number, b: number): number {
  let diff = Math.abs(a - b) % Math.PI;
  if (diff > Math.PI / 2) diff = Math.PI - diff;
  return diff;
}

/** Circular mean of orientations modulo π, weighted by votes. */
export function meanTheta(lines: Line[]): number {
  let sumSin = 0;
  let sumCos = 0;
  for (const line of lines) {
    const weight = line.votes ?? 1;
    sumSin += weight * Math.sin(2 * line.theta);
    sumCos += weight * Math.cos(2 * line.theta);
  }
  const mean = Math.atan2(sumSin, sumCos) / 2;
  return mean < 0 ? mean + Math.PI : mean;
}

/**
 * Groups lines into the dominant orientation and the one perpendicular to it —
 * strings and frets, in either order.
 */
export function splitOrientations(
  lines: Line[],
  toleranceRad = degToRad(15),
): { dominant: Line[]; perpendicular: Line[]; dominantTheta: number } | null {
  if (lines.length === 0) return null;

  let best: { theta: number; weight: number; members: Line[] } | null = null;
  for (const candidate of lines) {
    const members = lines.filter(
      (line) => angleBetween(line.theta, candidate.theta) <= toleranceRad,
    );
    const weight = members.reduce((sum, line) => sum + (line.votes ?? 1), 0);
    if (!best || weight > best.weight) best = { theta: candidate.theta, weight, members };
  }
  if (!best) return null;

  const dominantTheta = meanTheta(best.members);
  const dominant = lines.filter((line) => angleBetween(line.theta, dominantTheta) <= toleranceRad);
  const perpendicular = lines.filter(
    (line) => Math.abs(angleBetween(line.theta, dominantTheta) - Math.PI / 2) <= toleranceRad,
  );
  return { dominant, perpendicular, dominantTheta };
}
