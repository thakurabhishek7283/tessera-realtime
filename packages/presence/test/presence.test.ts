import { alice, bob, carol, FakeHub } from '@tessera/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackActivity } from '../src/activity.js';
import { groupPeers } from '../src/handle.js';
import { tab } from './helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('presence handle', () => {
  it('shows other people but not the current user', async () => {
    const hub = new FakeHub();
    const a = await tab(hub, alice);
    const b = await tab(hub, bob);
    const ha = await a.api.join('page');
    const hb = await b.api.join('page');
    await hub.settle();
    expect(ha.peers.get().map((u) => u.id)).toEqual(['bob']);
    expect(hb.peers.get().map((u) => u.id)).toEqual(['alice']);
  });

  it('lists people in the order they arrived', async () => {
    const hub = new FakeHub();
    const a = await tab(hub, alice);
    const ha = await a.api.join('page');
    for (const user of [carol, bob]) await (await tab(hub, user)).api.join('page');
    await hub.settle();
    expect(ha.peers.get().map((u) => u.id)).toEqual(['carol', 'bob']);
  });

  it('merges one person in two tabs into one entry with the most active status', async () => {
    const hub = new FakeHub();
    const watcher = await (await tab(hub, alice)).api.join('page');
    const bob1 = await (await tab(hub, bob)).api.join('page');
    const bob2 = await (await tab(hub, bob)).api.join('page');
    await hub.settle();
    bob1.set({ status: 'idle' });
    bob2.set({ status: 'away' });
    await hub.settle();
    const [only, ...rest] = watcher.peers.get();
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ id: 'bob', status: 'idle' });
    expect(only?.peerIds).toHaveLength(2);
    bob2.set({ status: 'active' });
    await hub.settle();
    expect(watcher.peers.get()[0]?.status).toBe('active');
  });

  it('includes the current user when showSelf is on, marked as self', async () => {
    const hub = new FakeHub();
    const a = await tab(hub, alice, { showSelf: true });
    const ha = await a.api.join('page');
    await (await tab(hub, bob)).api.join('page');
    await hub.settle();
    const list = ha.peers.get();
    expect(list.map((u) => [u.id, u.self])).toEqual([
      ['alice', true],
      ['bob', false],
    ]);
  });

  it('does not count the current user’s other tabs unless showSelf is on', async () => {
    const hub = new FakeHub();
    const first = await (await tab(hub, alice)).api.join('page');
    await (await tab(hub, alice)).api.join('page');
    await hub.settle();
    expect(first.peers.get()).toEqual([]);
  });

  it('publishes status and location changes', async () => {
    const hub = new FakeHub();
    const ha = await (await tab(hub, alice)).api.join('page');
    const hb = await (await tab(hub, bob)).api.join('page');
    await hub.settle();
    hb.set({ location: '/pricing', status: 'idle' });
    await hub.settle();
    expect(ha.peers.get()[0]).toMatchObject({ location: '/pricing', status: 'idle' });
  });

  it('drops a person when their tab goes away', async () => {
    const hub = new FakeHub();
    const ha = await (await tab(hub, alice)).api.join('page');
    const b = await tab(hub, bob);
    await b.api.join('page');
    await hub.settle();
    expect(ha.peers.get()).toHaveLength(1);
    await b.instance.destroy();
    await hub.settle();
    expect(ha.peers.get()).toEqual([]);
  });

  it('shares one room between callers of the same scope and leaves with the last one', async () => {
    const hub = new FakeHub();
    const a = await tab(hub, alice);
    const one = await a.api.join('page');
    const two = await a.api.join('page');
    expect(one.peers).toBe(two.peers);
    expect(hub.members('presence:page')).toHaveLength(1);
    await one.leave();
    expect(hub.members('presence:page')).toHaveLength(1);
    await two.leave();
    expect(hub.members('presence:page')).toHaveLength(0);
  });

  it('keeps scopes apart', async () => {
    const hub = new FakeHub();
    const ha = await (await tab(hub, alice)).api.join('one');
    await (await tab(hub, bob)).api.join('two');
    await hub.settle();
    expect(ha.peers.get()).toEqual([]);
  });

  it('tracks other people’s pointers and forgets them when hidden or gone', async () => {
    const hub = new FakeHub();
    const ha = await (await tab(hub, alice)).api.join('page');
    const hb = await (await tab(hub, bob)).api.join('page');
    await hub.settle();
    hb.set({ cursor: { x: 0.25, y: 0.5 } });
    await hub.settle();
    expect(ha.cursors.get()).toMatchObject([{ user: { id: 'bob' }, x: 0.25, y: 0.5 }]);
    hb.set({ cursor: null });
    await hub.settle();
    expect(ha.cursors.get()).toEqual([]);
  });

  it('ignores malformed presence from other peers', async () => {
    const hub = new FakeHub();
    const ha = await (await tab(hub, alice)).api.join('page');
    const hb = await (await tab(hub, bob)).api.join('page');
    await hub.settle();
    hb.set({ status: 'sleeping' as never, cursor: { x: Number.NaN, y: 1 } });
    await hub.settle();
    expect(ha.peers.get()[0]?.status).toBe('active');
    expect(ha.cursors.get()).toEqual([]);
  });
});

describe('groupPeers', () => {
  it('groups by user id and ranks status', () => {
    const peer = (peerId: string, id: string, status: string) => ({
      peerId,
      user: { id, name: id },
      presence: { status },
    });
    const users = groupPeers(
      [peer('b', 'x', 'away'), peer('a', 'x', 'idle'), peer('c', 'y', 'active')],
      'y',
    );
    expect(users.map((u) => [u.id, u.status, u.self, u.peerIds])).toEqual([
      ['x', 'idle', false, ['a', 'b']],
      ['y', 'active', true, ['c']],
    ]);
  });
});

describe('activity tracking', () => {
  const setup = (hidden = false) => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const visibility = new EventTarget();
    const state = { hidden };
    const seen: string[] = [];
    const tracker = trackActivity({
      idleAfterMs: 1000,
      now: () => Date.now(),
      onChange: (s) => seen.push(s),
      target,
      visibility,
      hidden: () => state.hidden,
    });
    return { target, visibility, state, seen, tracker };
  };

  it('goes idle after the timeout and active again on input', () => {
    const { target, seen, tracker } = setup();
    vi.advanceTimersByTime(999);
    expect(tracker.status()).toBe('active');
    vi.advanceTimersByTime(2);
    expect(seen).toEqual(['idle']);
    target.dispatchEvent(new Event('pointermove'));
    expect(seen).toEqual(['idle', 'active']);
  });

  it('postpones idle while the user keeps interacting', () => {
    const { target, seen } = setup();
    vi.advanceTimersByTime(800);
    target.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(800);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(300);
    expect(seen).toEqual(['idle']);
  });

  it('is away while the page is hidden, whatever the input', () => {
    const { target, visibility, state, seen, tracker } = setup();
    state.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(tracker.status()).toBe('away');
    target.dispatchEvent(new Event('pointermove'));
    expect(seen).toEqual(['away']);
    state.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual(['away', 'active']);
  });

  it('starts away when the page is already hidden', () => {
    expect(setup(true).tracker.status()).toBe('away');
  });

  it('stops listening', () => {
    const { target, seen, tracker } = setup();
    tracker.stop();
    vi.advanceTimersByTime(5000);
    target.dispatchEvent(new Event('pointermove'));
    expect(seen).toEqual([]);
  });
});
