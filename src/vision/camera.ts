import type { Frame } from './types';

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
};

/** Analysis runs on a downscaled frame; 480px wide is plenty for inlay dots. */
export const ANALYSIS_WIDTH = 480;

export class CameraCapture {
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  readonly video: HTMLVideoElement;

  constructor() {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
  }

  /** Rejects with the underlying failure and releases the camera if playback fails. */
  async start(): Promise<MediaStream> {
    if (this.stream) return this.stream;
    const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      this.video.srcObject = null;
      throw error;
    }
    this.stream = stream;
    return stream;
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  get ready(): boolean {
    return this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  /**
   * Grabs the current video frame as pixels the vision modules can read. Null
   * means "no frame yet"; a missing 2D context is fatal and throws.
   */
  grab(width = ANALYSIS_WIDTH): Frame | null {
    if (!this.ready) return null;
    const scale = width / this.video.videoWidth;
    const height = Math.round(this.video.videoHeight * scale);

    if (!this.canvas) this.canvas = document.createElement('canvas');
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.context) throw new Error('camera: 2D canvas context unavailable');

    this.context.drawImage(this.video, 0, 0, width, height);
    const imageData = this.context.getImageData(0, 0, width, height);
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  }
}
