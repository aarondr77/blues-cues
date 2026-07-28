import { beatToMs, type Lick } from '../licks/types';
import type { Judgment } from '../scoring/score';

export const LANE_COUNT = 6;
/** Vertical speed of the highway. */
export const PIXELS_PER_MS = 0.28;
/** Notes appear this far ahead of the hit line. */
export const LOOKAHEAD_MS = 2600;

const JUDGMENT_COLORS: Record<Judgment, string> = {
  perfect: '#4ade80',
  good: '#a3e635',
  early: '#fbbf24',
  late: '#fb923c',
  miss: '#f87171',
};

const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

export interface HighwayFrame {
  lick: Lick;
  /** Time since the lick started, in milliseconds. Negative during the count-in. */
  songTimeMs: number;
  judgments?: (Judgment | null)[];
  /** Attack times already detected, for the hit-line flash. */
  hitTimesMs?: number[];
}

export function drawHighway(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: HighwayFrame,
): void {
  const hitLineY = height - 90;
  const laneWidth = width / LANE_COUNT;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#1c2333';
  ctx.lineWidth = 1;
  for (let lane = 1; lane < LANE_COUNT; lane++) {
    ctx.beginPath();
    ctx.moveTo(lane * laneWidth, 0);
    ctx.lineTo(lane * laneWidth, height);
    ctx.stroke();
  }

  // Beat lines give the eye something to lock onto between notes.
  const beatMs = 60_000 / frame.lick.bpm;
  const firstBeat = Math.floor((frame.songTimeMs - 400) / beatMs);
  for (let beat = Math.max(0, firstBeat); beatToMs(beat, frame.lick.bpm) < frame.songTimeMs + LOOKAHEAD_MS; beat++) {
    const y = hitLineY - (beat * beatMs - frame.songTimeMs) * PIXELS_PER_MS;
    if (y < -20 || y > height) continue;
    ctx.strokeStyle = beat % 4 === 0 ? '#2b3550' : '#171d2b';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  frame.lick.notes.forEach((note, index) => {
    const noteMs = beatToMs(note.beat, frame.lick.bpm);
    const y = hitLineY - (noteMs - frame.songTimeMs) * PIXELS_PER_MS;
    if (y < -60 || y > height + 60) return;

    const lane = Math.min(LANE_COUNT - 1, Math.max(0, note.string - 1));
    const x = lane * laneWidth + laneWidth / 2;
    const judgment = frame.judgments?.[index] ?? null;
    const lengthPx = Math.max(24, beatToMs(note.duration, frame.lick.bpm) * PIXELS_PER_MS);

    ctx.fillStyle = judgment ? JUDGMENT_COLORS[judgment] : '#38bdf8';
    ctx.globalAlpha = judgment === 'miss' ? 0.45 : 1;
    roundedRect(ctx, x - laneWidth * 0.36, y - lengthPx, laneWidth * 0.72, lengthPx, 8);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#0b0e14';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(note.fret), x, y - lengthPx / 2);
  });

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, hitLineY);
  ctx.lineTo(width, hitLineY);
  ctx.stroke();

  for (const hit of frame.hitTimesMs ?? []) {
    const age = frame.songTimeMs - hit;
    if (age < 0 || age > 220) continue;
    ctx.globalAlpha = 1 - age / 220;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, hitLineY - 4, width, 8);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = '#64748b';
  ctx.font = '13px system-ui, sans-serif';
  STRING_LABELS.forEach((label, lane) => {
    ctx.fillText(label, lane * laneWidth + laneWidth / 2, height - 40);
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
