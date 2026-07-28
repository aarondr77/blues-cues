export interface MetronomeSchedule {
  /** Click times in the AudioContext clock, in milliseconds. */
  clickTimesMs: number[];
  /** When the last click has finished. */
  endsAtMs: number;
}

export const CALIBRATION_CLICKS = 8;
export const CALIBRATION_BPM = 80;

/**
 * Schedules short clicks on the audio clock. Scheduling ahead of time (rather
 * than firing from a timer) is what makes the click times trustworthy enough to
 * measure latency against.
 */
export function scheduleClicks(
  context: AudioContext,
  count = CALIBRATION_CLICKS,
  bpm = CALIBRATION_BPM,
  leadInSeconds = 0.5,
): MetronomeSchedule {
  const intervalSeconds = 60 / bpm;
  const clickTimesMs: number[] = [];

  for (let i = 0; i < count; i++) {
    const at = context.currentTime + leadInSeconds + i * intervalSeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = i === 0 ? 1600 : 1200;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.6, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.06);
    clickTimesMs.push(at * 1000);
  }

  return {
    clickTimesMs,
    endsAtMs: (clickTimesMs[clickTimesMs.length - 1] ?? context.currentTime * 1000) + 1000,
  };
}
