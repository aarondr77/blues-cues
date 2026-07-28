import type { Frame, Point } from './types';

export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

export function toGrayscale(frame: Frame): GrayImage {
  const { width, height, data } = frame;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { width, height, data: out };
}

export function meanBrightness(gray: GrayImage): number {
  let sum = 0;
  for (let i = 0; i < gray.data.length; i++) sum += gray.data[i];
  return sum / gray.data.length;
}

export interface Gradient {
  magnitude: Float32Array;
  angle: Float32Array;
  width: number;
  height: number;
}

/** Sobel gradients. Canny's thinning is unnecessary: Hough tolerates thick edges. */
export function sobel(gray: GrayImage): Gradient {
  const { width, height, data } = gray;
  const magnitude = new Float32Array(width * height);
  const angle = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = data[i - width - 1];
      const t = data[i - width];
      const tr = data[i - width + 1];
      const l = data[i - 1];
      const r = data[i + 1];
      const bl = data[i + width - 1];
      const b = data[i + width];
      const br = data[i + width + 1];
      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      magnitude[i] = Math.hypot(gx, gy);
      angle[i] = Math.atan2(gy, gx);
    }
  }
  return { magnitude, angle, width, height };
}

export interface HoughLine {
  /** Distance from the image origin. */
  rho: number;
  /** Normal direction, 0..π. */
  theta: number;
  votes: number;
}

export interface HoughOptions {
  thetaSteps?: number;
  rhoStep?: number;
  /** Gradient magnitude required to vote. */
  minMagnitude?: number;
  /** Votes required, as a fraction of the strongest peak. */
  minVoteRatio?: number;
  maxLines?: number;
  /** Non-maximum suppression radius, in pixels of rho. */
  suppressRhoPx?: number;
  /** Non-maximum suppression radius, in radians of theta. */
  suppressThetaRad?: number;
}

/** Standard Hough transform over gradient pixels. */
export function houghLines(gradient: Gradient, options: HoughOptions = {}): HoughLine[] {
  const thetaSteps = options.thetaSteps ?? 180;
  const rhoStep = options.rhoStep ?? 2;
  const minMagnitude = options.minMagnitude ?? 60;
  // Frets are short lines and strings are long ones, so the two families sit at
  // very different vote counts; the threshold has to admit both.
  const minVoteRatio = options.minVoteRatio ?? 0.08;
  const maxLines = options.maxLines ?? 40;
  const suppressRhoPx = options.suppressRhoPx ?? 10;
  const suppressThetaRad = options.suppressThetaRad ?? (4 * Math.PI) / 180;

  const { width, height, magnitude } = gradient;
  const diagonal = Math.hypot(width, height);
  const rhoBins = Math.ceil((2 * diagonal) / rhoStep) + 1;
  const accumulator = new Float32Array(thetaSteps * rhoBins);
  const cos = new Float32Array(thetaSteps);
  const sin = new Float32Array(thetaSteps);
  for (let t = 0; t < thetaSteps; t++) {
    const theta = (Math.PI * t) / thetaSteps;
    cos[t] = Math.cos(theta);
    sin[t] = Math.sin(theta);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const m = magnitude[y * width + x];
      if (m < minMagnitude) continue;
      for (let t = 0; t < thetaSteps; t++) {
        const rho = x * cos[t] + y * sin[t];
        const bin = Math.round((rho + diagonal) / rhoStep);
        accumulator[t * rhoBins + bin] += m;
      }
    }
  }

  let peak = 0;
  for (let i = 0; i < accumulator.length; i++) peak = Math.max(peak, accumulator[i]);
  if (peak === 0) return [];

  const threshold = peak * minVoteRatio;
  const lines: HoughLine[] = [];
  for (let t = 0; t < thetaSteps; t++) {
    for (let bin = 1; bin < rhoBins - 1; bin++) {
      const votes = accumulator[t * rhoBins + bin];
      if (votes < threshold) continue;
      // Local maximum in rho and theta keeps one line per edge.
      if (votes < accumulator[t * rhoBins + bin - 1] || votes < accumulator[t * rhoBins + bin + 1]) continue;
      const prevTheta = ((t - 1 + thetaSteps) % thetaSteps) * rhoBins + bin;
      const nextTheta = ((t + 1) % thetaSteps) * rhoBins + bin;
      if (votes < accumulator[prevTheta] || votes < accumulator[nextTheta]) continue;
      lines.push({ rho: bin * rhoStep - diagonal, theta: (Math.PI * t) / thetaSteps, votes });
    }
  }

  // Every edge produces a ridge of bins; keep only the strongest of each ridge.
  const kept: HoughLine[] = [];
  for (const line of lines.sort((a, b) => b.votes - a.votes)) {
    const duplicate = kept.some(
      (other) =>
        Math.abs(other.rho - line.rho) < suppressRhoPx &&
        Math.abs(other.theta - line.theta) < suppressThetaRad,
    );
    if (duplicate) continue;
    kept.push(line);
    if (kept.length >= maxLines) break;
  }
  return kept;
}

