import { AudioCapture } from './audio/capture';
import { useAppStore } from './state/store';
import { CameraCapture } from './vision/camera';

/** One microphone and one camera for the whole app. */
export const audioCapture = new AudioCapture({
  onError: (error) => {
    console.error('[audio capture]', error);
    useAppStore.getState().setError(`Microphone capture failed: ${error.message}`);
  },
});
export const cameraCapture = new CameraCapture();
