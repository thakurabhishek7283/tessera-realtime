import { describe, expect, it } from 'vitest';
import { computeGrid } from '../src/grid.js';
import { classifyQuality, summariseStats } from '../src/quality.js';
import { createSpeakerDetector, rms } from '../src/speaker.js';

describe('computeGrid', () => {
  it('uses one column for one tile and fills the width', () => {
    const g = computeGrid(1, 1280, 720, 0);
    expect(g).toMatchObject({ columns: 1, rows: 1, tileWidth: 1280, tileHeight: 720 });
  });

  it('picks the arrangement with the biggest tiles', () => {
    // Wide area: four tiles fit best in a row of four... or 2×2 depending on the height.
    expect(computeGrid(4, 1600, 400, 0).columns).toBe(4);
    expect(computeGrid(4, 800, 800, 0).columns).toBe(2);
    expect(computeGrid(4, 400, 1600, 0).columns).toBe(1);
  });

  it('keeps the 16:9 aspect and stays inside the area, gaps included', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const g = computeGrid(n, 1000, 600, 8);
      expect(g.tileWidth * g.columns + 8 * (g.columns - 1)).toBeLessThanOrEqual(1000);
      expect(g.tileHeight * g.rows + 8 * (g.rows - 1)).toBeLessThanOrEqual(600);
      expect(Math.abs(g.tileWidth / g.tileHeight - 16 / 9)).toBeLessThan(0.1);
    }
  });

  it('copes with nothing to show or no room', () => {
    expect(computeGrid(0, 100, 100).tileWidth).toBe(0);
    expect(computeGrid(3, 0, 100).tileWidth).toBe(0);
  });
});

describe('quality', () => {
  it('classifies by round-trip time and loss', () => {
    expect(classifyQuality({})).toBe('unknown');
    expect(classifyQuality({ rtt: 0.05, loss: 0 })).toBe('good');
    expect(classifyQuality({ rtt: 0.2, loss: 0.01 })).toBe('fair');
    expect(classifyQuality({ rtt: 0.05, loss: 0.05 })).toBe('fair');
    expect(classifyQuality({ rtt: 0.6 })).toBe('poor');
    expect(classifyQuality({ loss: 0.2 })).toBe('poor');
  });

  const report = (entries: unknown[]) => ({
    forEach: (fn: (e: unknown) => void) => entries.forEach(fn),
  });

  it('reads rtt from the pair in use and loss between two samples', () => {
    const first = summariseStats(
      report([
        { type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: 0.04 },
        { type: 'candidate-pair', nominated: false, state: 'failed', currentRoundTripTime: 9 },
        { type: 'inbound-rtp', packetsReceived: 100, packetsLost: 0 },
      ]),
    );
    expect(first.sample).toEqual({ rtt: 0.04, loss: undefined });
    const second = summariseStats(
      report([
        { type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: 0.05 },
        { type: 'inbound-rtp', packetsReceived: 180, packetsLost: 20 },
      ]),
      first.counters,
    );
    expect(second.sample.loss).toBeCloseTo(0.2);
  });
});

describe('speaker detector', () => {
  const run = (frames: Array<Record<string, number>>, step = 200) => {
    const d = createSpeakerDetector();
    return frames.map((levels, i) => d.update(levels, i * step));
  };

  it('needs 600 ms of speech before someone becomes the speaker', () => {
    const talking = { a: 0.1, b: 0 };
    expect(run([talking, talking, talking, talking])).toEqual([
      undefined,
      undefined,
      undefined,
      'a',
    ]);
  });

  it('ignores short blips and background noise', () => {
    const quiet = { a: 0.005, b: 0.004 };
    const blip = { a: 0.3, b: 0 };
    expect(run([quiet, blip, quiet, quiet, quiet, quiet])).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('keeps the speaker through a slightly louder interrupter but yields to a much louder one', () => {
    const d = createSpeakerDetector();
    for (let i = 0; i < 4; i++) d.update({ a: 0.1, b: 0 }, i * 200);
    let who: string | undefined;
    for (let i = 4; i < 8; i++) who = d.update({ a: 0.1, b: 0.12 }, i * 200);
    expect(who).toBe('a');
    for (let i = 8; i < 12; i++) who = d.update({ a: 0.05, b: 0.4 }, i * 200);
    expect(who).toBe('b');
    expect(d.isSpeaking('b')).toBe(true);
  });

  it('falls silent when everyone stops, and forgets people who left', () => {
    const d = createSpeakerDetector();
    for (let i = 0; i < 4; i++) d.update({ a: 0.1 }, i * 200);
    expect(d.update({ a: 0 }, 1000)).toBeUndefined();
    d.update({ a: 0.1 }, 1200);
    expect(d.update({}, 1400)).toBeUndefined();
    expect(d.isSpeaking('a')).toBe(false);
  });

  it('computes rms', () => {
    expect(rms([])).toBe(0);
    expect(rms([1, -1, 1, -1])).toBe(1);
    expect(rms([0.5, 0.5])).toBeCloseTo(0.5);
  });
});
