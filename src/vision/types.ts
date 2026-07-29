export interface Point {
  x: number;
  y: number;
}

/** Structural stand-in for `ImageData`, so detection runs headlessly in Node. */
export interface Frame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface InlayDot {
  /** Image-space centroid. */
  center: Point;
  /** Fret the dot marks (3, 5, 7, 9, 12, 15, 17, 19, 21). */
  fret: number;
  areaPx: number;
}

/**
 * Fretboard coordinates: `fret` is the continuous fret position measured from
 * the nut (fret 0 is the nut, 5.5 is halfway between the 5th and 6th fret) and
 * `across` runs 0 (high E side) to 1 (low E side).
 */
export interface FretCoord {
  fret: number;
  across: number;
}

export interface NeckGeometry {
  /** Corners of the fretboard in image space: nut-high, nut-low, body-low, body-high. */
  quad: [Point, Point, Point, Point];
  /** Maps image pixels to fretboard coordinates. */
  imageToBoard: number[];
  /** Maps fretboard coordinates back to image pixels. */
  boardToImage: number[];
  dots: InlayDot[];
  /** RMS reprojection error of the inlay dots, in pixels. */
  reprojectionErrorPx: number;
  /** Fretboard width across the strings, in pixels. */
  widthPx: number;
  /** Fret range visible inside the frame. */
  visibleFrets: { min: number; max: number };
}

export type { BoxPosition } from '../theory';

export interface HandLandmark {
  /** Normalised to the frame, 0..1, as MediaPipe reports them. */
  x: number;
  y: number;
  z?: number;
}
