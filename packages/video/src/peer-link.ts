import type { Logger } from '@tessera-kit/core';

export type PeerLinkState = 'new' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

/** What peers exchange to set up a connection (`rtc.signal` payload). */
export interface Signal {
  description?:
    | { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp?: string | undefined }
    | undefined;
  candidate?: RTCIceCandidateInit | null | undefined;
}

export interface PeerLinkOptions {
  pc: RTCPeerConnection;
  /** The polite peer backs out of a colliding offer; the impolite one ignores it. */
  polite: boolean;
  send(signal: Signal): void;
  /** The local stream whose tracks are sent, if any. */
  local: MediaStream | undefined;
  onRemoteStream(stream: MediaStream): void;
  onState(state: PeerLinkState): void;
  logger: Logger;
  /** How long ICE may stay `disconnected` before a restart. Default 8 s. */
  disconnectGraceMs?: number;
  /** Failed restarts in a row before the link gives up. Default 5. */
  maxRestarts?: number;
}

/**
 * One RTCPeerConnection to one remote peer, negotiated with the "perfect negotiation" pattern: both
 * sides may offer at any time, and a collision is settled by the polite side rolling back. ICE
 * trouble triggers an ICE restart, never a new connection.
 */
export class PeerLink {
  state: PeerLinkState = 'new';
  readonly pc: RTCPeerConnection;
  readonly #opts: PeerLinkOptions;
  #queue: Promise<void> = Promise.resolve();
  #attached = false;
  #makingOffer = false;
  #ignoreOffer = false;
  #remote: MediaStream | undefined;
  #disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #restarts = 0;
  #everConnected = false;

  constructor(opts: PeerLinkOptions) {
    this.#opts = opts;
    this.pc = opts.pc;
    const { pc } = this;

    pc.onnegotiationneeded = () => void this.#negotiate();
    pc.onicecandidate = ({ candidate }) => {
      opts.send({ candidate: candidate ? candidate.toJSON() : null });
    };
    pc.ontrack = ({ track, streams }) => {
      let stream = streams[0];
      if (!stream) {
        this.#remote ??= new MediaStream();
        this.#remote.addTrack(track);
        stream = this.#remote;
      }
      opts.onRemoteStream(stream);
    };
    pc.oniceconnectionstatechange = () => this.#onIce();

    // Exactly one side makes the first offer: the impolite one. If both did, the polite side would
    // roll back mid-gathering, which some browsers answer by never gathering candidates again.
    // The polite side attaches its tracks when that offer arrives.
    if (!opts.polite) this.#attachLocal();
    this.#set('connecting');
  }

  /**
   * Gives the connection both directions for audio and video, so a track that appears later
   * (camera turned on, screen shared) is a `replaceTrack`, not a renegotiation. Reuses the
   * transceivers a remote offer created.
   */
  #attachLocal(): void {
    if (this.#attached) return;
    this.#attached = true;
    const { pc } = this;
    const local = this.#opts.local;
    for (const kind of ['audio', 'video'] as const) {
      const track = local?.getTracks().find((t) => t.kind === kind);
      const free = pc
        .getTransceivers()
        .find((t) => t.receiver.track.kind === kind && !t.sender.track);
      if (free) {
        free.direction = 'sendrecv';
        if (track && local) {
          free.sender.setStreams?.(local);
          void free.sender.replaceTrack(track);
        }
      } else if (track && local) pc.addTrack(track, local);
      else pc.addTransceiver(kind, { direction: 'sendrecv' });
    }
  }

  #set(state: PeerLinkState): void {
    if (this.state === state || this.state === 'closed') return;
    this.state = state;
    this.#opts.onState(state);
  }

  async #negotiate(): Promise<void> {
    const { pc } = this;
    try {
      this.#makingOffer = true;
      await pc.setLocalDescription();
      this.#opts.send({ description: pc.localDescription?.toJSON() ?? undefined });
    } catch (error) {
      this.#opts.logger.warn('could not create an offer', error);
    } finally {
      this.#makingOffer = false;
    }
  }

  /**
   * Applies a description or ICE candidate received from the remote peer. Signals are applied one
   * at a time: a candidate that follows its description closely must wait until the description
   * has really been applied, or the browser rejects it and the connection loses a route.
   */
  handleSignal(signal: Signal): Promise<void> {
    this.#queue = this.#queue.then(() => this.#apply(signal));
    return this.#queue;
  }

  async #apply({ description, candidate }: Signal): Promise<void> {
    const { pc } = this;
    if (this.state === 'closed') return;
    try {
      if (description) {
        const collision =
          description.type === 'offer' && (this.#makingOffer || pc.signalingState !== 'stable');
        this.#ignoreOffer = !this.#opts.polite && collision;
        if (this.#ignoreOffer) return;
        await pc.setRemoteDescription(description as RTCSessionDescriptionInit);
        if (description.type === 'offer') {
          this.#attachLocal();
          await pc.setLocalDescription();
          this.#opts.send({ description: pc.localDescription?.toJSON() ?? undefined });
        }
      } else if (candidate !== undefined) {
        try {
          await pc.addIceCandidate(candidate ?? undefined);
        } catch (error) {
          // Candidates that belong to an offer we chose to ignore are expected to be rejected.
          if (!this.#ignoreOffer) throw error;
        }
      }
    } catch (error) {
      this.#opts.logger.warn('could not apply a signal', error);
    }
  }

  #onIce(): void {
    const ice = this.pc.iceConnectionState;
    if (ice === 'connected' || ice === 'completed') {
      clearTimeout(this.#disconnectTimer);
      this.#restarts = 0;
      this.#everConnected = true;
      this.#set('connected');
    } else if (ice === 'disconnected') {
      if (!this.#everConnected) return;
      this.#set('reconnecting');
      clearTimeout(this.#disconnectTimer);
      // Brief network blips fix themselves; only restart when it lasts.
      this.#disconnectTimer = setTimeout(
        () => this.#restart(),
        this.#opts.disconnectGraceMs ?? 8000,
      );
    } else if (ice === 'failed') {
      this.#set('reconnecting');
      this.#restart();
    } else if (ice === 'closed') {
      this.close();
    }
  }

  #restart(): void {
    if (this.state === 'closed') return;
    this.#restarts += 1;
    if (this.#restarts > (this.#opts.maxRestarts ?? 5)) {
      this.#opts.logger.warn('giving up on a connection after repeated ICE restarts');
      this.close();
      return;
    }
    this.pc.restartIce();
  }

  /** Swaps the track sent for `kind` (or stops sending it with `null`) without renegotiating. */
  async replaceTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null): Promise<void> {
    const transceiver = this.pc.getTransceivers().find((t) => t.receiver.track.kind === kind);
    if (!transceiver) return;
    await transceiver.sender.replaceTrack(track);
  }

  stats(): Promise<RTCStatsReport> {
    return this.pc.getStats();
  }

  close(): void {
    if (this.state === 'closed') return;
    clearTimeout(this.#disconnectTimer);
    this.#set('closed');
    this.pc.onnegotiationneeded = null;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.close();
  }
}
