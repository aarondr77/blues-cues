import { describe, expect, it } from 'vitest';
import { LANE_COUNT, LOOKAHEAD_MS, PIXELS_PER_MS, drawHighway } from './highway';
import type { HighwayFrame } from './highway';
import type { Lick } from '../licks/types';

interface Call {
  method: string;
  args: number[];
}

/**
 * Records the 2D-canvas calls drawHighway makes so we can assert on the drawing
 * without a real browser canvas. Only the members drawHighway touches are
 * implemented.
 */
function createRecordingContext(): {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
  texts: { text: string; x: number; y: number }[];
} {
  const calls: Call[] = [];
  const texts: { text: string; x: number; y: number }[] = [];
  const record =
    (method: string) =>
    (...args: number[]) => {
      calls.push({ method, args });
    };

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arcTo: record('arcTo'),
    closePath: record('closePath'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, x, y });
    },
  };

  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}

function makeLick(overrides: Partial<Lick> = {}): Lick {
  return {
    id: 'test-lick',
    name: 'Test Lick',
    key: 'A',
    rootFret: 5,
    expectedBox: 1,
    bpm: 120,
    difficulty: 1,
    notes: [
      { midi: 60, string: 1, fret: 3, beat: 0, duration: 1 },
      { midi: 62, string: 3, fret: 5, beat: 1, duration: 1 },
      { midi: 64, string: 6, fret: 7, beat: 2, duration: 0.5 },
    ],
    ...overrides,
  };
}

const WIDTH = 360;
const HEIGHT = 640;

describe('drawHighway', () => {
  it('clears and paints the background first', () => {
    const { ctx, calls } = createRecordingContext();
    drawHighway(ctx, WIDTH, HEIGHT, { lick: makeLick(), songTimeMs: 0 });

    expect(calls[0]).toEqual({ method: 'clearRect', args: [0, 0, WIDTH, HEIGHT] });
    expect(calls[1]).toEqual({ method: 'fillRect', args: [0, 0, WIDTH, HEIGHT] });
  });

  it('draws the lane dividers between the lanes', () => {
    const { ctx, calls } = createRecordingContext();
    drawHighway(ctx, WIDTH, HEIGHT, { lick: makeLick(), songTimeMs: 0 });

    const laneWidth = WIDTH / LANE_COUNT;
    const dividerXs = calls
      .filter((c) => c.method === 'moveTo' && c.args[1] === 0)
      .map((c) => c.args[0]);
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      expect(dividerXs).toContain(lane * laneWidth);
    }
  });

  it('renders the string labels along the bottom', () => {
    const { ctx, texts } = createRecordingContext();
    drawHighway(ctx, WIDTH, HEIGHT, { lick: makeLick(), songTimeMs: 0 });

    const labels = texts.filter((t) => t.y === HEIGHT - 40).map((t) => t.text);
    expect(labels).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
  });

  it('draws fret numbers for notes that are on screen', () => {
    const { ctx, texts } = createRecordingContext();
    drawHighway(ctx, WIDTH, HEIGHT, { lick: makeLick(), songTimeMs: 0 });

    const fretLabels = texts.map((t) => t.text);
    expect(fretLabels).toContain('3');
    expect(fretLabels).toContain('5');
    expect(fretLabels).toContain('7');
  });

  it('skips notes that are far off screen', () => {
    const { ctx, texts } = createRecordingContext();
    // Notes at beats 0-2 are well beyond the lookahead window at this song time.
    drawHighway(ctx, WIDTH, HEIGHT, {
      lick: makeLick(),
      songTimeMs: -(LOOKAHEAD_MS + 5000),
    });

    const fretLabels = texts.filter((t) => ['3', '5', '7'].includes(t.text));
    expect(fretLabels.length).toBe(0);
  });

  it('positions a note relative to the hit line and its lane', () => {
    const { ctx, texts } = createRecordingContext();
    const lick = makeLick({
      notes: [{ midi: 60, string: 2, fret: 9, beat: 1, duration: 1 }],
    });
    const songTimeMs = 200;
    drawHighway(ctx, WIDTH, HEIGHT, { lick, songTimeMs });

    const laneWidth = WIDTH / LANE_COUNT;
    const noteMs = (1 * 60_000) / lick.bpm;
    const hitLineY = HEIGHT - 90;
    const expectedY = hitLineY - (noteMs - songTimeMs) * PIXELS_PER_MS;
    const expectedX = 1 * laneWidth + laneWidth / 2; // string 2 -> lane index 1

    const label = texts.find((t) => t.text === '9');
    expect(label).toBeDefined();
    expect(label!.x).toBeCloseTo(expectedX, 6);
    // The label sits half a note-length above y; just check it tracks y direction.
    expect(label!.y).toBeLessThan(expectedY);
  });

  it('clamps notes on out-of-range strings into valid lanes', () => {
    const { ctx, texts } = createRecordingContext();
    const lick = makeLick({
      notes: [
        { midi: 60, string: 0, fret: 1, beat: 0, duration: 1 },
        { midi: 62, string: 99, fret: 2, beat: 0.5, duration: 1 },
      ],
    });
    drawHighway(ctx, WIDTH, HEIGHT, { lick, songTimeMs: 0 });

    const laneWidth = WIDTH / LANE_COUNT;
    const low = texts.find((t) => t.text === '1');
    const high = texts.find((t) => t.text === '2');
    expect(low!.x).toBeCloseTo(laneWidth / 2, 6);
    expect(high!.x).toBeCloseTo((LANE_COUNT - 1) * laneWidth + laneWidth / 2, 6);
  });

  it('flashes the hit line for recent attacks only', () => {
    const withRecentHit = createRecordingContext();
    const frame: HighwayFrame = {
      lick: makeLick(),
      songTimeMs: 500,
      hitTimesMs: [400], // age 100ms, within the 220ms window
    };
    drawHighway(withRecentHit.ctx, WIDTH, HEIGHT, frame);
    const hitLineY = HEIGHT - 90;
    const flashRects = withRecentHit.calls.filter(
      (c) => c.method === 'fillRect' && c.args[1] === hitLineY - 4 && c.args[3] === 8,
    );
    expect(flashRects.length).toBe(1);

    const withStaleHit = createRecordingContext();
    drawHighway(withStaleHit.ctx, WIDTH, HEIGHT, {
      lick: makeLick(),
      songTimeMs: 1000,
      hitTimesMs: [400], // age 600ms, outside the window
    });
    const staleFlashes = withStaleHit.calls.filter(
      (c) => c.method === 'fillRect' && c.args[1] === hitLineY - 4 && c.args[3] === 8,
    );
    expect(staleFlashes.length).toBe(0);
  });
});
