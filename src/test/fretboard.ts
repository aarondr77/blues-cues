import { degToRad } from '../utils/math';
import { applyHomography, computeHomography, invertHomography } from '../vision/homography';
import { DOT_FRETS, dotPosition, fretDistance } from '../vision/fretMath';
import type { Frame, Point } from '../vision/types';

export interface FretboardRenderOptions {
  width?: number;
  height?: number;
  /** Fretboard length across the frame, as a fraction of the width. */
  lengthFraction?: number;
  /** Fretboard width in pixels at the nut. */
  neckWidthPx?: number;
  /** Perspective: how much narrower the body end is than the nut end. */
  taper?: number;
  rotationDeg?: number;
  /** Board distance visible at the left edge of the drawn neck. */
  startFret?: number;
  endFret?: number;
  /** 0..1 scene brightness. */
  brightness?: number;
  /** Draw the inlay dots at all — an edge-on neck hides them. */
  drawDots?: boolean;
  centre?: Point;
}

const DEFAULTS = {
  width: 640,
  height: 360,
  lengthFraction: 0.85,
  neckWidthPx: 90,
  taper: 0.85,
  rotationDeg: 0,
  startFret: 0,
  endFret: 21,
  brightness: 1,
  drawDots: true,
};

export interface RenderedFretboard extends Frame {
  /** Maps board coordinates (distance from nut, across) to pixels. */
  boardToImage: number[];
  imageToBoard: number[];
}

/**
 * Draws a synthetic fretboard — wood, frets, strings and inlays — through a
 * known homography, so tests can assert what the vision pipeline recovers.
 */
export function renderFretboard(options: FretboardRenderOptions = {}): RenderedFretboard {
  const o = { ...DEFAULTS, ...options };
  const width = o.width;
  const height = o.height;
  const centre = options.centre ?? { x: width / 2, y: height / 2 };

  const startDistance = fretDistance(o.startFret);
  const endDistance = fretDistance(o.endFret);
  const lengthPx = width * o.lengthFraction;
  const rotation = degToRad(o.rotationDeg);

  const place = (u: number, v: number): Point => {
    // u: 0..1 along the drawn neck, v: -0.5..0.5 across it.
    const halfWidth = (o.neckWidthPx / 2) * (1 - (1 - o.taper) * u);
    const x = (u - 0.5) * lengthPx;
    const y = v * 2 * halfWidth;
    return {
      x: centre.x + x * Math.cos(rotation) - y * Math.sin(rotation),
      y: centre.y + x * Math.sin(rotation) + y * Math.cos(rotation),
    };
  };

  const boardCorners = [
    { x: startDistance, y: 0 },
    { x: startDistance, y: 1 },
    { x: endDistance, y: 1 },
    { x: endDistance, y: 0 },
  ];
  const imageCorners = [place(0, -0.5), place(0, 0.5), place(1, 0.5), place(1, -0.5)];
  const boardToImage = computeHomography(boardCorners, imageCorners);
  if (!boardToImage) throw new Error('degenerate render homography');
  const imageToBoard = invertHomography(boardToImage);
  if (!imageToBoard) throw new Error('degenerate render homography');

  const data = new Uint8ClampedArray(width * height * 4);
  const shade = (value: number) => Math.round(value * o.brightness);

  const stringPositions = [0.08, 0.24, 0.4, 0.56, 0.72, 0.88];
  // Inlays are round in the world, so their board-space radii differ per axis.
  const dotDiameterPx = o.neckWidthPx * 0.14;
  const pxPerDistanceUnit = lengthPx / (endDistance - startDistance);
  const dotRadiusBoard = dotDiameterPx / 2 / pxPerDistanceUnit;
  const dotRadiusAcross = dotDiameterPx / 2 / o.neckWidthPx;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const board = applyHomography(imageToBoard, { x: x + 0.5, y: y + 0.5 });
      let rgb: [number, number, number] = [24, 24, 28];

      const onBoard =
        Number.isFinite(board.x) &&
        board.x >= startDistance &&
        board.x <= endDistance &&
        board.y >= 0 &&
        board.y <= 1;

      if (onBoard) {
        rgb = [70, 46, 30];

        for (let fret = Math.max(1, o.startFret); fret <= o.endFret; fret++) {
          const distance = fretDistance(fret);
          const spacing = distance - fretDistance(fret - 1);
          if (Math.abs(board.x - distance) < spacing * 0.06) rgb = [205, 200, 190];
        }

        if (o.drawDots) {
          for (const fret of DOT_FRETS) {
            if (fret < o.startFret || fret > o.endFret) continue;
            const centreX = dotPosition(fret);
            const acrossPositions = fret === 12 ? [0.28, 0.72] : [0.5];
            for (const acrossCentre of acrossPositions) {
              const dx = (board.x - centreX) / dotRadiusBoard;
              const dy = (board.y - acrossCentre) / dotRadiusAcross;
              if (dx * dx + dy * dy <= 1) rgb = [235, 232, 220];
            }
          }
        }

        for (const across of stringPositions) {
          if (Math.abs(board.y - across) < 0.012) rgb = [178, 178, 182];
        }
      }

      data[index] = shade(rgb[0]);
      data[index + 1] = shade(rgb[1]);
      data[index + 2] = shade(rgb[2]);
      data[index + 3] = 255;
    }
  }

  return { width, height, data, boardToImage, imageToBoard };
}
