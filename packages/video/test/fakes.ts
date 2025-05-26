/**
 * Stand-ins for the parts of WebRTC the call logic touches, so negotiation, glare and ICE
 * restarts can be tested without a browser. They follow the signalling state machine of the spec.
 */

let nextId = 0;

export class FakeTrack {
  readonly id = `track-${++nextId}`;
  enabled = true;
  readyState: 'live' | 'ended' = 'live';
  onended: (() => void) | null = null;
  constructor(
    readonly kind: 'audio' | 'video',
    readonly label = `${kind} device`,
    readonly deviceId = `${kind}-default`,
  ) {}
  stop(): void {
    this.readyState = 'ended';
  }
  end(): void {
    this.readyState = 'ended';
    this.onended?.();
  }
  getSettings(): { deviceId: string } {
    return { deviceId: this.deviceId };
  }
}

export class FakeStream {
  readonly id = `stream-${++nextId}`;
  constructor(private tracks: FakeTrack[] = []) {}
  getTracks(): FakeTrack[] {
    return [...this.tracks];
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  addTrack(track: FakeTrack): void {
    this.tracks.push(track);
  }
  removeTrack(track: FakeTrack): void {
    this.tracks = this.tracks.filter((t) => t !== track);
  }
}

// The code under test only needs `new MediaStream()`; give node something to construct.
(globalThis as { MediaStream?: unknown }).MediaStream ??= FakeStream;

interface FakeTransceiver {
  mid: string;
  direction: string;
  sender: {
    track: FakeTrack | null;
    replaceTrack(track: FakeTrack | null): Promise<void>;
    setStreams(...streams: unknown[]): void;
  };
  receiver: { track: { kind: 'audio' | 'video' } };
}

type Description = { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp?: string };

export class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = [];
  signalingState: 'stable' | 'have-local-offer' | 'have-remote-offer' = 'stable';
  iceConnectionState: 'new' | 'checking' | 'connected' | 'disconnected' | 'failed' | 'closed' =
    'new';
  localDescription: { type: string; sdp: string; toJSON(): Description } | null = null;
  remoteDescription: Description | null = null;
  onnegotiationneeded: (() => void) | null = null;
  onicecandidate: ((e: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null =
    null;
  ontrack: ((e: { track: FakeTrack; streams: FakeStream[] }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  readonly transceivers: FakeTransceiver[] = [];
  readonly offersMade: number[] = [];
  readonly candidates: unknown[] = [];
  /** Milliseconds `setRemoteDescription` takes, like a real browser. */
  remoteDelayMs = 0;
  rollbacks = 0;
  iceRestarts = 0;
  closed = false;
  #needed = false;
  #announced = false;
  #seq = 0;

  constructor(readonly config?: unknown) {
    FakeRTCPeerConnection.instances.push(this);
  }

  #scheduleNegotiation(): void {
    if (this.#needed) return;
    this.#needed = true;
    queueMicrotask(() => {
      this.#needed = false;
      if (this.signalingState === 'stable' && !this.closed) this.onnegotiationneeded?.();
    });
  }

  addTrack(track: FakeTrack, _stream: FakeStream): { track: FakeTrack } {
    // Like browsers: reuse a transceiver of that kind that is not sending yet.
    const free = this.transceivers.find(
      (t) => t.receiver.track.kind === track.kind && !t.sender.track,
    );
    if (free) {
      free.sender.track = track;
      free.direction = 'sendrecv';
    } else this.#addTransceiver(track.kind, track);
    return { track };
  }

  addTransceiver(kind: 'audio' | 'video', init?: { direction?: string }): FakeTransceiver {
    return this.#addTransceiver(kind, null, init?.direction);
  }

  #addTransceiver(
    kind: 'audio' | 'video',
    track: FakeTrack | null,
    direction = 'sendrecv',
  ): FakeTransceiver {
    const t: FakeTransceiver = {
      mid: String(this.transceivers.length),
      direction,
      sender: {
        track,
        replaceTrack: async (next) => {
          t.sender.track = next;
        },
        setStreams: () => undefined,
      },
      receiver: { track: { kind } },
    };
    this.transceivers.push(t);
    this.#scheduleNegotiation();
    return t;
  }

  getTransceivers(): FakeTransceiver[] {
    return this.transceivers;
  }

  getSenders(): FakeTransceiver['sender'][] {
    return this.transceivers.map((t) => t.sender);
  }

  async setLocalDescription(desc?: Description): Promise<void> {
    if (desc?.type === 'rollback') {
      this.signalingState = 'stable';
      this.localDescription = null;
      return;
    }
    if (this.signalingState === 'have-remote-offer') {
      this.localDescription = this.#describe('answer');
      this.signalingState = 'stable';
      this.#connected();
    } else {
      this.localDescription = this.#describe('offer');
      this.signalingState = 'have-local-offer';
      this.offersMade.push(++this.#seq);
    }
  }

  #describe(type: 'offer' | 'answer') {
    const description: Description = { type, sdp: `fake-${type}-${++this.#seq}` };
    return { ...description, sdp: description.sdp as string, toJSON: () => description };
  }

  async setRemoteDescription(desc: Description): Promise<void> {
    if (this.remoteDelayMs > 0) await new Promise((r) => setTimeout(r, this.remoteDelayMs));
    if (desc.type === 'offer') {
      if (this.signalingState === 'have-local-offer') {
        // Implicit rollback, as browsers do for the polite peer.
        this.rollbacks += 1;
        this.signalingState = 'stable';
      }
      if (this.signalingState !== 'stable')
        throw new DOMException('wrong state', 'InvalidStateError');
      this.remoteDescription = desc;
      this.signalingState = 'have-remote-offer';
      // A remote offer brings its own transceivers, which start out receive-only.
      for (const kind of ['audio', 'video'] as const) {
        if (!this.transceivers.some((t) => t.receiver.track.kind === kind)) {
          this.#addTransceiver(kind, null, 'recvonly');
        }
      }
    } else if (desc.type === 'answer') {
      if (this.signalingState !== 'have-local-offer') {
        throw new DOMException(
          `cannot apply an answer in ${this.signalingState}`,
          'InvalidStateError',
        );
      }
      this.remoteDescription = desc;
      this.signalingState = 'stable';
      this.#connected();
    }
  }

  #connected(): void {
    if (this.#announced) return;
    this.#announced = true;
    for (const kind of ['audio', 'video'] as const) {
      const stream = new FakeStream();
      const track = new FakeTrack(kind, `remote ${kind}`);
      stream.addTrack(track);
      queueMicrotask(() => this.ontrack?.({ track, streams: [stream] }));
    }
    queueMicrotask(() => this.fireIce('connected'));
  }

  async addIceCandidate(candidate?: unknown): Promise<void> {
    if (!this.remoteDescription)
      throw new DOMException('no remote description', 'InvalidStateError');
    this.candidates.push(candidate);
  }

  restartIce(): void {
    this.iceRestarts += 1;
    this.#scheduleNegotiation();
  }

  fireIce(state: FakeRTCPeerConnection['iceConnectionState']): void {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
  }

  async getStats(): Promise<{ forEach(fn: (e: unknown) => void): void }> {
    return { forEach: () => undefined };
  }

  close(): void {
    this.closed = true;
    this.iceConnectionState = 'closed';
  }
}

export function installFakeWebRtc(): void {
  (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = FakeRTCPeerConnection;
}
