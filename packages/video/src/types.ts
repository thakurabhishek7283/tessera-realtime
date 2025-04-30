import type { ReadonlyStore, UserInfo } from '@tessera/core';
import type { VideoConfigValue } from './config.js';
import type { PeerLinkState } from './peer-link.js';
import type { Quality } from './quality.js';

export type { PeerLinkState, Quality };

export type CallPhase = 'idle' | 'prejoin' | 'joining' | 'in-call' | 'ended' | 'error';

export type CallErrorReason =
  | 'permission-denied'
  | 'no-device'
  | 'room-full'
  | 'connection-lost'
  | 'unsupported'
  | 'unknown';

export interface CallError {
  reason: CallErrorReason;
  message: string;
}

export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

export interface Device {
  id: string;
  label: string;
}

export interface LocalMedia {
  /** The camera and microphone stream shown in the self view. */
  stream: MediaStream | undefined;
  audio: boolean;
  video: boolean;
  screen: boolean;
  /** Why no camera or microphone is available, if that is so. The call can still be joined. */
  error: CallError | undefined;
  devices: Record<DeviceKind, Device[]>;
  selected: Record<DeviceKind, string | undefined>;
  /** Microphone level 0–1, for the preview meter. */
  level: number;
  speaking: boolean;
  /** The stream of the shared screen, while sharing. */
  screenStream: MediaStream | undefined;
}

export interface Participant {
  peerId: string;
  user: UserInfo;
  stream: MediaStream | undefined;
  audio: boolean;
  video: boolean;
  screen: boolean;
  speaking: boolean;
  quality: Quality;
  connection: PeerLinkState;
}

export interface CallState {
  phase: CallPhase;
  error: CallError | undefined;
  /** Everyone else in the call. */
  participants: Participant[];
  local: LocalMedia;
  layout: 'grid' | 'spotlight';
  pinnedPeerId: string | undefined;
  /** The current active speaker (a peer id, or `'self'`). */
  speakerPeerId: string | undefined;
}

export interface CallController {
  readonly id: string;
  readonly state: ReadonlyStore<CallState>;
  /** Asks for the camera and microphone and shows the preview (or joins at once without `prejoin`). */
  start(): Promise<void>;
  join(opts?: { audio?: boolean; video?: boolean }): Promise<void>;
  leave(): Promise<void>;
  toggleAudio(): void;
  toggleVideo(): void;
  startScreenShare(): Promise<void>;
  stopScreenShare(): void;
  selectDevice(kind: DeviceKind, deviceId: string): Promise<void>;
  setLayout(layout: 'grid' | 'spotlight'): void;
  pin(peerId?: string): void;
}

export interface VideoApi {
  readonly config: VideoConfigValue;
  /** The controller of a call. The same id returns the same controller until that call has ended. */
  call(callId: string): CallController;
}

declare module '@tessera/core' {
  interface FeatureApiMap {
    video: VideoApi;
  }
  interface ServiceMap {
    video: VideoApi;
  }
  interface TesseraEvents {
    'video:joined': { callId: string };
    'video:left': { callId: string };
  }
}
