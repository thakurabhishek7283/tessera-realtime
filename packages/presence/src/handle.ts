import {
  batch,
  createStore,
  type Peer,
  type Room,
  type TesseraContext,
  type UserInfo,
} from '@tessera-kit/core';
import { type ActivityOptions, type ActivityTracker, trackActivity } from './activity.js';
import type { PresenceConfigValue } from './config.js';
import type {
  PresenceCursor,
  PresenceHandle,
  PresenceState,
  PresenceStatus,
  PresenceUser,
} from './types.js';

const RANK: Record<PresenceStatus, number> = { away: 0, idle: 1, active: 2 };
const STATUSES = new Set<string>(['active', 'idle', 'away']);

const statusOf = (value: unknown): PresenceStatus =>
  typeof value === 'string' && STATUSES.has(value) ? (value as PresenceStatus) : 'active';

const cursorOf = (value: unknown): { x: number; y: number } | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : undefined;
};

/** One entry per user id; a user with several tabs shows the status of the most active one. */
export function groupPeers(peers: readonly Peer[], selfId: string | undefined): PresenceUser[] {
  const byUser = new Map<string, Peer[]>();
  // Peer ids sort by connection time, which is the order people arrived in.
  for (const peer of [...peers].sort((a, b) => a.peerId.localeCompare(b.peerId))) {
    const list = byUser.get(peer.user.id);
    if (list) list.push(peer);
    else byUser.set(peer.user.id, [peer]);
  }
  const users: PresenceUser[] = [];
  for (const [id, group] of byUser) {
    let best = group[0] as Peer;
    for (const peer of group) {
      if (RANK[statusOf(peer.presence.status)] > RANK[statusOf(best.presence.status)]) best = peer;
    }
    const { user } = best;
    const location = best.presence.location;
    users.push({
      id,
      name: user.name,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      ...(user.color ? { color: user.color } : {}),
      status: statusOf(best.presence.status),
      ...(typeof location === 'string' ? { location } : {}),
      self: id === selfId,
      peerIds: group.map((p) => p.peerId),
    });
  }
  return users;
}

export interface HandleOptions {
  ctx: TesseraContext;
  config: PresenceConfigValue;
  scope: string;
  room: Room;
  /** For tests: where input events and visibility come from. */
  activity?: Pick<ActivityOptions, 'target' | 'hidden' | 'visibility'>;
}

/** What the API shares between callers of the same scope. */
export interface SharedPresence extends Omit<PresenceHandle, 'leave'> {
  /** Stops tracking and leaves the room. */
  dispose(): Promise<void>;
}

/** Wraps an already-joined `presence:<scope>` room. */
export function createPresenceHandle(opts: HandleOptions): SharedPresence {
  const { ctx, config, scope, room } = opts;
  const self: UserInfo = room.self.user;
  const local = createStore<PresenceState>({ status: 'active' });
  const peers = createStore<PresenceUser[]>([]);
  const cursors = createStore<PresenceCursor[]>([]);
  const seen = new Map<string, { x: number; y: number; at: number }>();
  let left = false;

  const selfPeer = (): Peer => ({
    peerId: room.self.peerId,
    user: self,
    presence: { ...local.get() },
  });

  const recompute = (): void => {
    const others = room.peers.get();
    const all = config.showSelf ? [selfPeer(), ...others] : others;
    const visible = config.showSelf ? all : all.filter((p) => p.user.id !== self.id);
    // Keep each pointer's last update so cursors can fade; forget connections that left.
    const now = ctx.clock.now();
    const next: PresenceCursor[] = [];
    const alive = new Set<string>();
    for (const peer of others) {
      alive.add(peer.peerId);
      const point = cursorOf(peer.presence.cursor);
      if (!point) {
        seen.delete(peer.peerId);
        continue;
      }
      const before = seen.get(peer.peerId);
      const moved = !before || before.x !== point.x || before.y !== point.y;
      const entry = moved ? { ...point, at: now } : before;
      seen.set(peer.peerId, entry);
      next.push({
        peerId: peer.peerId,
        user: peer.user,
        x: point.x,
        y: point.y,
        updatedAt: entry.at,
      });
    }
    for (const id of [...seen.keys()]) if (!alive.has(id)) seen.delete(id);
    batch(() => {
      peers.set(groupPeers(visible, config.showSelf ? self.id : undefined));
      cursors.set(next);
    });
  };

  const offs = [room.peers.subscribe(recompute), local.subscribe(recompute)];

  const publish = (state: PresenceState): void => {
    local.set((prev) => ({ ...prev, ...state }));
    room.setPresence({ ...state });
  };

  const tracker: ActivityTracker = trackActivity({
    idleAfterMs: config.idleAfterMs,
    now: () => ctx.clock.now(),
    onChange: (status) => publish({ status }),
    ...opts.activity,
  });
  // The room was joined as `active`; correct that when the tab starts out hidden.
  if (tracker.status() !== 'active') publish({ status: tracker.status() });
  recompute();

  return {
    scope,
    peers,
    cursors,
    set: (state) => {
      if (!left) publish(state);
    },
    async dispose() {
      if (left) return;
      left = true;
      tracker.stop();
      for (const off of offs) off();
      await room.leave();
    },
  };
}
