export type Quality = 'good' | 'fair' | 'poor' | 'unknown';

export interface QualitySample {
  /** Round-trip time in seconds. */
  rtt?: number | undefined;
  /** Share of packets lost since the previous sample, 0–1. */
  loss?: number | undefined;
}

/** Maps round-trip time and packet loss to a three-step indicator. */
export function classifyQuality({ rtt, loss }: QualitySample): Quality {
  if (rtt === undefined && loss === undefined) return 'unknown';
  const r = rtt ?? 0;
  const l = loss ?? 0;
  if (r < 0.15 && l < 0.02) return 'good';
  if (r < 0.4 && l < 0.08) return 'fair';
  return 'poor';
}

interface StatsEntry {
  type?: string;
  state?: string;
  nominated?: boolean;
  selected?: boolean;
  currentRoundTripTime?: number;
  packetsReceived?: number;
  packetsLost?: number;
  kind?: string;
}

export interface LossCounters {
  received: number;
  lost: number;
}

/**
 * Reads the numbers that matter out of an `RTCStatsReport`: the round-trip time of the pair in
 * use and the cumulative packet counters of everything received. `previous` turns the counters
 * into a loss ratio for the interval since the last sample.
 */
export function summariseStats(
  report: { forEach(fn: (entry: unknown) => void): void },
  previous?: LossCounters,
): { sample: QualitySample; counters: LossCounters } {
  let rtt: number | undefined;
  let received = 0;
  let lost = 0;
  report.forEach((raw) => {
    const e = raw as StatsEntry;
    if (e.type === 'candidate-pair' && (e.nominated || e.selected) && e.state === 'succeeded') {
      if (typeof e.currentRoundTripTime === 'number') rtt = e.currentRoundTripTime;
    } else if (e.type === 'inbound-rtp') {
      received += e.packetsReceived ?? 0;
      lost += Math.max(0, e.packetsLost ?? 0);
    }
  });
  const counters = { received, lost };
  let loss: number | undefined;
  if (previous) {
    const dReceived = received - previous.received;
    const dLost = lost - previous.lost;
    const total = dReceived + dLost;
    if (total > 0) loss = Math.max(0, dLost) / total;
  }
  return { sample: { rtt, loss }, counters };
}
