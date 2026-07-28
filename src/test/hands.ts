import { fretDistance } from '../vision/fretMath';
import { applyHomography } from '../vision/homography';
import type { HandLandmark } from '../vision/types';

export interface SyntheticHandOptions {
  /** Fret the index-finger knuckle sits over. */
  indexFret: number;
  /** Frets the knuckle row spans. */
  spanFrets?: number;
  /** Across-neck position of the knuckle row; hands sit behind the neck. */
  across?: number;
}

/**
 * A 21-landmark hand in MediaPipe's normalised coordinates, placed over the
 * neck of a rendered fretboard.
 */
export function makeHandLandmarks(
  boardToImage: number[],
  frameWidth: number,
  frameHeight: number,
  options: SyntheticHandOptions,
): HandLandmark[] {
  const span = options.spanFrets ?? 3;
  const across = options.across ?? 0.2;

  const at = (fret: number, acrossPosition: number): HandLandmark => {
    const image = applyHomography(boardToImage, {
      x: fretDistance(fret),
      y: acrossPosition,
    });
    return { x: image.x / frameWidth, y: image.y / frameHeight, z: 0 };
  };

  const landmarks: HandLandmark[] = new Array(21);
  // Wrist and thumb sit behind the neck, off the knuckle row.
  landmarks[0] = at(options.indexFret + span / 2, across - 0.35);
  landmarks[1] = at(options.indexFret, across - 0.25);
  landmarks[2] = at(options.indexFret - 0.3, across - 0.15);
  landmarks[3] = at(options.indexFret - 0.5, across - 0.05);
  landmarks[4] = at(options.indexFret - 0.7, across);

  const fingers: [number, number][] = [
    [5, 0],
    [9, 1],
    [13, 2],
    [17, 3],
  ];
  for (const [mcp, offset] of fingers) {
    const fret = options.indexFret + (span * offset) / 3;
    landmarks[mcp] = at(fret, across);
    landmarks[mcp + 1] = at(fret, across + 0.18);
    landmarks[mcp + 2] = at(fret, across + 0.34);
    landmarks[mcp + 3] = at(fret, across + 0.46);
  }

  return landmarks;
}
