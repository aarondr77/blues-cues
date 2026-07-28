# Fixtures

Recorded ground truth for the audio (§5) and vision (§6) pipelines. The suites in
`src/test/fixtures.*.test.ts` skip themselves while a category is empty and become
hard acceptance gates as soon as files appear, so drop recordings in and run
`npm test`.

## Layout

```
fixtures/
  audio/
    clean/        <name>.wav + <name>.json   each lick played correctly, at tempo
    wrong-note/   <name>.wav + <name>.json   one deliberate wrong pitch
    off-time/     <name>.wav + <name>.json   deliberately early/late
    noise/        <name>.wav                 room tone, typing, muted-string scratch
    low-notes/    <name>.wav + <name>.json   chromatic run on the low E
  video/
    framing-good/ <clip>/ frames + <clip>.json   10s holding each of boxes 1-5
    framing-bad/  <clip>/ frames + <clip>.json   too far/close/edge-on/dark
    drift/        <clip>/ frames + <clip>.json   player shifts mid-take
```

Audio: WAV, 44.1kHz, mono, laptop mic, recorded in the actual practice room.

Video: extract frames next to the clip (`ffmpeg -i clip.mp4 -vf fps=10 clip/%04d.png`)
— the test runner reads PNG/JPEG frames, since Node cannot decode mp4 on its own.

## Label format

`<name>.json` sits beside `<name>.wav`:

```json
{
  "lickId": "box1-descending",
  "offsetMs": 0,
  "notes": [
    { "timeMs": 312, "midi": 72 },
    { "timeMs": 690, "midi": 69 }
  ],
  "judgments": ["perfect", "good", "miss", "perfect", "perfect", "perfect", "perfect", "perfect"],
  "extraNotes": 1
}
```

- `notes` — every attack actually present in the recording, in order. Required for
  `clean/` and `low-notes/`.
- `lickId`, `judgments` — required for `wrong-note/` and `off-time/`; these are the
  judgments the scorer must reproduce exactly.
- `offsetMs` — system latency to subtract, if the take was recorded with a known one.
- `noise/` needs no labels: the assertion is that nothing registers.

Video labels:

```json
{ "box": 3, "rootFret": 5 }
{ "failingCheck": "fretboard-width" }
```

`failingCheck` must be one of the check ids in `src/vision/framing.ts`.

## Acceptance

| Category | Gate |
| --- | --- |
| `clean/`, `low-notes/` | ≥95% of labelled onsets within 30ms, ≥95% pitch accuracy |
| `noise/` | zero note events |
| `wrong-note/`, `off-time/` | computed judgments match the labels exactly |
| `framing-good/` | correct box on ≥80% of frames per clip |
| `framing-bad/` | rejected, with the labelled check failing |
