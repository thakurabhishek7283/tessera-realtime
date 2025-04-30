import { alice, bob, carol, FakeHub } from '@tessera/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Person, person, until } from './call-env.js';
import { FakeRTCPeerConnection } from './fakes.js';

const ids = (p: Person): string[] => p.call.state.get().participants.map((x) => x.user.id);
const connected = (p: Person, n: number): boolean =>
  p.call.state.get().participants.length === n &&
  p.call.state.get().participants.every((x) => x.connection === 'connected' && !!x.stream);

beforeEach(() => {
  FakeRTCPeerConnection.instances.length = 0;
});
afterEach(() => vi.useRealTimers());

async function twoJoin(prejoin = true) {
  const hub = new FakeHub();
  const a = await person(hub, 'room-1', alice, { prejoin });
  const b = await person(hub, 'room-1', bob, { prejoin });
  return { hub, a, b };
}

describe('joining', () => {
  it('goes through prejoin with a preview, then connects both sides', async () => {
    const { a, b } = await twoJoin();
    await a.call.start();
    expect(a.call.state.get().phase).toBe('prejoin');
    expect(a.call.state.get().local.stream?.getTracks()).toHaveLength(2);
    expect(a.call.state.get().local.devices.videoinput.map((d) => d.label)).toEqual([
      'Built-in camera',
      'Webcam',
    ]);
    await a.call.join();
    expect(a.call.state.get().phase).toBe('in-call');
    await b.call.start();
    await b.call.join();
    await until(() => connected(a, 1) && connected(b, 1));
    expect(ids(a)).toEqual(['bob']);
    expect(ids(b)).toEqual(['alice']);
    expect(a.events).toEqual(['joined:room-1']);
  });

  it('joins at once without prejoin', async () => {
    const { a } = await twoJoin(false);
    await a.call.start();
    expect(a.call.state.get().phase).toBe('in-call');
  });

  it('connects three people in a mesh, each with its own connection per peer', async () => {
    const hub = new FakeHub();
    const people = [
      await person(hub, 'r', alice),
      await person(hub, 'r', bob),
      await person(hub, 'r', carol),
    ];
    for (const p of people) await p.call.start();
    await Promise.all(people.map((p) => p.call.join()));
    await until(() => people.every((p) => connected(p, 2)));
    for (const p of people) expect(p.env.connections).toHaveLength(2);
    // Everybody ended up with a settled negotiation on every connection.
    expect(FakeRTCPeerConnection.instances.every((pc) => pc.signalingState === 'stable')).toBe(
      true,
    );
  });

  it('settles when two people join at the same moment', async () => {
    const hub = new FakeHub();
    const [a, b] = [await person(hub, 'r', alice), await person(hub, 'r', bob)];
    await Promise.all([a.call.start(), b.call.start()]);
    await Promise.all([a.call.join(), b.call.join()]);
    await until(() => connected(a, 1) && connected(b, 1));
  });

  it('refuses a call that is full and lets a new attempt start fresh', async () => {
    const hub = new FakeHub();
    const [a, b, c] = [
      await person(hub, 'r', alice, { maxParticipants: 2 }),
      await person(hub, 'r', bob, { maxParticipants: 2 }),
      await person(hub, 'r', carol, { maxParticipants: 2 }),
    ];
    for (const p of [a, b, c]) await p.call.start();
    await a.call.join();
    await b.call.join();
    await expect(c.call.join()).rejects.toBeDefined();
    expect(c.call.state.get()).toMatchObject({ phase: 'error', error: { reason: 'room-full' } });
    expect(c.api.call('r')).not.toBe(c.call);
    // The ones inside are unaffected.
    expect(ids(a)).toEqual(['bob']);
  });

  it('also honours the transport’s own limit', async () => {
    const hub = new FakeHub({ capacity: { call: 1 } });
    const [a, b] = [await person(hub, 'r', alice), await person(hub, 'r', bob)];
    await a.call.start();
    await a.call.join();
    await b.call.start();
    await expect(b.call.join()).rejects.toBeDefined();
    expect(b.call.state.get().error?.reason).toBe('room-full');
  });

  it('cannot be joined twice or from the wrong phase', async () => {
    const { a } = await twoJoin();
    await a.call.start();
    await a.call.join();
    await a.call.join();
    expect(a.call.state.get().phase).toBe('in-call');
    await expect(a.call.start()).rejects.toThrow();
  });
});

