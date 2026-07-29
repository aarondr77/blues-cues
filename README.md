# Blues Cues

A Guitar Hero–style browser app for practising single-note blues licks. A note highway scrolls
toward a hit line, the microphone judges pitch and timing, and the webcam reports which pentatonic
box the fretting hand is in.

```
[ Framing calibration ] → [ Latency calibration ] → [ Lick select ] → [ Play ] → [ Results ]
```

No backend, no accounts; the only persisted state is the measured audio latency in `localStorage`.

## Running

```bash
nvm use            # v22.12.0, see .nvmrc
npm install
npm run dev        # http://localhost:5173 (vendors MediaPipe first)
npm test           # vitest
npm run lint       # oxlint
npm run build      # tsc -b && vite build
```

Chrome is the target browser: it needs `AudioWorklet`, `getUserMedia` and WebGL for MediaPipe.

The MediaPipe wasm runtime and hand landmarker model are served from our own origin rather than a
CDN: `npm run vendor:assets` (run automatically before `dev`/`build`/`preview`) copies the wasm out
of `node_modules` and downloads the model into the git-ignored `public/vendor/`, checking it against
a pinned SHA-256. The production build ships a strict `Content-Security-Policy` that only allows
same-origin and `blob:` sources, so any new third-party asset has to be vendored too.

## Architecture

Detection is pure functions over buffers and frames; capture and rendering sit at the edges, so
every detector can be run headlessly against recorded fixtures.

| Module | Entry point | Pure? |
| --- | --- | --- |
| Pitch | `detectPitch(samples, sampleRate)` — `src/audio/pitch.ts` | yes |
| Onsets | `detectOnsets(spectralFrames)` — `src/audio/onsets.ts` | yes |
| Note events | `detectNotes(samples, sampleRate, opts)` — `src/audio/analyze.ts` | yes |
| Octave correction | `src/audio/octave.ts` | yes |
| Latency | `computeLatencyOffset(clicks, onsets)` — `src/audio/latency.ts` | yes |
| Scoring | `scoreAttempt(lick, notes, offsetMs)` — `src/scoring/score.ts` | yes |
| Neck geometry | `estimateNeckGeometry(frame)` — `src/vision/geometry.ts` | yes |
| Box classification | `classifyBox(geometry, landmarks, rootFret, w, h)` — `src/vision/boxes.ts` | yes |
| Framing gate | `checkFraming({ frame, geometry, hands })` — `src/vision/framing.ts` | yes |
| Mic capture | `src/audio/capture.ts` + `public/worklets/capture-worklet.js` | no |
| Camera capture | `src/vision/camera.ts`, `src/vision/handLandmarker.ts` | no |
| Highway | `src/game/highway.ts` (Canvas 2D) | no |

Key numbers: 4096-sample pitch window at hop 1024, 1024/256 for spectral flux, 50 ms onset
refractory, ±50 cents pitch tolerance, ±60/±120/±200 ms timing windows (all widened by 100 ms when
latency calibration is skipped).

## Licks

`src/licks/*.json`, 20 hand-authored single-note licks, regenerated with:

```bash
node scripts/generate-licks.mjs
```

`beat` is in quarter notes from the start of the lick; `string`/`fret` drive the display only —
scoring uses `midi`.

## Fixtures

`fixtures/` holds the recordings the detectors are graded against; see
[fixtures/README.md](fixtures/README.md) for the layout, the label format and the acceptance
thresholds. The fixture tests (`src/test/fixtures.audio.test.ts`, `src/test/fixtures.video.test.ts`)
skip themselves while a category is empty and become hard acceptance gates as soon as recordings
land.

Until then the detectors are exercised by synthetic fixtures — deterministic plucked-string
synthesis (`src/test/synth.ts`, `src/test/lickAudio.ts`) and procedurally rendered fretboards
(`src/test/fretboard.ts`, `src/test/hands.ts`). Those prove the maths, not the microphone: real
recordings are still required before any detection module can be called done.
