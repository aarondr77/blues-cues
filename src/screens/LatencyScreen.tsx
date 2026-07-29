import { useState } from 'react';
import {
  computeLatencyOffset,
  MAX_RELIABLE_OFFSET_MS,
  MAX_RELIABLE_STD_DEV_MS,
  type LatencyResult,
} from '../audio/latency';
import { CALIBRATION_BPM, CALIBRATION_CLICKS, scheduleClicks } from '../audio/metronome';
import { audioCapture } from '../runtime';
import { useAppStore } from '../state/store';

type Status = 'idle' | 'running' | 'done';

export function LatencyScreen() {
  const { latency, setLatency, setPhase, setError, setMicReady } = useAppStore();
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<LatencyResult | null>(null);

  const run = async () => {
    const context = audioCapture.audioContext;
    const analyzer = audioCapture.analyzer;
    if (!context || !analyzer) {
      setError('Microphone is not running — enable it before calibrating.');
      setMicReady(false);
      setPhase('permissions');
      return;
    }

    setStatus('running');
    setError(null);
    try {
      analyzer.reset();
      const schedule = scheduleClicks(context, CALIBRATION_CLICKS, CALIBRATION_BPM);

      const waitMs = schedule.endsAtMs - context.currentTime * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      const origin = analyzer.originMs ?? 0;
      const notes = analyzer.finish();
      const measured = computeLatencyOffset(
        schedule.clickTimesMs,
        notes.map((note) => note.timeMs + origin),
      );
      setResult(measured);
      setLatency(measured);
      setStatus('done');
    } catch (error) {
      // Leaving the status on 'running' would disable every button on this screen.
      setStatus('idle');
      setResult(null);
      setError(`Calibration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <section className="panel">
      <h1>Latency calibration</h1>
      <p className="lede">
        Eight clicks at {CALIBRATION_BPM} bpm. Play any single note on each click. Without this,
        strict timing feels broken.
      </p>

      {status === 'running' && <p className="running">Listening… play along with the clicks.</p>}

      {result && (
        <div className={result.reliable ? 'result' : 'result warning'}>
          <p>
            Measured offset: <strong>{Math.round(result.offsetMs)} ms</strong> (spread ±
            {Math.round(result.stdDevMs)} ms, {result.samples.length} of {CALIBRATION_CLICKS}{' '}
            clicks used)
          </p>
          {!result.reliable && (
            <p>
              {result.samples.length === 0
                ? result.warning
                : `That is above ${MAX_RELIABLE_OFFSET_MS} ms or varies by more than ${MAX_RELIABLE_STD_DEV_MS} ms, so timing scores will be unreliable. Close other audio applications and try again.`}
            </p>
          )}
        </div>
      )}

      {!result && latency && (
        <p className="result">
          Stored offset from a previous session: <strong>{Math.round(latency.offsetMs)} ms</strong>
        </p>
      )}

      <div className="actions">
        <button type="button" onClick={run} disabled={status === 'running'}>
          {status === 'idle' ? 'Start calibration' : 'Run again'}
        </button>
        <button type="button" onClick={() => setPhase('select')} disabled={status === 'running'}>
          Continue
        </button>
        <button
          type="button"
          className="secondary"
          disabled={status === 'running'}
          onClick={() => {
            setLatency(null);
            setPhase('select');
          }}
        >
          Skip — score uncalibrated
        </button>
      </div>
    </section>
  );
}
