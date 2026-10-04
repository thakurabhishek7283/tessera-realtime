import {
  batch,
  createStore,
  type Peer,
  type Room,
  type TesseraContext,
  TesseraError,
} from '@tessera-kit/core';
import { IceRes, RtcSignal } from '@tessera-kit/protocol';
import { DEFAULT_ICE_SERVERS, type VideoConfigValue } from './config.js';
import { createLevelMeter, type LevelMeter } from './levels.js';
import { acquireMedia, browserMediaDevices, listDevices, type MediaDevicesLike } from './media.js';
import { PeerLink, type PeerLinkState } from './peer-link.js';
import { classifyQuality, type LossCounters, type Quality, summariseStats } from './quality.js';
import { createSpeakerDetector } from './speaker.js';
import type {
  CallController,
  CallError,
  CallPhase,
  CallState,
  DeviceKind,
  LocalMedia,
  Participant,
} from './types.js';

/** What the call needs from the browser; replaceable in tests. */
export interface CallEnv {
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
  mediaDevices(): MediaDevicesLike | undefined;
  createAudioContext(): AudioContext | undefined;
  fetch: typeof fetch;
}

export const browserEnv: CallEnv = {
  createPeerConnection: (config) => new RTCPeerConnection(config),
  mediaDevices: browserMediaDevices,
  createAudioContext: () => (typeof AudioContext === 'undefined' ? undefined : new AudioContext()),
  fetch: (...args) => globalThis.fetch(...args),
};

const LEVEL_EVERY_MS = 200;
const STATS_EVERY_MS = 2000;
/** The call ends when the signalling connection stays down this long. */
const CONNECTION_LOST_MS = 30_000;

/** The part of the presence kit used to show who is in a call, reached through the registry. */
interface PresenceLike {
  join(scope: string): Promise<{ set(state: { location?: string }): void; leave(): Promise<void> }>;
}

interface LinkEntry {
  peer: Peer;
  link: PeerLink;
  stream: MediaStream | undefined;
  quality: Quality;
  connection: PeerLinkState;
  counters: LossCounters | undefined;
  meter: LevelMeter | undefined;
}

const emptyDevices = (): LocalMedia['devices'] => ({
  audioinput: [],
  videoinput: [],
  audiooutput: [],
});

const initialState = (config: VideoConfigValue): CallState => ({
  phase: 'idle',
  error: undefined,
  participants: [],
  local: {
    stream: undefined,
    audio: config.defaults.audio,
    video: config.defaults.video,
    screen: false,
    error: undefined,
    devices: emptyDevices(),
    selected: { audioinput: undefined, videoinput: undefined, audiooutput: undefined },
    level: 0,
    speaking: false,
    screenStream: undefined,
  },
  layout: config.layout,
  pinnedPeerId: undefined,
  speakerPeerId: undefined,
});

export interface CallOptions {
  ctx: TesseraContext;
  config: VideoConfigValue;
  id: string;
  env?: CallEnv;
  /** Called once when the call is over, so the API can forget the controller. */
  onEnded(): void;
}

