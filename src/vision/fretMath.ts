/** Inlay dots on a standard neck. The pair at 12 is the unambiguous anchor. */
export const DOT_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
export const DOUBLE_DOT_FRET = 12;

/** Distance of fret `n` from the nut, in scale lengths. */
export function fretDistance(n: number): number {
  return 1 - Math.pow(2, -n / 12);
}

/** Continuous fret number at a distance from the nut, in scale lengths. */
export function distanceToFret(distance: number): number {
  if (distance >= 1) return Infinity;
  return -12 * Math.log2(1 - distance);
}

/** Dots sit between frets, so dot `n` is centred between frets n-1 and n. */
export function dotPosition(fret: number): number {
  return (fretDistance(fret - 1) + fretDistance(fret)) / 2;
}
