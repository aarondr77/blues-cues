import { noteName } from '../audio/notes';
import { lickById } from '../licks';
import { useAppStore } from '../state/store';
import { MIN_BOX_CONFIDENCE } from '../vision/boxes';

export function ResultsScreen() {
  const { score, boxVerdict, selectedLickId, setPhase } = useAppStore();
  const lick = selectedLickId ? lickById(selectedLickId) : undefined;

  if (!score || !lick) {
    return (
      <section className="panel">
        <p>No attempt to show.</p>
        <button type="button" onClick={() => setPhase('select')}>
          Pick a lick
        </button>
      </section>
    );
  }

  const correct = score.judgments.filter((judgment) => judgment.judgment !== 'miss').length;

  return (
    <section className="panel wide">
      <h1>{lick.name}</h1>
      <p className="score-line">
        <strong>{Math.round(score.percentage)}%</strong> · {correct}/{score.judgments.length} notes
        hit
        {score.extraNotes > 0 && ` · ${score.extraNotes} extra attacks`}
        {!score.calibrated && ' · uncalibrated'}
      </p>

      <p className="box-verdict">{boxVerdictText(boxVerdict, lick.expectedBox, correct, score.judgments.length)}</p>

      <table className="judgments">
        <thead>
          <tr>
            <th>#</th>
            <th>Note</th>
            <th>Judgment</th>
            <th>Timing</th>
            <th>Pitch</th>
          </tr>
        </thead>
        <tbody>
          {score.judgments.map((judgment) => (
            <tr key={judgment.noteIndex} className={judgment.judgment}>
              <td>{judgment.noteIndex + 1}</td>
              <td>{noteName(judgment.expectedMidi)}</td>
              <td>{judgment.judgment}</td>
              <td>{judgment.errorMs == null ? '—' : `${Math.round(judgment.errorMs)} ms`}</td>
              <td>{judgment.centsOff == null ? '—' : `${Math.round(judgment.centsOff)} cents`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="actions">
        <button type="button" onClick={() => setPhase('play')}>
          Try again
        </button>
        <button type="button" className="secondary" onClick={() => setPhase('select')}>
          Pick another lick
        </button>
      </div>
    </section>
  );
}

function boxVerdictText(
  verdict: { estimate: { box: number; confidence: number } | null } | null,
  expectedBox: number,
  correct: number,
  total: number,
): string {
  if (!verdict?.estimate) return 'Box position: not measured this take.';
  const { box, confidence } = verdict.estimate;
  if (confidence < MIN_BOX_CONFIDENCE) {
    return 'Box position: too ambiguous to call — somewhere between two boxes.';
  }
  if (box === expectedBox) return `Played in box ${box}, as intended.`;
  return `All ${correct} of ${total} notes aside, you played this in box ${box} — it is meant for box ${expectedBox}.`;
}
