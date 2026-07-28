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

/**
 * Runs the vision pipeline off the render loop and hands back the latest
 * framing report and box estimate.
 */
export function useVision({ enabled, rootFret = 5, intervalMs = 200, onSample }: UseVisionOptions) {
  const [sample, setSample] = useState<VisionSample | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
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
        if (!cancelled) setModelError(error instanceof Error ? error.message : String(error));
      });

    const timer = window.setInterval(() => {
      const frame = cameraCapture.grab();
      if (!frame) return;

      const nowMs = performance.now();
      const geometry = trackerRef.current.update(frame, nowMs).geometry;

      let hands: HandLandmark[][] = [];
      if (landmarkerRef.current) {
        try {
          hands = detectHands(landmarkerRef.current, cameraCapture.video, nowMs);
        } catch {
          hands = [];
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
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, rootFret, intervalMs]);

  return { sample, modelError, tracker: trackerRef.current };
}