export interface Blob {
  center: Point;
  areaPx: number;
  /** Bounding box aspect ratio, 1 for a circle. */
  aspect: number;
}

export interface BlobOptions {
  minAreaPx?: number;
  maxAreaPx?: number;
  /** Pixels this much brighter than the local background are blob candidates. */
  brightnessMargin?: number;
  maxAspect?: number;
  /** Only pixels inside this predicate are considered. */
  mask?: (x: number, y: number) => boolean;
  /**
   * Erosion passes applied before labelling. Strings and fret wire are thin and
   * cross the inlays; eroding breaks those bridges so each dot stands alone.
   */
  erosions?: number;
}

/**
 * Connected-component blob detection for inlay dots: light markers on a dark
 * fretboard, found by thresholding against the local background level.
 */
export function findBlobs(gray: GrayImage, options: BlobOptions = {}): Blob[] {
  const { width, height, data } = gray;
  const minArea = options.minAreaPx ?? 12;
  const maxArea = options.maxAreaPx ?? 4000;
  const margin = options.brightnessMargin ?? 40;
  const maxAspect = options.maxAspect ?? 2.2;
  const mask = options.mask;

  let sum = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask && !mask(x, y)) continue;
      sum += data[y * width + x];
      count++;
    }
  }
  if (count === 0) return [];
  const threshold = sum / count + margin;

  let binary = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask && !mask(x, y)) continue;
      binary[i] = data[i] >= threshold ? 1 : 0;
    }
  }

  const erosions = options.erosions ?? 0;
  for (let pass = 0; pass < erosions; pass++) {
    const eroded = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (!binary[i]) continue;
        if (
          binary[i - 1] &&
          binary[i + 1] &&
          binary[i - width] &&
          binary[i + width] &&
          binary[i - width - 1] &&
          binary[i - width + 1] &&
          binary[i + width - 1] &&
          binary[i + width + 1]
        ) {
          eroded[i] = 1;
        }
      }
    }
    binary = eroded;
  }

  const visited = new Uint8Array(width * height);
  const blobs: Blob[] = [];
  const stack: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start] || !binary[start]) continue;

      visited[start] = 1;
      stack.push(start);
      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (stack.length > 0) {
        const index = stack.pop() as number;
        const px = index % width;
        const py = (index / width) | 0;
        area++;
        sumX += px;
        sumY += py;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next] || !binary[next]) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }

      if (area < minArea || area > maxArea) continue;
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const aspect = Math.max(boxWidth / boxHeight, boxHeight / boxWidth);
      if (aspect > maxAspect) continue;

      blobs.push({ center: { x: sumX / area, y: sumY / area }, areaPx: area, aspect });
    }
  }

  return blobs.sort((a, b) => b.areaPx - a.areaPx);
}