describe('devices', () => {
  it('lets someone without permission join and listen', async () => {
    const { a, b } = await twoJoin();
    a.env.devices.denied = { audio: 'NotAllowedError', video: 'NotAllowedError' };
    await a.call.start();
    expect(a.call.state.get().local.stream).toBeUndefined();
    expect(a.call.state.get().local.error?.reason).toBe('permission-denied');
    await a.call.join();
    await b.call.start();
    await b.call.join();
    await until(() => connected(a, 1) && connected(b, 1));
    expect(a.call.state.get().participants[0]?.stream).toBeDefined();
    // The other side sees the receive-only person as audio and video off.
    expect(b.call.state.get().participants[0]).toMatchObject({ audio: false, video: false });
  });

  it('falls back to audio only when there is no camera', async () => {
    const { a } = await twoJoin();
    a.env.devices.denied = { video: 'NotFoundError' };
    await a.call.start();
    const local = a.call.state.get().local;
    expect(local.stream?.getTracks().map((t) => t.kind)).toEqual(['audio']);
    expect(local).toMatchObject({ audio: true, video: false });
    expect(local.error?.reason).toBe('no-device');
  });

  it('starts with microphone and camera as the defaults and the join options say', async () => {
    const hub = new FakeHub();
    const a = await person(hub, 'r', alice, { defaults: { audio: false, video: true } });
    await a.call.start();
    expect(a.call.state.get().local).toMatchObject({ audio: false, video: true });
    await a.call.join({ audio: true, video: false });
    expect(a.call.state.get().local).toMatchObject({ audio: true, video: false });
  });

  it('mutes instantly without renegotiating and tells the others', async () => {
    const { a, b } = await twoJoin();
    for (const p of [a, b]) {
      await p.call.start();
      await p.call.join();
    }
    await until(() => connected(a, 1) && connected(b, 1));
    const offers = a.env.connections.map((c) => c.offersMade.length);
    a.call.toggleAudio();
    a.call.toggleVideo();
    expect(a.call.state.get().local).toMatchObject({ audio: false, video: false });
    expect(
      a.call.state
        .get()
        .local.stream?.getTracks()
        .every((t) => !t.enabled),
    ).toBe(true);
    await until(
      () =>
        !b.call.state.get().participants[0]?.audio && !b.call.state.get().participants[0]?.video,
    );
    expect(a.env.connections.map((c) => c.offersMade.length)).toEqual(offers);
    a.call.toggleAudio();
    await until(() => b.call.state.get().participants[0]?.audio === true);
  });

  it('turns a camera on that was blocked at first once it is allowed', async () => {
    const { a, b } = await twoJoin();
    a.env.devices.denied = { video: 'NotAllowedError' };
    await a.call.start();
    await a.call.join();
    await b.call.start();
    await b.call.join();
    await until(() => connected(a, 1));
    expect(a.call.state.get().local.video).toBe(false);
    a.env.devices.denied = {};
    a.call.toggleVideo();
    await until(() => a.call.state.get().local.video);
    await until(() => b.call.state.get().participants[0]?.video === true);
    const videoSender = a.env.connections[0]?.transceivers.find(
      (t) => t.receiver.track.kind === 'video',
    )?.sender;
    expect(videoSender?.track?.kind).toBe('video');
  });

  it('switches the camera or microphone and sends the new track everywhere', async () => {
    const { a, b } = await twoJoin();
    for (const p of [a, b]) {
      await p.call.start();
      await p.call.join();
    }
    await until(() => connected(a, 1));
    const oldTrack = a.call.state.get().local.stream?.getVideoTracks()[0];
    await a.call.selectDevice('videoinput', 'cam-2');
    const local = a.call.state.get().local;
    expect(local.selected.videoinput).toBe('cam-2');
    expect(local.stream?.getVideoTracks()[0]?.getSettings().deviceId).toBe('cam-2');
    expect(oldTrack?.readyState).toBe('ended');
    const sent = a.env.connections[0]?.transceivers.find((t) => t.receiver.track.kind === 'video')
      ?.sender.track;
    expect(sent).toBe(local.stream?.getVideoTracks()[0]);
    await a.call.selectDevice('audiooutput', 'spk-1');
    expect(a.call.state.get().local.selected.audiooutput).toBe('spk-1');
  });

  it('keeps the device lists fresh when devices change', async () => {
    const { a } = await twoJoin();
    await a.call.start();
    a.env.devices.list.push({ kind: 'videoinput', deviceId: 'cam-3', label: '' });
    for (const fn of a.env.devices.listeners) fn();
    await until(() => a.call.state.get().local.devices.videoinput.length === 3);
    expect(a.call.state.get().local.devices.videoinput[2]?.label).toBe('Camera 3');
  });
});

