import { LICKS } from '../licks';
import { lickDurationMs } from '../licks/types';
import { useAppStore } from '../state/store';

export function LickSelectScreen() {
  const { latency, visionEnabled, framingPassed, selectLick, setPhase } = useAppStore();

  return (
    <section className="panel wide">
      <h1>Pick a lick</h1>
      <p className="lede">
        {latency
          ? `Timing calibrated at ${Math.round(latency.offsetMs)} ms.`
          : 'Uncalibrated — timing windows are widened by 100 ms.'}{' '}
        {visionEnabled
          ? framingPassed
            ? 'Box feedback on.'
            : 'Framing not confirmed; box feedback may be unavailable.'
          : 'Audio only.'}
      </p>

      <div className="lick-grid">
        {LICKS.map((lick) => (
          <button
            key={lick.id}
            type="button"
            className="lick-card"
            onClick={() => {
              selectLick(lick.id);
              setPhase('play');
            }}
          >
            <strong>{lick.name}</strong>
            <span>
              Key {lick.key} · box {lick.expectedBox} · {lick.bpm} bpm
            </span>
            <span>
              {lick.notes.length} notes · {(lickDurationMs(lick) / 1000).toFixed(1)}s · difficulty{' '}
              {lick.difficulty}
            </span>
          </button>
        ))}
      </div>

      <div className="actions">
        <button type="button" className="secondary" onClick={() => setPhase('latency')}>
          Recalibrate latency
        </button>
        {visionEnabled && (
          <button type="button" className="secondary" onClick={() => setPhase('framing')}>
            Recheck framing
          </button>
        )}
      </div>
    </section>
  );
}
