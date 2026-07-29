import { degToRad, median } from '../utils/math';
import { distanceToFret, DOT_FRETS, dotPosition, DOUBLE_DOT_FRET, fretDistance } from './fretMath';
import {
  applyHomography,
  computeHomography,
  invertHomography,
  reprojectionError,
  solveLinearSystem,
} from './homography';
import { findBlobs, houghLines, sobel, toGrayscale } from './imageOps';
import {
  angleBetween,
  intersect,
  lineDirection,
  meanTheta,
  signedDistance,
  splitOrientations,
  type Line,
} from './lines';
import type { Frame, InlayDot, NeckGeometry, Point } from './types';

export const MIN_DOTS = 4;
/** How parallel a line must be to the string bundle to count as an edge. */
const EDGE_PARALLEL_TOLERANCE_RAD = degToRad(4);
/** Beyond this the fit is not describing a fretboard. */
export const MAX_REPROJECTION_ERROR_PX = 12;

interface AxisFit {
  a: number;
  b: number;
  c: number;
}

/**
 * Fits the 1-D projective map from position along the neck axis (pixels) to
 * distance from the nut (scale lengths). Perspective makes this non-linear,
 * which is exactly what the `c` term absorbs.
 */
function fitAxis(s: number[], d: number[]): AxisFit | null {
  if (s.length < 3) return null;
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atb = [0, 0, 0];
  for (let i = 0; i < s.length; i++) {
    const row = [s[i], 1, -s[i] * d[i]];
    for (let r = 0; r < 3; r++) {
      atb[r] += row[r] * d[i];
      for (let c = 0; c < 3; c++) ata[r][c] += row[r] * row[c];
    }
  }
  const solved = solveLinearSystem(ata, atb);
  if (!solved) return null;
  return { a: solved[0], b: solved[1], c: solved[2] };
}

function axisFromDistance(fit: AxisFit, d: number): number {
  const denominator = d * fit.c - fit.a;
  if (Math.abs(denominator) < 1e-12) return NaN;
  return (fit.b - d) / denominator;
}

interface AxisDot {
  center: Point;
  along: number;
  across: number;
  areaPx: number;
  fret: number;
}

/**
 * Labels blobs with the frets they mark. The double dot at 12 is the only
 * unambiguous marker, so it anchors the sequence and the rest follow by order.
 */
export function labelDots(
  blobs: { center: Point; areaPx: number }[],
  along: (point: Point) => number,
  across: (point: Point) => number,
): AxisDot[] | null {
  if (blobs.length < MIN_DOTS) return null;

  const items = blobs.map((blob) => ({
    center: blob.center,
    areaPx: blob.areaPx,
    along: along(blob.center),
    across: across(blob.center),
    fret: 0,
  }));
  items.sort((a, b) => a.along - b.along);

  const gaps: number[] = [];
  for (let i = 1; i < items.length; i++) gaps.push(items[i].along - items[i - 1].along);
  const typicalGap = median(gaps);

  // The double dot is a pair sharing an along-neck position but split across it.
  let pairIndex = -1;
  for (let i = 1; i < items.length; i++) {
    const alongGap = items[i].along - items[i - 1].along;
    const acrossGap = Math.abs(items[i].across - items[i - 1].across);
    if (alongGap < typicalGap * 0.45 && acrossGap > 0.25) {
      pairIndex = i - 1;
      break;
    }
  }
  if (pairIndex < 0) return null;

  const collapsed: AxisDot[] = [];
  items.forEach((item, i) => {
    if (i === pairIndex + 1) return;
    if (i === pairIndex) {
      const other = items[i + 1];
      collapsed.push({
        ...item,
        center: {
          x: (item.center.x + other.center.x) / 2,
          y: (item.center.y + other.center.y) / 2,
        },
        along: (item.along + other.along) / 2,
        across: (item.across + other.across) / 2,
        areaPx: item.areaPx + other.areaPx,
        fret: DOUBLE_DOT_FRET,
      });
      return;
    }
    collapsed.push({ ...item });
  });

  const anchor = collapsed.findIndex((dot) => dot.fret === DOUBLE_DOT_FRET);
  const anchorInFrets = DOT_FRETS.indexOf(DOUBLE_DOT_FRET);

  // Frets crowd together toward the body, so shrinking gaps point that way.
  const collapsedGaps: number[] = [];
  for (let i = 1; i < collapsed.length; i++) {
    collapsedGaps.push(collapsed[i].along - collapsed[i - 1].along);
  }
  const half = Math.max(1, Math.floor(collapsedGaps.length / 2));
  const firstHalf = median(collapsedGaps.slice(0, half));
  const secondHalf = median(collapsedGaps.slice(-half));
  const bodyIsAscending = secondHalf <= firstHalf;

  const labelled = collapsed.map((dot, i) => {
    const step = bodyIsAscending ? i - anchor : anchor - i;
    const fretIndex = anchorInFrets + step;
    return { ...dot, fret: DOT_FRETS[fretIndex] ?? NaN };
  });

  const usable = labelled.filter((dot) => Number.isFinite(dot.fret));
  return usable.length >= MIN_DOTS ? usable : null;
}

/** Outermost pair of a near-parallel bundle, i.e. the two edges it bounds. */
function outerLines(lines: Line[]): { low: Line; high: Line } | null {
  if (lines.length < 2) return null;
  const sorted = [...lines].sort((a, b) => a.rho - b.rho);
  return { low: sorted[0], high: sorted[sorted.length - 1] };
}

export interface GeometryOptions {
  /** Hough magnitude threshold; lower it for dim frames. */
  minGradient?: number;
}

/**
 * Finds the fretboard and fits the homography that turns pixels into fret
 * coordinates. Pure over a single frame — no canvas, no camera.
 */
