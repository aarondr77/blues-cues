import { describe, expect, it } from 'vitest';
import { decodeWav } from './wav';

interface WavOptions {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  /** 1 = PCM, 3 = IEEE float. */
  format?: number;
}

/**
 * Encodes interleaved sample frames into a RIFF/WAVE buffer so the decoder can
 * be exercised without a browser AudioContext. `frames` is one array per
 * channel, each the same length.
 */
function encodeWav(frames: number[][], options: WavOptions = {}): ArrayBuffer {
  const channels = options.channels ?? frames.length;
  const sampleRate = options.sampleRate ?? 44100;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const format = options.format ?? 1;
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = frames[0]?.length ?? 0;
  const dataLength = frameCount * channels * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeId = (offset: number, id: string) => {
    for (let i = 0; i < 4; i++) view.setUint8(offset + i, id.charCodeAt(i));
  };

  writeId(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeId(8, 'WAVE');
  writeId(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeId(36, 'data');
  view.setUint32(40, dataLength, true);

  let at = 44;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const value = frames[channel][frame];
      if (format === 3) {
        if (bitsPerSample === 64) view.setFloat64(at, value, true);
        else view.setFloat32(at, value, true);
      } else if (bitsPerSample === 16) {
        view.setInt16(at, Math.round(value * 32768), true);
      } else if (bitsPerSample === 24) {
        const raw = Math.round(value * 8388608);
        view.setUint8(at, raw & 0xff);
        view.setUint8(at + 1, (raw >> 8) & 0xff);
        view.setUint8(at + 2, (raw >> 16) & 0xff);
      } else if (bitsPerSample === 32) {
        view.setInt32(at, Math.round(value * 2147483648), true);
      } else if (bitsPerSample === 8) {
        view.setUint8(at, Math.round(value * 128) + 128);
      }
      at += bytesPerSample;
    }
  }

  return buffer;
}

