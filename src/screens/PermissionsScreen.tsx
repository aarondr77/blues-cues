import { useState } from 'react';
import { audioCapture, cameraCapture } from '../runtime';
import { useAppStore } from '../state/store';

export function PermissionsScreen() {
  const { micReady, cameraReady, setMicReady, setCameraReady, setPhase, skipVision, setError } =
    useAppStore();
  const [busy, setBusy] = useState(false);

  const enableMic = async () => {
    setBusy(true);
    try {
      await audioCapture.start();
      setMicReady(true);
      setError(null);
    } catch (error) {
      setError(`Microphone unavailable: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  };

  const enableCamera = async () => {
    setBusy(true);
    try {
      await cameraCapture.start();
      setCameraReady(true);
      setError(null);
    } catch (error) {
      setError(`Camera unavailable: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h1>Blues Cues</h1>
      <p className="lede">
        Practise blues licks against a scrolling note highway. The microphone judges pitch and
        timing; the camera checks which pentatonic box you played it in.
      </p>

      <ol className="checklist">
        <li className={micReady ? 'pass' : ''}>
          <span>Microphone {micReady ? 'ready' : 'required'}</span>
          <button type="button" onClick={enableMic} disabled={busy || micReady}>
            {micReady ? 'Enabled' : 'Enable microphone'}
          </button>
        </li>
        <li className={cameraReady ? 'pass' : ''}>
          <span>Camera {cameraReady ? 'ready' : 'optional'}</span>
          <button type="button" onClick={enableCamera} disabled={busy || cameraReady}>
            {cameraReady ? 'Enabled' : 'Enable camera'}
          </button>
        </li>
      </ol>

      <div className="actions">
        <button type="button" disabled={!micReady || !cameraReady} onClick={() => setPhase('framing')}>
          Continue to framing
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!micReady}
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
