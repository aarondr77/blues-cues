import { useEffect, useRef, useState } from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { cameraCapture } from '../runtime';
import { classifyBox, pickFrettingHand, type BoxEstimate } from '../vision/boxes';
import { checkFraming, type FramingReport } from '../vision/framing';
import { detectHands, loadHandLandmarker } from '../vision/handLandmarker';
import { NeckGeometryTracker } from '../vision/tracker';
import type { Frame, HandLandmark } from '../vision/types';

export interface VisionSample {
  report: FramingReport;
  hands: HandLandmark[][];
  frame: Frame;
  box: BoxEstimate | null;
}

export interface UseVisionOptions {
  enabled: boolean;
  rootFret?: number;
  /** Vision runs far slower than the highway; every third frame is plenty. */
  intervalMs?: number;
  onSample?: (sample: VisionSample) => void;
}

/** Consecutive detector failures tolerated before hand tracking is given up on. */
const MAX_DETECT_FAILURES = 5;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the vision pipeline off the render loop and hands back the latest
 * framing report and box estimate.
 */
export function useVision({ enabled, rootFret = 5, intervalMs = 200, onSample }: UseVisionOptions) {
  const [sample, setSample] = useState<VisionSample | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [visionError, setVisionError] = useState<string | null>(null);
  const trackerRef = useRef(new NeckGeometryTracker());
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    loadHandLandmarker()
      .then((landmarker) => {
        if (!cancelled) landmarkerRef.current = landmarker;
      })
      .catch((error: unknown) => {
        if (!cancelled) setModelError(message(error));
      });

    let detectFailures = 0;

    const timer = window.setInterval(() => {
      try {
        const frame = cameraCapture.grab();
        if (!frame) return;

        const nowMs = performance.now();
        const geometry = trackerRef.current.update(frame, nowMs).geometry;

        let hands: HandLandmark[][] = [];
        if (landmarkerRef.current) {
          try {
            hands = detectHands(landmarkerRef.current, cameraCapture.video, nowMs);
            detectFailures = 0;
          } catch (error) {
            hands = [];
            detectFailures += 1;
            console.warn('[vision] hand detection failed', error);
            // A frame the detector chokes on is survivable; a detector that keeps
            // throwing is not, and pretending no hands are in view hides that.
            if (detectFailures >= MAX_DETECT_FAILURES) {
              landmarkerRef.current = null;
              setVisionError(`Hand tracking stopped after repeated failures: ${message(error)}`);
            }
          }
        }

        const report = checkFraming({ frame, geometry, hands });
        let box: BoxEstimate | null = null;
        if (geometry && hands.length > 0) {
          const fretting = pickFrettingHand(geometry, hands, frame.width, frame.height);
          if (fretting) {
            box = classifyBox(geometry, fretting, rootFret, frame.width, frame.height);
          }
        }

        const next = { report, hands, frame, box };
        setSample(next);
        onSampleRef.current?.(next);
      } catch (error) {
        // Without this the loop would rethrow on every tick into a console nobody reads.
        window.clearInterval(timer);
        console.error('[vision] pipeline stopped', error);
        setVisionError(`Camera analysis stopped: ${message(error)}`);
      }
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, rootFret, intervalMs]);

  return { sample, modelError, visionError, tracker: trackerRef.current };
}
