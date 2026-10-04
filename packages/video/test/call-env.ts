import type { UserInfo } from '@tessera-kit/core';
import { alice, createTestInstance, type FakeHub } from '@tessera-kit/testing';
import { createVideoApi } from '../src/api.js';
import type { CallEnv } from '../src/call.js';
import { VideoConfig } from '../src/config.js';
import type { CallController, VideoApi } from '../src/index.js';
import { FakeRTCPeerConnection, FakeStream, FakeTrack } from './fakes.js';

export class FakeMediaDevices {
  /** Errors by requested kind, as `DOMException` names. */
  denied: Partial<Record<'audio' | 'video', string>> = {};
  requests: MediaStreamConstraints[] = [];
  displays = 0;
  readonly listeners = new Set<() => void>();
  list: Array<{ kind: string; deviceId: string; label: string }> = [
    { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in mic' },
    { kind: 'audioinput', deviceId: 'mic-2', label: 'USB mic' },
    { kind: 'videoinput', deviceId: 'cam-1', label: 'Built-in camera' },
    { kind: 'videoinput', deviceId: 'cam-2', label: 'Webcam' },
    { kind: 'audiooutput', deviceId: 'spk-1', label: 'Speakers' },
  ];
  tracks: FakeTrack[] = [];

  async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    this.requests.push(constraints);
    const stream = new FakeStream();
    for (const kind of ['audio', 'video'] as const) {
      const wanted = constraints[kind];
      if (!wanted) continue;
      const denied = this.denied[kind];
      if (denied) throw new DOMException('refused', denied);
      const exact =
        typeof wanted === 'object'
          ? (wanted.deviceId as { exact?: string } | undefined)?.exact
          : undefined;
      const defaultId = kind === 'audio' ? 'mic-1' : 'cam-1';
      const track = new FakeTrack(kind, `${kind} device`, exact ?? defaultId);
      this.tracks.push(track);
      stream.addTrack(track);
    }
    return stream as unknown as MediaStream;
  }

  async getDisplayMedia(): Promise<MediaStream> {
    this.displays += 1;
    const track = new FakeTrack('video', 'screen', 'screen');
    this.tracks.push(track);
    return new FakeStream([track]) as unknown as MediaStream;
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    return this.list as MediaDeviceInfo[];
  }

  addEventListener(_type: 'devicechange', fn: () => void): void {
    this.listeners.add(fn);
  }

  removeEventListener(_type: 'devicechange', fn: () => void): void {
    this.listeners.delete(fn);
  }
}

export interface Env extends CallEnv {
  devices: FakeMediaDevices;
  connections: FakeRTCPeerConnection[];
  fetched: Array<{ url: string; headers: unknown }>;
  iceResponse: unknown;
}

export function fakeEnv(): Env {
  const devices = new FakeMediaDevices();
  const connections: FakeRTCPeerConnection[] = [];
  const env: Env = {
    devices,
    connections,
    fetched: [],
    iceResponse: { iceServers: [{ urls: 'turn:turn.example', username: 'u', credential: 'c' }] },
    createPeerConnection: (config) => {
      const pc = new FakeRTCPeerConnection(config);
      connections.push(pc);
      return pc as unknown as RTCPeerConnection;
    },
    mediaDevices: () => devices,
    createAudioContext: () => undefined,
    fetch: async (url, init) => {
      env.fetched.push({ url: String(url), headers: init?.headers });
      return new Response(JSON.stringify(env.iceResponse), { status: 200 });
    },
  };
  return env;
}

export interface Person {
  api: VideoApi;
  call: CallController;
  env: Env;
  user: UserInfo;
  events: string[];
  instance: Awaited<ReturnType<typeof createTestInstance>>['instance'];
  transport: Awaited<ReturnType<typeof createTestInstance>>['transport'];
}

export async function person(
  hub: FakeHub,
  callId: string,
  user: UserInfo = alice,
  config: Record<string, unknown> = {},
  env = fakeEnv(),
  extraFeatures: Record<string, { enabled: boolean }> = {},
): Promise<Person> {
  const test = await createTestInstance(
    { appId: hub.appId, features: extraFeatures },
    {},
    { hub, user },
  );
  const api = createVideoApi(
    test.instance.ctx,
    VideoConfig.parse({ enabled: true, ...config }),
    env,
  );
  const events: string[] = [];
  test.instance.on('video:joined', (e) => events.push(`joined:${e.callId}`));
  test.instance.on('video:left', (e) => events.push(`left:${e.callId}`));
  return {
    api,
    call: api.call(callId),
    env,
    user,
    events,
    instance: test.instance,
    transport: test.transport,
  };
}

export async function until(fn: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('until(): timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}
