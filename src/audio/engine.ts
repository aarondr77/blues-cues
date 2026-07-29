import { detectNotes, notesFromOnsets, type DetectNotesOptions } from './analyze';
import { PITCH_FRAME_SIZE, PITCH_HOP_SIZE } from './frames';
import { computeSpectralFrames, detectOnsets } from './onsets';
import { applyJumpHysteresis } from './octave';
import { detectPitchTrack } from './pitch';
import type { DetectedNote, PitchFrame } from './types';

/** How much audio the live analyser re-examines on each pass. */
const LIVE_WINDOW_MS = 1200;
/** Live detection runs on a timer rather than per hop; this is that period. */
export const LIVE_ANALYSIS_INTERVAL_MS = 120;

export interface LiveState {
  rms: number;
  /** Most recent confident pitch frame, for the debug view. */
  pitch: PitchFrame | null;
  notes: DetectedNote[];
}

/**
 * Buffers the take and runs the same pure detection functions the fixture
 * runner uses — periodically for live feedback, once more at the end for the
 * authoritative score.
 */
export class LiveAnalyzer {
  private readonly buffer: Float32Array;
  private written = 0;
  private startTimeMs: number | null = null;
  private lastAnalysisMs = -Infinity;
  private emitted: DetectedNote[] = [];
  private latestPitch: PitchFrame | null = null;
  private latestRms = 0;
  private droppedSamples = 0;

  private readonly sampleRate: number;

  constructor(sampleRate: number, maxSeconds = 90) {
    this.sampleRate = sampleRate;
    this.buffer = new Float32Array(Math.ceil(sampleRate * maxSeconds));
  }

  reset(): void {
    this.written = 0;
    this.startTimeMs = null;
    this.lastAnalysisMs = -Infinity;
    this.emitted = [];
    this.latestPitch = null;
    this.latestRms = 0;
    this.droppedSamples = 0;
  }

  /** Feeds one hop from the capture worklet. */
  push(samples: Float32Array, startTimeMs: number, rms: number): void {
    if (this.startTimeMs == null) this.startTimeMs = startTimeMs;
    if (this.written + samples.length > this.buffer.length) {
      this.droppedSamples += samples.length;
      return;
    }
    this.buffer.set(samples, this.written);
    this.written += samples.length;
    this.latestRms = rms;
  }

  /** True once the take outgrew the buffer and audio started being dropped. */
  get overflowed(): boolean {
    return this.droppedSamples > 0;
  }

  /** Milliseconds of audio captured so far. */
  get elapsedMs(): number {
    return (this.written / this.sampleRate) * 1000;
  }

  /** Timestamp, in the capture clock, of the first captured sample. */
  get originMs(): number | null {
    return this.startTimeMs;
  }

  get take(): Float32Array {
    return this.buffer.subarray(0, this.written);
  }

  /**
   * Re-analyses the tail of the take and returns any notes not seen before.
   * Notes are timestamped relative to the start of the take.
   */
  poll(nowMs: number, options: DetectNotesOptions = {}): DetectedNote[] {
    if (nowMs - this.lastAnalysisMs < LIVE_ANALYSIS_INTERVAL_MS) return [];
    this.lastAnalysisMs = nowMs;
    if (this.written < PITCH_FRAME_SIZE) return [];

    const windowSamples = Math.min(
      this.written,
      Math.ceil((LIVE_WINDOW_MS / 1000) * this.sampleRate),
    );
    const from = this.written - windowSamples;
    const slice = this.buffer.subarray(from, this.written);
    const offsetMs = (from / this.sampleRate) * 1000;

    const onsets = detectOnsets(computeSpectralFrames(slice, this.sampleRate), options.onsetOptions);
    const pitchFrames = applyJumpHysteresis(
      detectPitchTrack(slice, this.sampleRate, PITCH_FRAME_SIZE, PITCH_HOP_SIZE),
    );
    this.latestPitch =
      [...pitchFrames].reverse().find((frame) => frame.midi != null) ?? this.latestPitch;

    const notes = notesFromOnsets(onsets, pitchFrames, options).map((note) => ({
      ...note,
      timeMs: note.timeMs + offsetMs,
    }));

    const fresh = notes.filter(
      (note) => !this.emitted.some((seen) => Math.abs(seen.timeMs - note.timeMs) < 60),
    );
    this.emitted.push(...fresh);
    return fresh;
  }

  get state(): LiveState {
    return { rms: this.latestRms, pitch: this.latestPitch, notes: this.emitted };
  }

  /** Full-quality pass over the whole take, used for scoring. */
  finish(options: DetectNotesOptions = {}): DetectedNote[] {
    return detectNotes(this.take, this.sampleRate, options);
  }
}