export function estimateNeckGeometry(frame: Frame, options: GeometryOptions = {}): NeckGeometry | null {
  const gray = toGrayscale(frame);
  const gradient = sobel(gray);
  const lines = houghLines(gradient, { minMagnitude: options.minGradient ?? 60 });
  const split = splitOrientations(lines);
  if (!split) return null;

  // Strings outnumber frets on a typical crop, but not always; the neck axis is
  // the orientation whose lines span the longer image extent.
  const center: Point = { x: frame.width / 2, y: frame.height / 2 };
  const candidates: { strings: Line[]; frets: Line[] }[] = [
    { strings: split.dominant, frets: split.perpendicular },
    { strings: split.perpendicular, frets: split.dominant },
  ];

  for (const candidate of candidates) {
    // Only lines truly parallel to the bundle can be fretboard edges; a nearby
    // stray at 15° would skew every coordinate derived from them.
    const theta = meanTheta(candidate.strings);
    const parallel = candidate.strings.filter(
      (line) => angleBetween(line.theta, theta) <= EDGE_PARALLEL_TOLERANCE_RAD,
    );
    const stringEdges = outerLines(parallel);
    if (!stringEdges) continue;

    const axis = lineDirection(stringEdges.low);
    const axisNormalTheta = Math.atan2(axis.y, axis.x);
    const alongOf = (point: Point) => point.x * axis.x + point.y * axis.y;
    const cutAt = (along: number): Line => ({ rho: along, theta: axisNormalTheta });

    const widthReference = intersect(stringEdges.high, cutAt(alongOf(center)));
    if (!widthReference) continue;
    const widthPx = Math.abs(signedDistance(stringEdges.low, widthReference));
    if (widthPx < 8) continue;
    const acrossOf = (point: Point) => signedDistance(stringEdges.low, point) / widthPx;

    // The neck runs out of the frame at both ends, so the image bounds are what
    // cap it along the axis.
    const cornerAlongs = [
      { x: 0, y: 0 },
      { x: frame.width, y: 0 },
      { x: 0, y: frame.height },
      { x: frame.width, y: frame.height },
    ].map(alongOf);
    const alongMin = Math.min(...cornerAlongs);
    const alongMax = Math.max(...cornerAlongs);

    const corners = [
      intersect(stringEdges.low, cutAt(alongMin)),
      intersect(stringEdges.high, cutAt(alongMin)),
      intersect(stringEdges.high, cutAt(alongMax)),
      intersect(stringEdges.low, cutAt(alongMax)),
    ];
    if (corners.some((corner) => corner === null)) continue;
    const quad = corners as [Point, Point, Point, Point];

    const inside = (x: number, y: number) => {
      const point = { x, y };
      const a = signedDistance(stringEdges.low, point);
      const b = signedDistance(stringEdges.high, point);
      return a * b <= 0;
    };

    const blobs = findBlobs(gray, {
      mask: inside,
      erosions: Math.max(1, Math.round(widthPx / 60)),
      minAreaPx: Math.max(4, Math.round((widthPx / 24) ** 2)),
      maxAreaPx: Math.round(widthPx * widthPx),
    });
    const dots = labelDots(blobs, alongOf, acrossOf);
    if (!dots) continue;

    const fit = fitAxis(dots.map((dot) => dot.along), dots.map((dot) => dotPosition(dot.fret)));
    if (!fit) continue;

    // Two fret distances spanning the neck, each taken on both fretboard edges,
    // give four well-spread correspondences for a stable homography.
    const referenceDistances = [fretDistance(1), fretDistance(15)];
    const from: Point[] = [];
    const to: Point[] = [];
    for (const distance of referenceDistances) {
      const s = axisFromDistance(fit, distance);
      if (!Number.isFinite(s)) break;
      const cut = cutAt(s);
      const lowPoint = intersect(cut, stringEdges.low);
      const highPoint = intersect(cut, stringEdges.high);
      if (!lowPoint || !highPoint) break;
      from.push(lowPoint, highPoint);
      to.push({ x: distance, y: 0 }, { x: distance, y: 1 });
    }
    if (from.length < 4) continue;

    const imageToBoard = computeHomography(from, to);
    if (!imageToBoard) continue;
    const boardToImage = invertHomography(imageToBoard);
    if (!boardToImage) continue;

    const reprojectionErrorPx = reprojectionError(
      boardToImage,
      dots.map((dot) => ({ x: dotPosition(dot.fret), y: dot.across })),
      dots.map((dot) => dot.center),
    );
    if (reprojectionErrorPx > MAX_REPROJECTION_ERROR_PX) continue;

    const visible = [
      { x: 0, y: 0 },
      { x: frame.width, y: 0 },
      { x: 0, y: frame.height },
      { x: frame.width, y: frame.height },
    ]
      .map((corner) => applyHomography(imageToBoard, corner).x)
      .filter((distance) => Number.isFinite(distance));
    const visibleFrets = {
      min: Math.max(0, distanceToFret(Math.max(0, Math.min(...visible)))),
      max: distanceToFret(Math.min(0.95, Math.max(...visible))),
    };

    const inlays: InlayDot[] = dots.map((dot) => ({
      center: dot.center,
      fret: dot.fret,
      areaPx: dot.areaPx,
    }));

    return {
      quad,
      imageToBoard,
      boardToImage,
      dots: inlays,
      reprojectionErrorPx,
      widthPx,
      visibleFrets,
    };
  }

  return null;
}

/** Continuous fret coordinate of an image point, or null behind the nut. */
export function fretAt(geometry: NeckGeometry, point: Point): number | null {
  const board = applyHomography(geometry.imageToBoard, point);
  if (!Number.isFinite(board.x) || board.x >= 1) return null;
  return distanceToFret(Math.max(0, board.x));
}
