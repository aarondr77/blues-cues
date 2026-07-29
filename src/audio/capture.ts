import { LiveAnalyzer } from './engine';

export const WORKLET_URL = '/worklets/capture-worklet.js';

export interface CaptureHandlers {
  onHop?: (samples: Float32Array, startTimeMs: number, rms: number) => void;
  /** Called for failures that happen off the call stack, i.e. in the worklet port. */
  onError?: (error: Error) => void;
}

/**
 * Microphone capture with the browser's speech DSP switched off — echo
 * cancellation, noise suppression and AGC all destroy pitch content.
 */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
};

export class AudioCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  analyzer: LiveAnalyzer | null = null;
  private readonly handlers: CaptureHandlers;

  constructor(handlers: CaptureHandlers = {}) {
    this.handlers = handlers;
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 44100;
  }

  get audioContext(): AudioContext | null {
    return this.context;
  }

  /** Capture-clock time in milliseconds, shared with the metronome. */
  get nowMs(): number {
    return (this.context?.currentTime ?? 0) * 1000;
  }

  /**
   * Rejects with the underlying failure (permission denied, missing worklet) and
   * leaves nothing running: a half-started capture would otherwise hold the
   * microphone open with no way to reach it.
   */
  async start(): Promise<void> {
    if (this.context) return;
    const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      await context.audioWorklet.addModule(WORKLET_URL);

      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, 'capture-processor');
      const analyzer = new LiveAnalyzer(context.sampleRate);

      node.port.onmessage = (event: MessageEvent) => {
        const message = event.data as { type: string; samples: Float32Array; startTimeMs: number; rms: number };
        if (message.type !== 'hop') return;
        try {
          analyzer.push(message.samples, message.startTimeMs, message.rms);
          this.handlers.onHop?.(message.samples, message.startTimeMs, message.rms);
        } catch (error) {
          this.reportError(error);
        }
      };
      node.port.onmessageerror = () => {
        this.reportError(new Error('capture worklet sent a message that could not be read'));
      };
      node.onprocessorerror = () => {
        this.reportError(new Error('capture worklet stopped: the audio processor threw'));
      };

      source.connect(node);
      // The worklet emits no audio, but Chrome only pulls a node that is connected.
      const silence = context.createGain();
      silence.gain.value = 0;
      node.connect(silence).connect(context.destination);

      this.context = context;
      this.stream = stream;
      this.source = source;
      this.node = node;
      this.analyzer = analyzer;
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      await context?.close().catch(() => undefined);
      throw error;
    }
  }

  /** Releases everything even if closing the context fails. */
  async stop(): Promise<void> {
    const context = this.context;
    try {
      this.node?.port.close();
      this.node?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());
    } finally {
      this.context = null;
      this.stream = null;
      this.node = null;
      this.source = null;
      this.analyzer = null;
    }
    await context?.close();
  }

  private reportError(error: unknown): void {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    if (this.handlers.onError) this.handlers.onError(wrapped);
    else console.error('[audio capture]', wrapped);
  }
}
