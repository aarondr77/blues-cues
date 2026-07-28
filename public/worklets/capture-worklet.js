/**
 * Capture-only AudioWorklet: it slices the input into fixed hops and hands them
 * to the main thread with sample-accurate timestamps. Detection itself lives in
 * pure functions (src/audio/*) so it can be tested headlessly against fixtures.
 */
const HOP_SIZE = 256;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(HOP_SIZE);
    this.filled = 0;
    this.samplesSeen = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i];
      if (this.filled < HOP_SIZE) continue;

      let energy = 0;
      for (let k = 0; k < HOP_SIZE; k++) energy += this.buffer[k] * this.buffer[k];
      const startSample = this.samplesSeen + i + 1 - HOP_SIZE;
      this.port.postMessage(
        {
          type: 'hop',
          samples: this.buffer,
          startTimeMs: (startSample / sampleRate) * 1000,
          rms: Math.sqrt(energy / HOP_SIZE),
        },
        [this.buffer.buffer],
      );
      this.buffer = new Float32Array(HOP_SIZE);
      this.filled = 0;
    }

    this.samplesSeen += channel.length;
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
