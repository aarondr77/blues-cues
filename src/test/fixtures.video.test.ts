import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { classifyBox } from '../vision/boxes';
import { checkFraming, firstFailure } from '../vision/framing';
import { estimateNeckGeometry } from '../vision/geometry';
import { NeckGeometryTracker } from '../vision/tracker';
import type { Frame } from '../vision/types';
import { listVideoFixtures, type VideoFixture } from './fixtures';

/**
 * Acceptance tests for §6. Clips are read as extracted PNG frames, since Node
 * cannot decode mp4; see fixtures/README.md. Skipped until the clips land.
 */
const framingGood = listVideoFixtures('framing-good');
const framingBad = listVideoFixtures('framing-bad');
const drift = listVideoFixtures('drift');

function loadFrames(fixture: VideoFixture): Frame[] {
  if (!existsSync(fixture.path) || !statSync(fixture.path).isDirectory()) {
    throw new Error(
      `${fixture.path}: extract frames first, e.g. ffmpeg -i clip.mp4 -vf fps=10 clip/%04d.png`,
    );
  }
  return readdirSync(fixture.path)
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .sort()
    .map((file) => {
      const png = PNG.sync.read(readFileSync(join(fixture.path, file)));
      return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
    });
}

describe.skipIf(framingGood.length === 0)('fixtures: framing-good', () => {
  it('classifies the right box on at least 80% of frames', () => {
    for (const fixture of framingGood) {
      const labels = fixture.labels;
      if (labels?.box == null) throw new Error(`${fixture.path}: label the expected box`);
      const rootFret = labels.rootFret ?? 5;

      const frames = loadFrames(fixture);
      const tracker = new NeckGeometryTracker();
      let correct = 0;
      let classified = 0;

      frames.forEach((frame, index) => {
        const geometry = tracker.update(frame, index * 100).geometry;
        if (!geometry) return;
        // Hand landmarks come from MediaPipe in the browser; fixtures carry
        // them alongside the frames when available.
        const handsPath = join(fixture.path, 'hands.json');
        if (!existsSync(handsPath)) return;
        const hands = JSON.parse(readFileSync(handsPath, 'utf8')) as Record<string, number[][]>;
        const hand = hands[String(index)];
        if (!hand) return;
        const estimate = classifyBox(
          geometry,
          hand.map(([x, y]) => ({ x, y })),
          rootFret,
          frame.width,
          frame.height,
        );
        if (!estimate) return;
        classified++;
        if (estimate.box === labels.box) correct++;
      });

      expect(classified, `${fixture.name}: no frames classified`).toBeGreaterThan(0);
      expect(correct / classified, fixture.name).toBeGreaterThanOrEqual(0.8);
    }
  });
});

describe.skipIf(framingBad.length === 0)('fixtures: framing-bad', () => {
  it('rejects each clip with the labelled check', () => {
    for (const fixture of framingBad) {
      const expectedFailure = fixture.labels?.failingCheck;
      if (!expectedFailure) throw new Error(`${fixture.path}: label the failing check`);

      const frame = loadFrames(fixture)[0];
      const report = checkFraming({ frame });
      expect(report.passed, fixture.name).toBe(false);
      expect(
        report.checks.find((check) => check.id === expectedFailure)?.passed,
        `${fixture.name}: expected ${expectedFailure} to fail, first failure was ${firstFailure(report)?.id}`,
      ).toBe(false);
    }
  });
});

describe.skipIf(drift.length === 0)('fixtures: drift', () => {
  it('refits the geometry after the player moves', () => {
    for (const fixture of drift) {
      const frames = loadFrames(fixture);
      const first = estimateNeckGeometry(frames[0]);
      const last = estimateNeckGeometry(frames[frames.length - 1]);
      expect(first, `${fixture.name}: no fit at the start`).not.toBeNull();
      expect(last, `${fixture.name}: no fit after the drift`).not.toBeNull();
      expect(last!.reprojectionErrorPx).toBeLessThan(12);
    }
  });
});