describe('screen sharing', () => {
  it('replaces the camera for everybody, announces it and returns to the camera', async () => {
    const { a, b } = await twoJoin();
    for (const p of [a, b]) {
      await p.call.start();
      await p.call.join();
    }
    await until(() => connected(a, 1) && connected(b, 1));
    const camera = a.call.state.get().local.stream?.getVideoTracks()[0];
    await a.call.startScreenShare();
    const sender = () =>
      a.env.connections[0]?.transceivers.find((t) => t.receiver.track.kind === 'video')?.sender;
    expect(sender()?.track?.getSettings().deviceId).toBe('screen');
    expect(a.call.state.get().local.screen).toBe(true);
    await until(() => b.call.state.get().participants[0]?.screen === true);
    a.call.stopScreenShare();
    expect(sender()?.track).toBe(camera);
    await until(() => b.call.state.get().participants[0]?.screen === false);
  });

  it('stops by itself when the browser ends the capture', async () => {
    const { a } = await twoJoin();
    await a.call.start();
    await a.call.join();
    await a.call.startScreenShare();
    const screen = a.env.devices.tracks.at(-1);
    screen?.end();
    expect(a.call.state.get().local.screen).toBe(false);
  });

  it('is refused when turned off in the config', async () => {
    const hub = new FakeHub();
    const a = await person(hub, 'r', alice, { allow: { screenShare: false } });
    await a.call.start();
    await a.call.join();
    await expect(a.call.startScreenShare()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('shows a late joiner the screen, not the camera', async () => {
    const hub = new FakeHub();
    const a = await person(hub, 'r', alice);
    await a.call.start();
    await a.call.join();
    await a.call.startScreenShare();
    const b = await person(hub, 'r', bob);
    await b.call.start();
    await b.call.join();
    await until(() => connected(a, 1));
    const sender = a.env.connections[0]?.transceivers.find(
      (t) => t.receiver.track.kind === 'video',
    )?.sender;
    expect(sender?.track?.getSettings().deviceId).toBe('screen');
  });
});

describe('leaving', () => {
  it('releases the camera, removes the person for the others and forgets the call', async () => {
    const { a, b } = await twoJoin();
    for (const p of [a, b]) {
      await p.call.start();
      await p.call.join();
    }
    await until(() => connected(a, 1) && connected(b, 1));
    const tracks = a.call.state.get().local.stream?.getTracks() ?? [];
    await a.call.leave();
    expect(a.call.state.get().phase).toBe('ended');
    expect(tracks.every((t) => t.readyState === 'ended')).toBe(true);
    expect(a.env.connections.every((c) => c.closed)).toBe(true);
    expect(a.events).toEqual(['joined:room-1', 'left:room-1']);
    await until(() => ids(b).length === 0);
    expect(b.env.connections[0]?.closed).toBe(true);
    expect(a.api.call('room-1')).not.toBe(a.call);
  });

  it('can be left from the preview without ever joining', async () => {
    const { a } = await twoJoin();
    await a.call.start();
    const tracks = a.call.state.get().local.stream?.getTracks() ?? [];
    await a.call.leave();
    expect(tracks.every((t) => t.readyState === 'ended')).toBe(true);
    expect(a.events).toEqual([]);
  });

  it('ends the call when the signalling connection stays down for 30 seconds', async () => {
    const { a, b } = await twoJoin();
    for (const p of [a, b]) {
      await p.call.start();
      await p.call.join();
    }
    await until(() => connected(a, 1));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    a.transport?.drop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(a.call.state.get().phase).toBe('in-call');
    await vi.advanceTimersByTimeAsync(11_000);
    expect(a.call.state.get()).toMatchObject({
      phase: 'ended',
      error: { reason: 'connection-lost' },
    });
  });

  it('keeps the call when the connection comes back in time', async () => {
    const { a, b } = await twoJoin();
    for (const p of [a, b]) {
      await p.call.start();
      await p.call.join();
    }
    await until(() => connected(a, 1));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    a.transport?.drop();
    await vi.advanceTimersByTimeAsync(10_000);
    a.transport?.restore();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(a.call.state.get().phase).toBe('in-call');
  });
});

describe('connection setup', () => {
  it('uses the configured ICE servers', async () => {
    const hub = new FakeHub();
    const servers = [{ urls: 'turn:t.example', username: 'u', credential: 'p' }];
    const a = await person(hub, 'r', alice, { iceServers: servers });
    const b = await person(hub, 'r', bob);
    for (const p of [a, b]) {
      await p.call.start();
      await p.call.join();
    }
    await until(() => connected(a, 1));
    expect(a.env.connections[0]?.config).toEqual({ iceServers: servers });
    expect(b.env.connections[0]?.config).toEqual({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
  });

  it('fetches ICE servers with the user token before joining, and falls back when that fails', async () => {
    const hub = new FakeHub();
    const a = await person(hub, 'r', alice, { iceServersUrl: 'https://server.example/v1/ice' });
    await a.call.start();
    await a.call.join();
    expect(a.env.fetched).toEqual([{ url: 'https://server.example/v1/ice', headers: {} }]);

    const b = await person(hub, 'r', bob, { iceServersUrl: 'https://server.example/v1/ice' });
    b.env.fetch = async () => new Response('nope', { status: 500 });
    await b.call.start();
    await b.call.join();
    await until(() => connected(b, 1));
    expect(b.env.connections[0]?.config).toEqual({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    expect(a.env.connections[0]?.config).toEqual({
      iceServers: [{ urls: 'turn:turn.example', username: 'u', credential: 'c' }],
    });
  });
});

describe('layout and presence', () => {
  it('pinning someone switches to the spotlight layout', async () => {
    const hub = new FakeHub();
    const a = await person(hub, 'r', alice);
    await a.call.start();
    expect(a.call.state.get().layout).toBe('grid');
    a.call.pin('p1');
    expect(a.call.state.get()).toMatchObject({ layout: 'spotlight', pinnedPeerId: 'p1' });
    a.call.pin();
    expect(a.call.state.get().pinnedPeerId).toBeUndefined();
    a.call.setLayout('grid');
    expect(a.call.state.get().layout).toBe('grid');
  });

  it('announces the call through the presence kit when it is enabled', async () => {
    const hub = new FakeHub();
    const joined: string[] = [];
    const a = await person(hub, 'r', alice);
    (a.instance.ctx.services as unknown as { register(id: string, impl: unknown): void }).register(
      'presence',
      {
        join: async (scope: string) => {
          joined.push(scope);
          return {
            set: (s: unknown) => joined.push(JSON.stringify(s)),
            leave: async () => joined.push('left'),
          };
        },
      },
    );
    await a.call.start();
    await a.call.join();
    expect(joined).toEqual(['call:r', '{"location":"in-call"}']);
    await a.call.leave();
    expect(joined.at(-1)).toBe('left');
  });
});
