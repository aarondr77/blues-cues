import { LiveAnalyzer } from './engine';

export const WORKLET_URL = '/worklets/capture-worklet.js';

export interface CaptureHandlers {
  onHop?: (samples: Float32Array, startTimeMs: number, rms: number) => void;
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

  async start(): Promise<void> {
    if (this.context) return;
    this.stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    const context = new AudioContext();
    await context.audioWorklet.addModule(WORKLET_URL);

    const source = context.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(context, 'capture-processor');
    const analyzer = new LiveAnalyzer(context.sampleRate);

    node.port.onmessage = (event: MessageEvent) => {
      const message = event.data as { type: string; samples: Float32Array; startTimeMs: number; rms: number };
      if (message.type !== 'hop') return;
      analyzer.push(message.samples, message.startTimeMs, message.rms);
      this.handlers.onHop?.(message.samples, message.startTimeMs, message.rms);
    };

    source.connect(node);
    // The worklet emits no audio, but Chrome only pulls a node that is connected.
    const silence = context.createGain();
    silence.gain.value = 0;
    node.connect(silence).connect(context.destination);

    this.context = context;
    this.source = source;
    this.node = node;
    this.analyzer = analyzer;
  }

  async stop(): Promise<void> {
    this.node?.port.close();
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close();
    this.context = null;
    this.stream = null;
    this.node = null;
    this.source = null;
    this.analyzer = null;
  }
}
