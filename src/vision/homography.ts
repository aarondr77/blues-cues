import type { Point } from './types';

/** Solves `A x = b` by Gaussian elimination with partial pivoting. */
export function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
    }
  }

  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Least-squares homography (DLT with h22 fixed to 1) mapping `from` onto `to`.
 * Four correspondences suffice; more are used to average out dot-centroid noise.
 */
export function computeHomography(from: Point[], to: Point[]): number[] | null {
  if (from.length !== to.length || from.length < 4) return null;

  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < from.length; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }

  // Normal equations: (A^T A) h = A^T b.
  const ata: number[][] = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atb = new Array<number>(8).fill(0);
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < 8; i++) {
      atb[i] += rows[r][i] * rhs[r];
      for (let j = 0; j < 8; j++) ata[i][j] += rows[r][i] * rows[r][j];
    }
  }

  const h = solveLinearSystem(ata, atb);
  return h ? [...h, 1] : null;
}

export function applyHomography(h: number[], point: Point): Point {
  const w = h[6] * point.x + h[7] * point.y + h[8];
  if (Math.abs(w) < 1e-12) return { x: NaN, y: NaN };
  return {
    x: (h[0] * point.x + h[1] * point.y + h[2]) / w,
    y: (h[3] * point.x + h[4] * point.y + h[5]) / w,
  };
}

export function invertHomography(h: number[]): number[] | null {
  const [a, b, c, d, e, f, g, i, j] = h;
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [
    e * j - f * i,
    c * i - b * j,
    b * f - c * e,
    f * g - d * j,
    a * j - c * g,
    c * d - a * f,
    d * i - e * g,
    b * g - a * i,
    a * e - b * d,
  ].map((value) => value / det);
  return inv.map((value) => value / inv[8]);
}

export function reprojectionErrorPx(h: number[], from: Point[], to: Point[]): number {
  let sum = 0;
  for (let i = 0; i < from.length; i++) {
    const projected = applyHomography(h, from[i]);
    sum += (projected.x - to[i].x) ** 2 + (projected.y - to[i].y) ** 2;
  }
  return Math.sqrt(sum / from.length);
}
