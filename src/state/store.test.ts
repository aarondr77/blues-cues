import { describe, expect, it } from 'vitest';
import { parseStoredLatency } from './store';

describe('parseStoredLatency', () => {
  it('accepts a well-formed record', () => {
    expect(parseStoredLatency('{"offsetMs":42,"stdDevMs":5,"reliable":true}')).toEqual({
      offsetMs: 42,
      stdDevMs: 5,
      reliable: true,
    });
  });

  it('rejects malformed, mistyped and out-of-range records', () => {
    for (const raw of [
      'not json',
      'null',
      '"42"',
      '{"offsetMs":"42","stdDevMs":5,"reliable":true}',
      '{"offsetMs":42,"stdDevMs":5}',
      '{"offsetMs":null,"stdDevMs":5,"reliable":true}',
      '{"offsetMs":42,"stdDevMs":-1,"reliable":true}',
      '{"offsetMs":1e9,"stdDevMs":5,"reliable":true}',
    ]) {
      expect(parseStoredLatency(raw), raw).toBeNull();
    }
  });
});
