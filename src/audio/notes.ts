export const A4_HZ = 440;
export const A4_MIDI = 69;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function hzToMidiFloat(hz: number): number {
  return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
}

export function midiToHz(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Signed distance in cents from `hz` to the nearest tuning of `midi`. */
export function centsOff(hz: number, midi: number): number {
  return 1200 * Math.log2(hz / midiToHz(midi));
}

export function noteName(midi: number): string {
  const rounded = Math.round(midi);
  return `${NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}
