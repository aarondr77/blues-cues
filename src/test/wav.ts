export interface DecodedWav {
  sampleRate: number;
  channels: number;
  samples: Float32Array;
}

function readChunkId(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Minimal RIFF/WAVE decoder for fixtures (PCM 16/24/32-bit and float32),
 * downmixed to mono. Node has no AudioContext, so fixtures cannot use one.
 */
export function decodeWav(buffer: ArrayBuffer): DecodedWav {
  const view = new DataView(buffer);
  if (readChunkId(view, 0) !== 'RIFF' || readChunkId(view, 8) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }

  let offset = 12;
  let format = 1;
  let channels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= view.byteLength) {
    const id = readChunkId(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = size;
    }
    offset = body + size + (size % 2);
  }

  if (dataOffset < 0) throw new Error('wav: missing data chunk');

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
  const samples = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const at = dataOffset + (frame * channels + channel) * bytesPerSample;
      let value: number;
      if (format === 3) {
        value = bitsPerSample === 64 ? view.getFloat64(at, true) : view.getFloat32(at, true);
      } else if (bitsPerSample === 16) {
        value = view.getInt16(at, true) / 32768;
      } else if (bitsPerSample === 24) {
        const raw =
          view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16);
        value = raw / 8388608;
      } else if (bitsPerSample === 32) {
        value = view.getInt32(at, true) / 2147483648;
      } else if (bitsPerSample === 8) {
        value = (view.getUint8(at) - 128) / 128;
      } else {
        throw new Error(`wav: unsupported bit depth ${bitsPerSample}`);
      }
      sum += value;
    }
    samples[frame] = sum / channels;
  }

  return { sampleRate, channels, samples };
}
