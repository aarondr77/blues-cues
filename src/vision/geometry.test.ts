import { describe, expect, it } from 'vitest';
import { estimateNeckGeometry, fretAt } from './geometry';
import { applyHomography } from './homography';
import { dotPosition } from './fretMath';
import { renderFretboard } from '../test/fretboard';

describe('estimateNeckGeometry', () => {
  it('recovers fret positions from a well-framed neck', () => {
    const rendered = renderFretboard();
    const geometry = estimateNeckGeometry(rendered);
    expect(geometry).not.toBeNull();

    const dots = geometry!.dots.map((dot) => dot.fret).sort((a, b) => a - b);
    expect(dots).toContain(12);
    expect(dots.length).toBeGreaterThanOrEqual(4);

    for (const fret of [3, 5, 7, 9, 12]) {
      const truth = applyHomography(rendered.boardToImage, { x: dotPosition(fret), y: 0.5 });
      const recovered = fretAt(geometry!, truth);
      expect(recovered, `fret ${fret}`).not.toBeNull();
      // Dots sit between frets, so the dot for fret n reads a shade under n.
      expect(Math.abs((recovered as number) - (fret - 0.5))).toBeLessThan(0.75);
    }
  });

  it('handles a rotated, tapered neck', () => {
    const rendered = renderFretboard({ rotationDeg: -12, taper: 0.7 });
    const geometry = estimateNeckGeometry(rendered);
    expect(geometry).not.toBeNull();

    const truth = applyHomography(rendered.boardToImage, { x: dotPosition(7), y: 0.5 });
    expect(Math.abs((fretAt(geometry!, truth) as number) - 6.5)).toBeLessThan(1);
  });

  it('returns null when the neck is edge-on and no inlays are visible', () => {
    expect(estimateNeckGeometry(renderFretboard({ drawDots: false }))).toBeNull();
  });

  it('returns null on an empty frame', () => {
    const blank = {
      width: 320,
      height: 180,
      data: new Uint8ClampedArray(320 * 180 * 4).fill(20),
    };
    expect(estimateNeckGeometry(blank)).toBeNull();
  });
});
