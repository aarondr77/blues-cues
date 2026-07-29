import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmark } from './types';

// Served from our own origin; `npm run vendor:assets` puts them there.
const WASM_BASE = '/vendor/mediapipe/wasm';
const MODEL_URL = '/vendor/mediapipe/hand_landmarker.task';

let landmarkerPromise: Promise<HandLandmarker> | null = null;

export function loadHandLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE).then((fileset) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
    );
  }
  return landmarkerPromise;
}

/** Landmarks for every hand in the frame, in MediaPipe's normalised space. */
export function detectHands(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): HandLandmark[][] {
  const result = landmarker.detectForVideo(video, timestampMs);
  return result.landmarks.map((hand) => hand.map((point) => ({ x: point.x, y: point.y, z: point.z })));
}