/** Creates the controller of one call. It does nothing until `start()` or `join()`. */
export function createCall(opts: CallOptions): CallController {
  const { ctx, config, id } = opts;
  const env = opts.env ?? browserEnv;
  const state = createStore<CallState>(initialState(config));
  const links = new Map<string, LinkEntry>();
  const speaker = createSpeakerDetector();

  let room: Room | undefined;
  let iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS;
  let audioContext: AudioContext | undefined;
  let selfMeter: LevelMeter | undefined;
  let levelTimer: ReturnType<typeof setInterval> | undefined;
  let statsTimer: ReturnType<typeof setInterval> | undefined;
  let lostTimer: ReturnType<typeof setTimeout> | undefined;
  let presence: Awaited<ReturnType<PresenceLike['join']>> | undefined;
  const cleanups: Array<() => void> = [];
  let screenTrack: MediaStreamTrack | undefined;
  let finished = false;
  let starting: Promise<void> | undefined;

  const phaseIs = (...phases: CallPhase[]): boolean => phases.includes(state.get().phase);
  const setLocal = (patch: Partial<LocalMedia>): void =>
    state.set((s) => ({ ...s, local: { ...s.local, ...patch } }));

  // ---------- derived participants ----------

  const publish = (): void => {
    if (!room) return;
    const participants: Participant[] = [];
    for (const peer of room.peers.get()) {
      const entry = links.get(peer.peerId);
      participants.push({
        peerId: peer.peerId,
        user: peer.user,
        stream: entry?.stream,
        audio: peer.presence.audio !== false,
        video: peer.presence.video !== false,
        screen: peer.presence.screen === true,
        speaking: speaker.isSpeaking(peer.peerId),
        quality: entry?.quality ?? 'unknown',
        connection: entry?.connection ?? 'new',
      });
    }
    state.set((s) => ({ ...s, participants }));
  };

  // ---------- local media ----------

  const refreshDevices = async (): Promise<void> => {
    try {
      const devices = await listDevices(env.mediaDevices());
      setLocal({ devices });
    } catch (error) {
      ctx.logger.debug('could not list devices', error);
    }
  };

  const startSelfMeter = (): void => {
    selfMeter?.stop();
    selfMeter = undefined;
    const stream = state.get().local.stream;
    audioContext ??= env.createAudioContext();
    if (!audioContext || !stream) return;
    void audioContext.resume?.();
    selfMeter = createLevelMeter(audioContext, stream);
  };

  const tickLevels = (): void => {
    const levels: Record<string, number> = {};
    const local = state.get().local;
    const own = selfMeter && local.audio ? selfMeter.read() : 0;
    if (selfMeter) levels.self = own;
    for (const [peerId, entry] of links) if (entry.meter) levels[peerId] = entry.meter.read();
    const active = speaker.update(levels, ctx.clock.now());
    batch(() => {
      state.set((s) => ({ ...s, speakerPeerId: active }));
      setLocal({ level: own, speaking: speaker.isSpeaking('self') });
      if (links.size > 0) publish();
    });
  };

  const ensureLevelLoop = (): void => {
    levelTimer ??= setInterval(tickLevels, LEVEL_EVERY_MS);
  };

  const acquire = async (): Promise<void> => {
    const local = state.get().local;
    const { stream, error } = await acquireMedia(
      env.mediaDevices(),
      { audio: true, video: true },
      config.video,
      ctx.logger,
      { audio: local.selected.audioinput, video: local.selected.videoinput },
    );
    // Start with what the defaults ask for; the tracks stay open so toggling is instant.
    for (const track of stream?.getTracks() ?? []) {
      track.enabled = track.kind === 'audio' ? local.audio : local.video;
    }
    const selected = { ...local.selected };
    for (const track of stream?.getTracks() ?? []) {
      const deviceId = track.getSettings().deviceId;
      if (deviceId) selected[track.kind === 'audio' ? 'audioinput' : 'videoinput'] = deviceId;
    }
    setLocal({
      stream,
      error,
      selected,
      audio: !!stream?.getAudioTracks().length && local.audio,
      video: !!stream?.getVideoTracks().length && local.video,
    });
    await refreshDevices();
    startSelfMeter();
    ensureLevelLoop();
  };

  const publishMedia = (): void => {
    const { audio, video, screen } = state.get().local;
    room?.setPresence({ audio, video, screen });
  };

  const replaceEverywhere = async (
    kind: 'audio' | 'video',
    track: MediaStreamTrack | null,
  ): Promise<void> => {
    await Promise.all([...links.values()].map((e) => e.link.replaceTrack(kind, track)));
  };

  const trackOf = (kind: 'audio' | 'video'): MediaStreamTrack | undefined =>
    state
      .get()
      .local.stream?.getTracks()
      .find((t) => t.kind === kind);

  /** Starts a camera or microphone that was missing (permission given later, device plugged in). */
  const addMissing = async (kind: 'audio' | 'video'): Promise<void> => {
    const { stream, error } = await acquireMedia(
      env.mediaDevices(),
      { audio: kind === 'audio', video: kind === 'video' },
      config.video,
      ctx.logger,
    );
    const track = stream?.getTracks()[0];
    if (!track) {
      setLocal({ error });
      return;
    }
    const local = state.get().local;
    let target = local.stream;
    if (target) target.addTrack(track);
    else target = stream;
    setLocal({ stream: target, error: undefined, [kind]: true });
    if (kind === 'audio') startSelfMeter();
    if (!state.get().local.screen || kind === 'audio') await replaceEverywhere(kind, track);
    await refreshDevices();
    publishMedia();
  };

  const toggle = (kind: 'audio' | 'video'): void => {
    const track = trackOf(kind);
    if (!track) {
      void addMissing(kind);
      return;
    }
    track.enabled = !track.enabled;
    setLocal({ [kind]: track.enabled });
    publishMedia();
  };

  // ---------- links ----------

  const createLink = (peer: Peer): LinkEntry => {
    const existing = links.get(peer.peerId);
    if (existing) return existing;
    const self = room?.self.peerId ?? '';
    const pc = env.createPeerConnection({ iceServers });
    const entry: LinkEntry = {
      peer,
      stream: undefined,
      quality: 'unknown',
      connection: 'new',
      counters: undefined,
      meter: undefined,
      link: undefined as unknown as PeerLink,
    };
    entry.link = new PeerLink({
      pc,
      polite: self > peer.peerId,
      local: state.get().local.stream,
      logger: ctx.logger.child('video'),
      send: (signal) => room?.send(peer.peerId, 'rtc.signal', signal),
      onRemoteStream: (stream) => {
        entry.stream = stream;
        entry.meter?.stop();
        audioContext ??= env.createAudioContext();
        entry.meter = audioContext ? createLevelMeter(audioContext, stream) : undefined;
        publish();
      },
      onState: (connection) => {
        entry.connection = connection;
        if (connection === 'closed') removeLink(peer.peerId);
        else publish();
      },
    });
    links.set(peer.peerId, entry);
    // Joining while sharing the screen: the newcomer should see the screen, not the camera.
    if (screenTrack) void entry.link.replaceTrack('video', screenTrack);
    return entry;
  };

  const removeLink = (peerId: string): void => {
    const entry = links.get(peerId);
    if (!entry) return;
    links.delete(peerId);
    entry.meter?.stop();
    entry.link.close();
    speaker.reset();
    publish();
  };

  const syncPeers = (): void => {
    if (!room) return;
    const present = new Set<string>();
    for (const peer of room.peers.get()) {
      present.add(peer.peerId);
      createLink(peer);
    }
    for (const peerId of [...links.keys()]) if (!present.has(peerId)) removeLink(peerId);
    publish();
  };

  const sampleStats = async (): Promise<void> => {
    await Promise.all(
      [...links.values()].map(async (entry) => {
        try {
          const { sample, counters } = summariseStats(await entry.link.stats(), entry.counters);
          entry.counters = counters;
          const quality = classifyQuality(sample);
          if (quality !== entry.quality) entry.quality = quality;
        } catch {
          /* the connection may have just closed */
        }
      }),
    );
    publish();
  };

  // ---------- joining and leaving ----------

  const resolveIce = async (): Promise<void> => {
    if (config.iceServers) {
      iceServers = config.iceServers as RTCIceServer[];
      return;
    }
    if (!config.iceServersUrl) {
      iceServers = DEFAULT_ICE_SERVERS;
      return;
    }
    try {
      const token = await ctx.auth.getToken();
      const res = await env.fetch(config.iceServersUrl, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      const parsed = IceRes.parse(await res.json());
      iceServers = parsed.iceServers as RTCIceServer[];
    } catch (error) {
      // A call with STUN only usually still works; failing to fetch must not block joining.
      ctx.logger.warn('could not fetch ICE servers, using the default STUN server', error);
      iceServers = DEFAULT_ICE_SERVERS;
    }
  };

  const stopLocalMedia = (): void => {
    for (const track of state.get().local.stream?.getTracks() ?? []) track.stop();
    screenTrack?.stop();
    screenTrack = undefined;
    selfMeter?.stop();
    selfMeter = undefined;
  };

  const teardown = async (): Promise<void> => {
    clearInterval(levelTimer);
    clearInterval(statsTimer);
    clearTimeout(lostTimer);
    levelTimer = statsTimer = lostTimer = undefined;
    for (const off of cleanups.splice(0)) off();
    for (const peerId of [...links.keys()]) removeLink(peerId);
    stopLocalMedia();
    void audioContext?.close().catch(() => undefined);
    audioContext = undefined;
    await presence?.leave().catch(() => undefined);
    presence = undefined;
    const joined = room;
    room = undefined;
    await joined?.leave().catch(() => undefined);
  };

  const finish = async (error?: CallError): Promise<void> => {
    if (finished) return;
    finished = true;
    const wasInCall = phaseIs('in-call');
    await teardown();
    // Forget the controller first: whoever reacts to the new phase may ask the API for this call
    // again and should get a fresh one, not this finished one.
    opts.onEnded();
    state.set((s) => ({
      ...s,
      phase: error && error.reason !== 'connection-lost' ? 'error' : 'ended',
      error,
      participants: [],
      speakerPeerId: undefined,
      local: { ...s.local, stream: undefined, screen: false, screenStream: undefined, level: 0 },
    }));
    if (wasInCall) ctx.bus.emit('video:left', { callId: id });
  };

  const watchTransport = (): void => {
    const transport = ctx.transport();
    if (!transport) return;
    cleanups.push(
      transport.state.subscribe((s) => {
        if (s === 'open') {
          clearTimeout(lostTimer);
          lostTimer = undefined;
        } else if ((s === 'reconnecting' || s === 'closed') && !lostTimer) {
          lostTimer = setTimeout(
            () =>
              void finish({
                reason: 'connection-lost',
                message: 'The connection to the call was lost.',
              }),
            CONNECTION_LOST_MS,
          );
        }
      }),
    );
  };

  const connectPresence = async (): Promise<void> => {
    const registry = ctx.services as unknown as { get(id: string): PresenceLike | undefined };
    const kit = registry.get('presence');
    if (!kit) return;
    try {
      presence = await kit.join(`call:${id}`);
      presence.set({ location: 'in-call' });
    } catch (error) {
      ctx.logger.debug('could not announce the call through presence', error);
    }
  };

  const doJoin = async (join?: { audio?: boolean; video?: boolean }): Promise<void> => {
    const transport = ctx.transport();
    if (!transport) throw new TesseraError('ADAPTER_MISSING', 'Video calls need a transport');
    state.set((s) => ({ ...s, phase: 'joining', error: undefined }));
    try {
      if (!state.get().local.stream && !state.get().local.error) await acquire();
      for (const kind of ['audio', 'video'] as const) {
        const want = join?.[kind];
        const track = trackOf(kind);
        if (want !== undefined && track) track.enabled = want;
      }
      setLocal({
        audio: !!trackOf('audio')?.enabled,
        video: !!trackOf('video')?.enabled,
      });
      await resolveIce();

      const joined = await transport.join(`call:${id}`, {
        presence: {
          audio: state.get().local.audio,
          video: state.get().local.video,
          screen: false,
        },
      });
      room = joined;
      if (joined.peers.get().length + 1 > config.maxParticipants) {
        await joined.leave().catch(() => undefined);
        room = undefined;
        throw new TesseraError('FORBIDDEN', 'This call is full', {
          details: { reason: 'room-full' },
        });
      }

      cleanups.push(
        joined.peers.subscribe(syncPeers),
        joined.on('rtc.signal', (data, from) => {
          if (from === 'server') return;
          const parsed = RtcSignal.safeParse(data);
          if (!parsed.success) return;
          // A signal can beat the peer list: create the link when its first signal arrives.
          const entry = links.get(from.peerId) ?? createLink(from);
          void entry.link.handleSignal(parsed.data as never);
        }),
      );
      watchTransport();
      syncPeers();
      statsTimer = setInterval(() => void sampleStats(), STATS_EVERY_MS);
      ensureLevelLoop();
      await connectPresence();
      state.set((s) => ({ ...s, phase: 'in-call' }));
      ctx.bus.emit('video:joined', { callId: id });
    } catch (error) {
      await teardown();
      const full =
        TesseraError.is(error, 'FORBIDDEN') &&
        (error.details as { reason?: string } | undefined)?.reason === 'room-full';
      const failure: CallError = full
        ? { reason: 'room-full', message: 'This call is full.' }
        : { reason: 'unknown', message: error instanceof Error ? error.message : String(error) };
      finished = true;
      opts.onEnded();
      state.set((s) => ({ ...s, phase: 'error', error: failure }));
      throw error;
    }
  };

  // ---------- controller ----------

  const devicechange = (): void => void refreshDevices();
  const devices = env.mediaDevices();
  devices?.addEventListener?.('devicechange', devicechange);

  const requirePhase = (action: string, ...allowed: CallPhase[]): void => {
    if (!phaseIs(...allowed)) {
      throw new TesseraError(
        'VALIDATION',
        `Cannot ${action} while the call is ${state.get().phase}`,
      );
    }
  };

  const controller: CallController = {
    id,
    state,

    async start() {
      if (starting) return starting;
      requirePhase('start', 'idle');
      state.set((s) => ({ ...s, phase: 'prejoin' }));
      starting = (async () => {
        try {
          await acquire();
          if (!config.prejoin) await doJoin();
        } finally {
          starting = undefined;
        }
      })();
      return starting;
    },

    async join(joinOpts) {
      if (starting) await starting;
      if (phaseIs('in-call', 'joining')) return;
      requirePhase('join', 'idle', 'prejoin');
      await doJoin(joinOpts);
    },

    async leave() {
      await finish();
    },

    toggleAudio: () => toggle('audio'),
    toggleVideo: () => toggle('video'),

    async startScreenShare() {
      if (!config.allow.screenShare) {
        throw new TesseraError('FORBIDDEN', 'Screen sharing is turned off');
      }
      requirePhase('share the screen', 'in-call');
      if (state.get().local.screen) return;
      const display = env.mediaDevices()?.getDisplayMedia;
      if (!display)
        throw new TesseraError('ADAPTER_MISSING', 'This browser cannot share the screen');
      const stream = await env.mediaDevices()?.getDisplayMedia?.({ video: true, audio: false });
      const track = stream?.getVideoTracks()[0];
      if (!stream || !track) return;
      screenTrack = track;
      track.onended = () => controller.stopScreenShare();
      await replaceEverywhere('video', track);
      setLocal({ screen: true, screenStream: stream });
      publishMedia();
    },

    stopScreenShare() {
      if (!screenTrack) return;
      screenTrack.onended = null;
      screenTrack.stop();
      screenTrack = undefined;
      // Back to the camera, or to sending nothing if there is none.
      const camera = trackOf('video');
      void replaceEverywhere('video', camera ?? null);
      setLocal({ screen: false, screenStream: undefined });
      publishMedia();
    },

    async selectDevice(kind: DeviceKind, deviceId: string) {
      if (kind === 'audiooutput') {
        // The tiles apply it with setSinkId where the browser supports that.
        setLocal({ selected: { ...state.get().local.selected, audiooutput: deviceId } });
        return;
      }
      const mediaKind = kind === 'audioinput' ? 'audio' : 'video';
      const { stream, error } = await acquireMedia(
        env.mediaDevices(),
        { audio: mediaKind === 'audio', video: mediaKind === 'video' },
        config.video,
        ctx.logger,
        { [mediaKind]: deviceId },
      );
      const next = stream?.getTracks()[0];
      if (!next) {
        setLocal({ error });
        throw new TesseraError('UNKNOWN', error?.message ?? 'Could not switch the device');
      }
      const local = state.get().local;
      const old = trackOf(mediaKind);
      next.enabled = old?.enabled ?? local[mediaKind];
      const target = local.stream;
      if (old) target?.removeTrack(old);
      target?.addTrack(next);
      setLocal({
        stream: target ?? stream,
        selected: { ...local.selected, [kind]: deviceId },
        error: undefined,
        [mediaKind]: next.enabled,
      });
      if (mediaKind === 'audio') startSelfMeter();
      // While sharing the screen the outgoing video is the screen, so leave it alone.
      if (mediaKind === 'audio' || !screenTrack) await replaceEverywhere(mediaKind, next);
      old?.stop();
      publishMedia();
    },

    setLayout(layout) {
      state.set((s) => ({ ...s, layout }));
    },

    pin(peerId) {
      state.set((s) => ({
        ...s,
        pinnedPeerId: peerId,
        ...(peerId ? { layout: 'spotlight' as const } : {}),
      }));
    },
  };

  // A call that ended leaves nothing behind.
  cleanups.push(() => devices?.removeEventListener?.('devicechange', devicechange));
  return controller;
}
