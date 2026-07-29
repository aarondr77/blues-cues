import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmark } from './types';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let landmarkerPromise: Promise<HandLandmarker> | null = null;

/**
 * Loads the model once. A failed load is not cached, so a later attempt can
 * recover from a dropped network rather than replaying the same rejection.
 */
export function loadHandLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE)
      .then((fileset) =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        }),
      )
      .catch((error: unknown) => {
        landmarkerPromise = null;
        throw new Error(
          `hand tracking model failed to load: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      });
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
