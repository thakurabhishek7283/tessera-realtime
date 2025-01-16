import type { ReadonlyStore, UserInfo } from '@tessera/core';
import type { PresenceConfigValue } from './config.js';

export type PresenceStatus = 'active' | 'idle' | 'away';

/** What a peer publishes about itself. Every field is optional. */
export interface PresenceState {
  status?: PresenceStatus;
  /** Free-form place in the app, e.g. a page path or a document id. */
  location?: string;
  /** Pointer position as fractions (0–1) of the shared container. `null` hides the cursor. */
  cursor?: { x: number; y: number } | null;
}

/** One person, however many tabs or devices they are using. */
export interface PresenceUser {
  id: string;
  name: string;
  avatarUrl?: string;
  color?: string;
  /** The most active status among the user's connections. */
  status: PresenceStatus;
  location?: string;
  /** True for the current user (only present when `showSelf` is on). */
  self: boolean;
  /** One entry per open tab or device. */
  peerIds: string[];
}

/** A pointer somewhere in the shared container; one per connection, not per user. */
export interface PresenceCursor {
  peerId: string;
  user: UserInfo;
  x: number;
  y: number;
  /** Local time of the last update, for fading idle cursors. */
  updatedAt: number;
}

export interface PresenceHandle {
  readonly scope: string;
  /** Everyone in the scope, deduped by user id and ordered by who joined first. */
  readonly peers: ReadonlyStore<PresenceUser[]>;
  /** Other connections' pointers. */
  readonly cursors: ReadonlyStore<PresenceCursor[]>;
  /** Publishes a change of this connection's state. Overrides the automatic status until it changes. */
  set(state: PresenceState): void;
  leave(): Promise<void>;
}

export interface PresenceApi {
  readonly config: PresenceConfigValue;
  /**
   * Joins a scope (a page, a document…). Joining the same scope twice returns the same handle;
   * the scope is left when every caller has left.
   */
  join(scope?: string): Promise<PresenceHandle>;
}

declare module '@tessera/core' {
  interface FeatureApiMap {
    presence: PresenceApi;
  }
}