describe('decodeWav', () => {
  it('decodes 16-bit mono PCM', () => {
    const buffer = encodeWav([[0, 0.5, -0.5, 0.25]], { bitsPerSample: 16 });
    const decoded = decodeWav(buffer);

    expect(decoded.channels).toBe(1);
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.samples.length).toBe(4);
    expect(decoded.samples[1]).toBeCloseTo(0.5, 4);
    expect(decoded.samples[2]).toBeCloseTo(-0.5, 4);
  });

  it('honors a custom sample rate', () => {
    const buffer = encodeWav([[0.1, 0.2]], { sampleRate: 48000 });
    expect(decodeWav(buffer).sampleRate).toBe(48000);
  });

  it('downmixes stereo to mono by averaging channels', () => {
    const buffer = encodeWav([
      [0.5, 0.5],
      [-0.5, 0.5],
    ]);
    const decoded = decodeWav(buffer);

    expect(decoded.channels).toBe(2);
    expect(decoded.samples.length).toBe(2);
    expect(decoded.samples[0]).toBeCloseTo(0, 3);
    expect(decoded.samples[1]).toBeCloseTo(0.5, 3);
  });

  it('decodes 24-bit PCM including negative values', () => {
    const buffer = encodeWav([[0.75, -0.75]], { bitsPerSample: 24 });
    const decoded = decodeWav(buffer);
    expect(decoded.samples[0]).toBeCloseTo(0.75, 4);
    expect(decoded.samples[1]).toBeCloseTo(-0.75, 4);
  });

  it('decodes 32-bit PCM', () => {
    const buffer = encodeWav([[0.5, -0.25]], { bitsPerSample: 32 });
    const decoded = decodeWav(buffer);
    expect(decoded.samples[0]).toBeCloseTo(0.5, 5);
    expect(decoded.samples[1]).toBeCloseTo(-0.25, 5);
  });

  it('decodes 8-bit PCM (unsigned, centered at 128)', () => {
    const buffer = encodeWav([[0, 0.5]], { bitsPerSample: 8 });
    const decoded = decodeWav(buffer);
    expect(decoded.samples[0]).toBeCloseTo(0, 2);
    expect(decoded.samples[1]).toBeCloseTo(0.5, 2);
  });

  it('decodes 32-bit IEEE float (format 3)', () => {
    const buffer = encodeWav([[0.123, -0.987]], { bitsPerSample: 32, format: 3 });
    const decoded = decodeWav(buffer);
    expect(decoded.samples[0]).toBeCloseTo(0.123, 5);
    expect(decoded.samples[1]).toBeCloseTo(-0.987, 5);
  });

  it('decodes 64-bit IEEE float (format 3)', () => {
    // Results are stored in a Float32Array, so precision is bounded by float32.
    const buffer = encodeWav([[0.123456789]], { bitsPerSample: 64, format: 3 });
    expect(decodeWav(buffer).samples[0]).toBeCloseTo(0.123456789, 6);
  });

  it('rejects buffers that are not RIFF/WAVE', () => {
    const buffer = new ArrayBuffer(44);
    expect(() => decodeWav(buffer)).toThrow(/RIFF\/WAVE/);
  });

  it('throws when the data chunk is missing', () => {
    // A complete fmt chunk but no data chunk at all.
    const buffer = new ArrayBuffer(12 + 8 + 16);
    const view = new DataView(buffer);
    const writeId = (offset: number, id: string) => {
      for (let i = 0; i < 4; i++) view.setUint8(offset + i, id.charCodeAt(i));
    };
    writeId(0, 'RIFF');
    view.setUint32(4, buffer.byteLength - 8, true);
    writeId(8, 'WAVE');
    writeId(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 44100, true);
    view.setUint16(34, 16, true);
    expect(() => decodeWav(buffer)).toThrow(/missing data chunk/);
  });

  it('throws on an unsupported bit depth', () => {
    const buffer = encodeWav([[0]], { bitsPerSample: 16 });
    // Rewrite the fmt chunk's bit depth to an unsupported value.
    new DataView(buffer).setUint16(34, 12, true);
    expect(() => decodeWav(buffer)).toThrow(/unsupported bit depth/);
  });

  it('skips unknown chunks and still finds the data chunk', () => {
    // Build RIFF/WAVE with a LIST chunk (odd size, exercises padding) before data.
    const dataSamples = [0.5, -0.5];
    const dataBytes = dataSamples.length * 2;
    const listBody = 3; // odd -> one padding byte
    const size = 12 + (8 + 16) + (8 + listBody + 1) + (8 + dataBytes);
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    const writeId = (offset: number, id: string) => {
      for (let i = 0; i < 4; i++) view.setUint8(offset + i, id.charCodeAt(i));
    };
    writeId(0, 'RIFF');
    view.setUint32(4, size - 8, true);
    writeId(8, 'WAVE');

    let offset = 12;
    writeId(offset, 'fmt ');
    view.setUint32(offset + 4, 16, true);
    view.setUint16(offset + 8, 1, true);
    view.setUint16(offset + 10, 1, true);
    view.setUint32(offset + 12, 44100, true);
    view.setUint32(offset + 16, 44100 * 2, true);
    view.setUint16(offset + 20, 2, true);
    view.setUint16(offset + 22, 16, true);
    offset += 8 + 16;

    writeId(offset, 'LIST');
    view.setUint32(offset + 4, listBody, true);
    offset += 8 + listBody + 1; // include padding byte

    writeId(offset, 'data');
    view.setUint32(offset + 4, dataBytes, true);
    offset += 8;
    for (const sample of dataSamples) {
      view.setInt16(offset, Math.round(sample * 32768), true);
      offset += 2;
    }

    const decoded = decodeWav(buffer);
    expect(decoded.samples.length).toBe(2);
    expect(decoded.samples[0]).toBeCloseTo(0.5, 4);
    expect(decoded.samples[1]).toBeCloseTo(-0.5, 4);
  });
});
