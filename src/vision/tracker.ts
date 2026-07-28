import { estimateNeckGeometry, MAX_REPROJECTION_ERROR_PX, type GeometryOptions } from './geometry';
import type { Frame, NeckGeometry } from './types';

export const RECOMPUTE_INTERVAL_MS = 2000;
/** Frames without a fit before the geometry is dropped and the player prompted. */
export const MAX_MISSES = 30;

export interface TrackerState {
  geometry: NeckGeometry | null;
  /** True on the frame the geometry was dropped, i.e. time to re-prompt. */
  lost: boolean;
  recomputed: boolean;
}

/**
 * Geometry is stable while the player sits still, so it is cached and only
 * refitted every couple of seconds — or immediately when the cached fit stops
 * describing the frame.
 */
export class NeckGeometryTracker {
  private geometry: NeckGeometry | null = null;
  private lastFitMs = -Infinity;
  private misses = 0;
  private readonly options: GeometryOptions;

  constructor(options: GeometryOptions = {}) {
    this.options = options;
  }

  get current(): NeckGeometry | null {
    return this.geometry;
  }

  reset(): void {
    this.geometry = null;
    this.lastFitMs = -Infinity;
    this.misses = 0;
  }

  update(frame: Frame, nowMs: number): TrackerState {
    const stale = nowMs - this.lastFitMs >= RECOMPUTE_INTERVAL_MS;
    const suspect =
      this.geometry != null && this.geometry.reprojectionErrorPx > MAX_REPROJECTION_ERROR_PX;
    if (!stale && !suspect && this.geometry) {
      return { geometry: this.geometry, lost: false, recomputed: false };
    }

    const fitted = estimateNeckGeometry(frame, this.options);
    this.lastFitMs = nowMs;

    if (fitted) {
      this.geometry = fitted;
      this.misses = 0;
      return { geometry: fitted, lost: false, recomputed: true };
    }

    this.misses++;
    if (this.misses >= MAX_MISSES) {
      const wasTracking = this.geometry != null;
      this.geometry = null;
      return { geometry: null, lost: wasTracking, recomputed: true };
    }
    return { geometry: this.geometry, lost: false, recomputed: true };
  }
}
