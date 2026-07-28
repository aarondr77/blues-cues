import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { decodeWav } from './wav';
import type { Judgment } from '../scoring/score';

export const FIXTURES_ROOT = resolve(import.meta.dirname, '../../fixtures');

export interface AudioLabels {
  /** Required for anything scored; optional for pure detection fixtures. */
  lickId?: string;
  /** Attacks present in the recording, in order. */
  notes: { timeMs: number; midi: number }[];
  /** Latency to subtract when scoring, if the take was recorded with a known one. */
  offsetMs?: number;
  /** Hand-labelled expected judgment per lick note, for scored categories. */
  judgments?: Judgment[];
  /** Expected extra-attack count, for scored categories. */
  extraNotes?: number;
}

export interface AudioFixture {
  name: string;
  category: string;
  path: string;
  labels: AudioLabels | null;
  sampleRate: number;
  samples: Float32Array;
}

export interface VideoFixture {
  name: string;
  category: string;
  /** Directory of extracted PNG/JPEG frames, or the raw clip if not extracted. */
  path: string;
  labels: VideoLabels | null;
}

export interface VideoLabels {
  /** Expected box for framing-good clips. */
  box?: number;
  /** Framing check that must fail, for framing-bad clips. */
  failingCheck?: string;
  lickId?: string;
  rootFret?: number;
}

function readLabels<T>(wavPath: string): T | null {
  const jsonPath = wavPath.replace(/\.[^.]+$/, '.json');
  if (!existsSync(jsonPath)) return null;
  return JSON.parse(readFileSync(jsonPath, 'utf8')) as T;
}

export function listAudioFixtures(category: string): AudioFixture[] {
  const dir = join(FIXTURES_ROOT, 'audio', category);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => extname(file).toLowerCase() === '.wav')
    .sort()
    .map((file) => {
      const path = join(dir, file);
      const buffer = readFileSync(path);
      const decoded = decodeWav(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      );
      return {
        name: basename(file, '.wav'),
        category,
        path,
        labels: readLabels<AudioLabels>(path),
        sampleRate: decoded.sampleRate,
        samples: decoded.samples,
      };
    });
}

export function listVideoFixtures(category: string): VideoFixture[] {
  const dir = join(FIXTURES_ROOT, 'video', category);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || /\.(mp4|mov|webm)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const path = join(dir, entry.name);
      return {
        name: entry.name.replace(/\.[^.]+$/, ''),
        category,
        path,
        labels: readLabels<VideoLabels>(path),
      };
    });
}

/** Greedy nearest matching of detected times to labelled times. */
export function matchTimes(expectedMs: number[], detectedMs: number[], toleranceMs: number) {
  const remaining = [...detectedMs];
  let matched = 0;
  let worstErrorMs = 0;
  for (const expected of expectedMs) {
    let bestIndex = -1;
    let bestError = Infinity;
    remaining.forEach((time, i) => {
      const error = Math.abs(time - expected);
      if (error < bestError) {
        bestError = error;
        bestIndex = i;
      }
    });
    if (bestIndex >= 0 && bestError <= toleranceMs) {
      matched++;
      worstErrorMs = Math.max(worstErrorMs, bestError);
      remaining.splice(bestIndex, 1);
    }
  }
  return { matched, worstErrorMs, extra: remaining.length };
}
