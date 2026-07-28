import { useEffect, useRef } from 'react';
import { useVision } from '../hooks/useVision';
import { cameraCapture } from '../runtime';
import { useAppStore } from '../state/store';
import { firstFailure } from '../vision/framing';

export function FramingScreen() {
  const { setPhase, setFramingPassed, skipVision } = useAppStore();
  const videoRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const { sample, modelError } = useVision({ enabled: true, intervalMs: 200 });

  useEffect(() => {
    const host = videoRef.current;
    if (!host) return;
    const video = cameraCapture.video;
    video.className = 'preview';
    host.appendChild(video);
    return () => {
      if (video.parentElement === host) host.removeChild(video);
    };
  }, []);

  useEffect(() => {
    const canvas = overlayRef.current;
    const geometry = sample?.report.geometry;
    const frame = sample?.frame;
    if (!canvas || !frame) return;
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!geometry) return;

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    geometry.quad.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    for (const dot of geometry.dots) {
      ctx.beginPath();
      ctx.arc(dot.center.x, dot.center.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [sample]);

  const report = sample?.report;
  const failure = report ? firstFailure(report) : null;
  const passed = report?.passed ?? false;

  useEffect(() => {
    setFramingPassed(passed);
  }, [passed, setFramingPassed]);

  return (
    <section className="panel">
      <h1>Framing calibration</h1>
      <p className="lede">
        {failure ? failure.prompt : 'Framing looks good — hold that position.'}
      </p>

      <div className="preview-wrap" ref={videoRef}>
        <canvas ref={overlayRef} className="overlay" />
      </div>

      <ul className="checklist">
        {(report?.checks ?? []).map((check) => (
          <li key={check.id} className={check.passed ? 'pass' : 'fail'}>
            <span>{check.label}</span>
            <span>{check.passed ? 'ok' : check.prompt}</span>
          </li>
        ))}
      </ul>

      {modelError && (
        <p className="warning">
          Hand tracking failed to load ({modelError}). You can still play audio-only.
        </p>
      )}

      <div className="actions">
        <button type="button" disabled={!passed} onClick={() => setPhase('latency')}>
          Continue
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            skipVision();
            setPhase('latency');
          }}
        >
          Skip — audio only
        </button>
      </div>
    </section>
  );
}
