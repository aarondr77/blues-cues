import { describe, expect, it } from 'vitest';
import { classifyBox, MIN_BOX_CONFIDENCE, pickFrettingHand } from './boxes';
import { estimateNeckGeometry } from './geometry';
import { checkFraming } from './framing';
import { NeckGeometryTracker } from './tracker';
import { renderFretboard } from '../test/fretboard';
import { makeHandLandmarks } from '../test/hands';
import type { BoxPosition } from './types';

const ROOT_FRET = 5;

function setup(indexFret: number) {
  const rendered = renderFretboard();
  const geometry = estimateNeckGeometry(rendered);
  if (!geometry) throw new Error('geometry fit failed on the reference render');
  const hand = makeHandLandmarks(rendered.boardToImage, rendered.width, rendered.height, {
    indexFret,
  });
  return { rendered, geometry, hand };
}

describe('classifyBox', () => {
  const cases: [number, BoxPosition][] = [
    [5, 1],
    [9, 3],
    [12, 4],
    [14, 5],
  ];

  it.each(cases)('places a hand at fret %i in box %i', (indexFret, expected) => {
    const { rendered, geometry, hand } = setup(indexFret);
    const estimate = classifyBox(geometry, hand, ROOT_FRET, rendered.width, rendered.height);
    expect(estimate).not.toBeNull();
    expect(estimate!.box).toBe(expected);
  });

  it('reports low confidence between adjacent boxes', () => {
    const { rendered, geometry, hand } = setup(7);
    const estimate = classifyBox(geometry, hand, ROOT_FRET, rendered.width, rendered.height);
    expect(estimate!.confidence).toBeLessThan(MIN_BOX_CONFIDENCE);
  });

  it('picks the hand nearer the headstock as the fretting hand', () => {
    const { rendered, geometry } = setup(5);
    const fretting = makeHandLandmarks(rendered.boardToImage, rendered.width, rendered.height, {
      indexFret: 5,
    });
    const picking = makeHandLandmarks(rendered.boardToImage, rendered.width, rendered.height, {
      indexFret: 19,
    });
    const chosen = pickFrettingHand(geometry, [picking, fretting], rendered.width, rendered.height);
    expect(chosen).toBe(fretting);
  });
});

describe('checkFraming', () => {
  it('passes on a well-framed neck with a hand on it', () => {
    const { rendered, geometry, hand } = setup(5);
    const report = checkFraming({ frame: rendered, geometry, hands: [hand] });
    expect(report.checks.filter((entry) => !entry.passed)).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it.each([
    ['too far away', { neckWidthPx: 30 }, 'fretboard-width'],
    ['a dark room', { brightness: 0.15 }, 'brightness'],
    ['an edge-on neck', { drawDots: false }, 'neck-quad'],
    ['the neck out of frame', { startFret: 9 }, 'fret-range'],
  ] as const)('rejects %s with the right prompt', (_name, options, failingCheck) => {
    const rendered = renderFretboard(options);
    const hand = makeHandLandmarks(rendered.boardToImage, rendered.width, rendered.height, {
      indexFret: 12,
    });
    const report = checkFraming({ frame: rendered, hands: [hand] });
    expect(report.passed).toBe(false);
    expect(report.checks.find((entry) => entry.id === failingCheck)?.passed).toBe(false);
  });

  it('asks for a hand when none is visible', () => {
    const rendered = renderFretboard();
    const report = checkFraming({ frame: rendered, hands: [] });
    const handCheck = report.checks.find((entry) => entry.id === 'hand-landmarks');
    expect(handCheck?.passed).toBe(false);
    expect(handCheck?.prompt).toBe('Put your hand on the neck');
  });
});

describe('NeckGeometryTracker', () => {
  it('caches the fit and refits when it goes stale', () => {
    const rendered = renderFretboard();
    const tracker = new NeckGeometryTracker();

    const first = tracker.update(rendered, 0);
    expect(first.geometry).not.toBeNull();
    expect(first.recomputed).toBe(true);

    expect(tracker.update(rendered, 500).recomputed).toBe(false);
    expect(tracker.update(rendered, 2500).recomputed).toBe(true);
  });

  it('drops the geometry after 30 consecutive failures', () => {
    const blank = { width: 160, height: 120, data: new Uint8ClampedArray(160 * 120 * 4).fill(20) };
    const tracker = new NeckGeometryTracker();
    tracker.update(renderFretboard(), 0);

    let lost = false;
    for (let i = 1; i <= 30; i++) {
      lost = tracker.update(blank, i * 2100).lost || lost;
    }
    expect(lost).toBe(true);
    expect(tracker.current).toBeNull();
  });
});
