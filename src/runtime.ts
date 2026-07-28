import { AudioCapture } from './audio/capture';
import { CameraCapture } from './vision/camera';

/** One microphone and one camera for the whole app. */
export const audioCapture = new AudioCapture();
export const cameraCapture = new CameraCapture();
