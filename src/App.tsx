import { FramingScreen } from './screens/FramingScreen';
import { LatencyScreen } from './screens/LatencyScreen';
import { LickSelectScreen } from './screens/LickSelectScreen';
import { PermissionsScreen } from './screens/PermissionsScreen';
import { PlayScreen } from './screens/PlayScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { useAppStore } from './state/store';
import './App.css';

const SCREENS = {
  permissions: PermissionsScreen,
  framing: FramingScreen,
  latency: LatencyScreen,
  select: LickSelectScreen,
  play: PlayScreen,
  results: ResultsScreen,
};

export default function App() {
  const { phase, error, setError } = useAppStore();
  const Screen = SCREENS[phase];

  return (
    <main className="app">
      {error && (
        <p className="error">
          {error}{' '}
          <button type="button" className="secondary" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
      <Screen />
    </main>
  );
}
