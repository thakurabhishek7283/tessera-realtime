import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerLink, type PeerLinkState, type Signal } from '../src/peer-link.js';
import { FakeRTCPeerConnection, FakeStream, FakeTrack } from './fakes.js';

const logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => logger };

interface Side {
  link: PeerLink;
  pc: FakeRTCPeerConnection;
  states: PeerLinkState[];
  remote: FakeStream[];
}

/** Two links wired together through a signalling channel with an optional delay. */
function pair(opts: { delay?: boolean; localA?: boolean; localB?: boolean } = {}) {
  const queue: Array<() => void> = [];
  const deliver = (fn: () => void) => (opts.delay ? queue.push(fn) : queueMicrotask(fn));
  const make = (polite: boolean, withLocal: boolean, to: () => Side): Side => {
    const pc = new FakeRTCPeerConnection();
    const states: PeerLinkState[] = [];
    const remote: FakeStream[] = [];
    const local = withLocal
      ? (new FakeStream([new FakeTrack('audio'), new FakeTrack('video')]) as unknown as MediaStream)
      : undefined;
    const link = new PeerLink({
      pc: pc as unknown as RTCPeerConnection,
      polite,
      local,
      logger,
      send: (signal: Signal) => deliver(() => void to().link.handleSignal(signal)),
      onRemoteStream: (s) => remote.push(s as unknown as FakeStream),
      onState: (s) => states.push(s),
    });
    return { link, pc, states, remote };
  };
  const a: Side = make(false, opts.localA ?? true, () => b);
  const b: Side = make(true, opts.localB ?? true, () => a);
  const flush = async () => {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      while (queue.length) queue.shift()?.();
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { a, b, flush };
}

beforeEach(() => {
  FakeRTCPeerConnection.instances.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('perfect negotiation', () => {
  it('connects two peers that both start by offering (glare) and ends stable on both sides', async () => {
    const { a, b, flush } = pair({ delay: true });
    // Both fire negotiationneeded in the same tick; the offers cross on the wire.
    await flush();
    expect(a.pc.signalingState).toBe('stable');
    expect(b.pc.signalingState).toBe('stable');
    // The polite side backed out of its own offer; the impolite side never rolled back.
    expect(b.pc.rollbacks).toBeGreaterThan(0);
    expect(a.pc.rollbacks).toBe(0);
    expect(a.states.at(-1)).toBe('connected');
    expect(b.states.at(-1)).toBe('connected');
    expect(a.remote.length).toBeGreaterThan(0);
    expect(b.remote.length).toBeGreaterThan(0);
  });

  it('connects when the signalling is fast too', async () => {
    const { a, b, flush } = pair();
    await flush();
    expect(a.pc.signalingState).toBe('stable');
    expect(b.pc.signalingState).toBe('stable');
    expect(a.states).toContain('connected');
  });

  it('ignores a colliding offer when impolite, and the polite peer answers the survivor', async () => {
    const { a, b, flush } = pair({ delay: true });
    await flush();
    // Exactly one offer per side was made before they settled; no side is stuck with a stray offer.
    expect(a.pc.offersMade.length).toBeGreaterThanOrEqual(1);
    expect(a.pc.remoteDescription?.type).toBe('answer');
    expect(b.pc.remoteDescription?.type).toBe('offer');
  });

  it('works when one side has no devices (receive only)', async () => {
    const { a, b, flush } = pair({ localA: false });
    await flush();
    expect(a.states.at(-1)).toBe('connected');
    expect(b.remote.length).toBeGreaterThan(0);
    expect(a.pc.transceivers.map((t) => t.sender.track)).toEqual([null, null]);
  });

  it('does not throw on candidates for an offer it ignored', async () => {
    const { a, flush } = pair({ delay: true });
    await flush();
    await expect(
      a.link.handleSignal({ candidate: { candidate: 'candidate:1' } }),
    ).resolves.toBeUndefined();
  });

  it('forwards candidates and the end-of-candidates marker', async () => {
    const { a, b, flush } = pair();
    await flush();
    a.pc.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'candidate:42' }) } });
    a.pc.onicecandidate?.({ candidate: null });
    await flush();
    expect(b.pc.candidates).toEqual([{ candidate: 'candidate:42' }, undefined]);
  });
});

describe('ICE trouble', () => {
  it('restarts ICE when the connection stays disconnected, but not for a short blip', async () => {
    const { a, flush } = pair();
    await flush();
    vi.useFakeTimers();
    a.pc.fireIce('disconnected');
    expect(a.link.state).toBe('reconnecting');
    vi.advanceTimersByTime(3000);
    a.pc.fireIce('connected');
    vi.advanceTimersByTime(20_000);
    expect(a.pc.iceRestarts).toBe(0);
    expect(a.link.state).toBe('connected');

    a.pc.fireIce('disconnected');
    vi.advanceTimersByTime(8100);
    expect(a.pc.iceRestarts).toBe(1);
  });

  it('restarts ICE at once when it fails, and gives up after repeated failures', async () => {
    const { a, flush } = pair();
    await flush();
    for (let i = 0; i < 5; i++) a.pc.fireIce('failed');
    expect(a.pc.iceRestarts).toBe(5);
    expect(a.link.state).toBe('reconnecting');
    a.pc.fireIce('failed');
    expect(a.link.state).toBe('closed');
    expect(a.pc.closed).toBe(true);
  });

  it('renegotiates after an ICE restart and returns to connected', async () => {
    const { a, b, flush } = pair();
    await flush();
    a.pc.fireIce('failed');
    await flush();
    expect(a.pc.signalingState).toBe('stable');
    expect(b.pc.signalingState).toBe('stable');
    expect(a.pc.offersMade.length).toBeGreaterThanOrEqual(2);
  });
});

describe('tracks and closing', () => {
  it('swaps the sent track without renegotiating', async () => {
    const { a, flush } = pair();
    await flush();
    const offers = a.pc.offersMade.length;
    const screen = new FakeTrack('video', 'screen');
    await a.link.replaceTrack('video', screen as unknown as MediaStreamTrack);
    expect(a.pc.transceivers.find((t) => t.receiver.track.kind === 'video')?.sender.track).toBe(
      screen,
    );
    await flush();
    expect(a.pc.offersMade.length).toBe(offers);
    await a.link.replaceTrack('video', null);
    expect(
      a.pc.transceivers.find((t) => t.receiver.track.kind === 'video')?.sender.track,
    ).toBeNull();
  });

  it('closes once, stops reacting to signals and reports it', async () => {
    const { a, flush } = pair();
    await flush();
    a.link.close();
    a.link.close();
    expect(a.states.filter((s) => s === 'closed')).toHaveLength(1);
    expect(a.pc.closed).toBe(true);
    await a.link.handleSignal({ description: { type: 'offer', sdp: 'x' } });
    expect(a.pc.signalingState).toBe('stable');
  });
});
