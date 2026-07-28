export interface PitchFrame {
  /** Frame start time in milliseconds, relative to the start of the buffer. */
  timeMs: number;
  /** Detected fundamental in Hz, or 0 when nothing usable was found. */
  hz: number;
  /** McLeod clarity, 0..1. */
  clarity: number;
  /** Fractional MIDI number, or null when `hz` is unusable. */
  midi: number | null;
  /** RMS of the analysis window. */
  rms: number;
}

export interface SpectralFrame {
  /** Frame start time in milliseconds, relative to the start of the buffer. */
  timeMs: number;
  magnitudes: Float32Array;
}

export interface Onset {
  timeMs: number;
  /** Spectral flux value at the peak, relative to the adaptive threshold. */
  strength: number;
}

export interface DetectedNote {
  timeMs: number;
  midi: number;
  hz: number;
  clarity: number;
}
