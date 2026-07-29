import { useCallback, useEffect, useRef, useState } from 'react';
import { noteName } from '../audio/notes';
import type { DetectedNote } from '../audio/types';
import { drawHighway, LOOKAHEAD_MS } from '../game/highway';
import { useVision } from '../hooks/useVision';
import { lickById } from '../licks';
import { lickDurationMs } from '../licks/types';
import { audioCapture } from '../runtime';
import { scoreAttempt } from '../scoring/score';
import { useAppStore } from '../state/store';
import type { BoxEstimate } from '../vision/boxes';
import { MIN_BOX_CONFIDENCE } from '../vision/boxes';

/** Bars of count-in before the first note. */
const COUNT_IN_MS = 3000;
/** Extra listening time after the last note, for a late final attack. */
const TAIL_MS = 900;

export function PlayScreen() {
  const { selectedLickId, latency, visionEnabled, finishAttempt, setPhase, setError } =
    useAppStore();
  const lick = selectedLickId ? lickById(selectedLickId) : undefined;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [songTimeMs, setSongTimeMs] = useState(-COUNT_IN_MS);
  const [liveNotes, setLiveNotes] = useState<DetectedNote[]>([]);
  const boxSamples = useRef<BoxEstimate[]>([]);
  const finished = useRef(false);

  const onVisionSample = useCallback((sample: { box: BoxEstimate | null }) => {
    if (sample.box) boxSamples.current.push(sample.box);
  }, []);

  const { modelError, visionError } = useVision({
    enabled: visionEnabled,
    rootFret: lick?.rootFret ?? 5,
    intervalMs: 250,
    onSample: onVisionSample,
  });

  useEffect(() => {
    if (!lick) return;
    const analyzer = audioCapture.analyzer;
    if (!analyzer) {
      // Without an analyser the take can never complete, so the highway would
      // scroll forever with nothing being judged.
      setError('Microphone is not running — enable it to play.');
      setPhase('permissions');
      return;
    }
    analyzer.reset();
    finished.current = false;
    boxSamples.current = [];

    const expectedMidis = lick.notes.map((note) => note.midi);
    const startMs = audioCapture.nowMs + COUNT_IN_MS;
    const endMs = startMs + lickDurationMs(lick) + TAIL_MS;
    let raf = 0;

    const complete = () => {
      if (finished.current) return;
      finished.current = true;
      const origin = analyzer.originMs ?? startMs;
      const detected = analyzer.finish({ expectedMidis });
      const latencyOffset = latency?.offsetMs ?? 0;
      const score = scoreAttempt(lick, detected, startMs - origin + latencyOffset, {
        calibrated: latency != null,
      });

      if (analyzer.overflowed) {
        setError('The take outran the capture buffer — the end of it was not scored.');
      }

      const samples = boxSamples.current;
      const best = samples.length > 0 ? mostCommonBox(samples) : null;
      finishAttempt(score, { estimate: best, expectedBox: lick.expectedBox });
    };

    const tick = () => {
      try {
        const nowMs = audioCapture.nowMs;
        setSongTimeMs(nowMs - startMs);

        const fresh = analyzer.poll(nowMs, { expectedMidis });
        if (fresh.length > 0) setLiveNotes((current) => [...current, ...fresh]);

        if (nowMs >= endMs) {
          complete();
          return;
        }
        raf = requestAnimationFrame(tick);
      } catch (error) {
        // Detection blowing up mid-take must not leave the highway scrolling.
        finished.current = true;
        setError(`Audio detection failed: ${error instanceof Error ? error.message : String(error)}`);
        setPhase('select');
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      finished.current = true;
    };
  }, [lick, latency, finishAttempt, setError, setPhase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !lick) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawHighway(ctx, width, height, { lick, songTimeMs });
  }, [lick, songTimeMs]);

  if (!lick) {
    return (
      <section className="panel">
        <p>No lick selected.</p>
        <button type="button" onClick={() => setPhase('select')}>
          Back
        </button>
      </section>
    );
  }

  const countingIn = songTimeMs < 0;
  const recent = liveNotes.slice(-6);

  return (
    <section className="panel wide play">
      <header className="play-header">
        <div>
          <h1>{lick.name}</h1>
          <span>
            Key {lick.key} · box {lick.expectedBox} · {lick.bpm} bpm
          </span>
        </div>
        <button type="button" className="secondary" onClick={() => setPhase('select')}>
          Stop
        </button>
      </header>

      {(visionError ?? modelError) && (
        <p className="warning">
          Box feedback unavailable ({visionError ?? modelError}). Pitch and timing are still scored.
        </p>
      )}

      <canvas ref={canvasRef} className="highway" />

      <div className="play-footer">
        <span>
          {countingIn
            ? `Count-in ${Math.ceil(-songTimeMs / 1000)}…`
            : `${(songTimeMs / 1000).toFixed(1)}s / ${(lickDurationMs(lick) / 1000).toFixed(1)}s`}
        </span>
        <span className="detected">
          {recent.map((note) => noteName(note.midi)).join(' ') || 'listening…'}
        </span>
        <span>{`lookahead ${LOOKAHEAD_MS / 1000}s`}</span>
      </div>
    </section>
  );
}

function mostCommonBox(samples: BoxEstimate[]): BoxEstimate {
  const confident = samples.filter((sample) => sample.confidence >= MIN_BOX_CONFIDENCE);
  const pool = confident.length > 0 ? confident : samples;
  const counts = new Map<number, BoxEstimate[]>();
  for (const sample of pool) {
    const bucket = counts.get(sample.box) ?? [];
    bucket.push(sample);
    counts.set(sample.box, bucket);
  }
  let best: BoxEstimate[] = [];
  for (const bucket of counts.values()) {
    if (bucket.length > best.length) best = bucket;
  }
  const meanConfidence = best.reduce((sum, item) => sum + item.confidence, 0) / best.length;
  return { ...best[0], confidence: meanConfidence };
}
