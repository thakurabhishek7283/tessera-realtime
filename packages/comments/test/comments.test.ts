import type { StorageAdapter } from '@tessera-kit/core';
import { alice, bob, carol, FakeHub } from '@tessera-kit/testing';
import { describe, expect, it } from 'vitest';
import { type Comment, summarise } from '../src/index.js';
import { createWorld, until } from './env.js';

const text = (t: string) => ({ type: 'text' as const, text: t });
const bodies = (c: {
  state: { get(): { comments: Array<{ body: unknown; replies: Array<{ body: unknown }> }> } };
}) =>
  c.state
    .get()
    .comments.flatMap((x) => [
      (x.body as { text: string }).text,
      ...x.replies.map((r) => `  ${(r.body as { text: string }).text}`),
    ]);

describe('writing and reading a thread', () => {
  it('adds comments and replies and groups them', async () => {
    const world = createWorld();
    const thread = await (await world.tab()).api.thread('listing-42');
    const first = await thread.add(text('first'));
    world.clock.advance(1000);
    await thread.add(text('second'));
    world.clock.advance(1000);
    await thread.add(text('a reply'), { parentId: first.id });
    expect(bodies(thread)).toEqual(['first', '  a reply', 'second']);
    expect(thread.state.get().count).toBe(3);
  });

  it('orders newest first when configured, replies stay oldest first', async () => {
    const world = createWorld();
    const thread = await (await world.tab(alice, { sort: 'newest' })).api.thread('x');
    const a = await thread.add(text('a'));
    world.clock.advance(1000);
    await thread.add(text('b'));
    world.clock.advance(1000);
    await thread.add(text('r1'), { parentId: a.id });
    world.clock.advance(1000);
    await thread.add(text('r2'), { parentId: a.id });
    expect(bodies(thread)).toEqual(['b', 'a', '  r1', '  r2']);
  });

  it('keeps threads of different targets apart and reloads what was stored', async () => {
    const world = createWorld();
    const tab = await world.tab();
    const one = await tab.api.thread('one');
    await one.add(text('hello'));
    const two = await tab.api.thread('two');
    expect(two.state.get().count).toBe(0);
    const again = await (await world.tab(bob)).api.thread('one');
    expect(bodies(again)).toEqual(['hello']);
  });

  it('rejects empty or over-long comments, replies to replies and unknown parents', async () => {
    const world = createWorld();
    const thread = await (await world.tab()).api.thread('x');
    await expect(thread.add(text('   '))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(thread.add(text('x'.repeat(4001)))).rejects.toMatchObject({ code: 'VALIDATION' });
    const top = await thread.add(text('top'));
    const reply = await thread.add(text('reply'), { parentId: top.id });
    await expect(thread.add(text('deeper'), { parentId: reply.id })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(thread.add(text('orphan'), { parentId: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(thread.state.get().count).toBe(2);
  });

  it('refuses replies when they are turned off', async () => {
    const world = createWorld();
    const thread = await (await world.tab(alice, { replies: false })).api.thread('x');
    const top = await thread.add(text('top'));
    await expect(thread.add(text('reply'), { parentId: top.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('stops at 500 comments per thread', async () => {
    const world = createWorld();
    const thread = await (await world.tab()).api.thread('big');
    for (let i = 0; i < 500; i++) await thread.add(text(`c${i}`));
    await expect(thread.add(text('one too many'))).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(thread.state.get().count).toBe(500);
  });
});

describe('changing comments', () => {
  it('lets only the author edit, and the author or a moderator remove', async () => {
    const world = createWorld();
    const a = await (await world.tab(alice)).api.thread('x');
    const b = await (await world.tab(bob)).api.thread('x');
    const mod = await (await world.tab(carol)).api.thread('x');
    const c = await a.add(text('draft'));
    await a.edit(c.id, text('final'));
    expect(bodies(a)).toEqual(['final']);
    await until(() => bodies(b).length === 1);
    await expect(b.edit(c.id, text('hijack'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(b.remove(c.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await until(() => bodies(mod).length === 1);
    await mod.remove(c.id);
    expect(bodies(mod)).toEqual([]);
  });

  it('drops a comment without replies and leaves a tombstone for one with replies', async () => {
    const world = createWorld();
    const thread = await (await world.tab()).api.thread('x');
    const lone = await thread.add(text('lone'));
    const parent = await thread.add(text('parent'));
    await thread.add(text('child'), { parentId: parent.id });
    await thread.remove(lone.id);
    await thread.remove(parent.id);
    const [node] = thread.state.get().comments;
    expect(node?.deletedAt).toBeDefined();
    expect(node?.replies.map((r) => (r.body as { text: string }).text)).toEqual(['child']);
    expect(thread.state.get().count).toBe(1);
    await thread.remove(node?.replies[0]?.id as string);
    expect(thread.state.get().comments).toEqual([]);
  });

  it('toggles reactions and only allows the configured emoji', async () => {
    const world = createWorld();
    const a = await (await world.tab(alice)).api.thread('x');
    const b = await (await world.tab(bob)).api.thread('x');
    const c = await a.add(text('nice'));
    await until(() => bodies(b).length === 1);
    await a.react(c.id, '👍');
    await b.react(c.id, '👍');
    await until(() => (a.state.get().comments[0]?.reactions['👍'] ?? []).length === 2);
    await a.react(c.id, '👍');
    expect(a.state.get().comments[0]?.reactions['👍']).toEqual(['bob']);
    await b.react(c.id, '👍');
    await until(() => !('👍' in (a.state.get().comments[0]?.reactions ?? {})));
    await expect(a.react(c.id, '💩')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('resolves and reopens a thread when that is turned on', async () => {
    const world = createWorld();
    const on = await (await world.tab(alice, { resolve: true })).api.thread('x');
    await on.setResolved(true);
    expect(on.state.get().resolved).toBe(true);
    await on.setResolved(false);
    expect(on.state.get().resolved).toBe(false);
    const off = await (await world.tab(alice)).api.thread('y');
    await expect(off.setResolved(true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('ratings', () => {
  it('summarises the ratings of top-level comments only', async () => {
    const world = createWorld();
    const thread = await (await world.tab(alice, { ratings: true })).api.thread('camp');
    const a = await thread.add(text('great'), { rating: 5 });
    await thread.add(text('ok'), { rating: 3 });
    await thread.add(text('no rating'));
    await thread.add(text('reply'), { parentId: a.id });
    expect(thread.state.get().summary).toEqual({
      average: 4,
      count: 2,
      histogram: [0, 0, 1, 0, 1],
    });
  });

  it('refuses ratings when off, on replies and out of range', async () => {
    const world = createWorld();
    const off = await (await world.tab(alice)).api.thread('x');
    await expect(off.add(text('a'), { rating: 4 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(off.state.get().summary).toBeUndefined();
    const on = await (await world.tab(alice, { ratings: true })).api.thread('y');
    const top = await on.add(text('a'));
    await expect(on.add(text('b'), { rating: 6 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(on.add(text('c'), { rating: 4, parentId: top.id })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('computes the summary without ratings as undefined', () => {
    expect(summarise([])).toBeUndefined();
    const c = {
      id: '1',
      authorId: 'a',
      authorName: 'A',
      body: text('x'),
      reactions: {},
      createdAt: 'now',
    } as Comment;
    expect(summarise([c])).toBeUndefined();
    expect(
      summarise([
        { ...c, rating: 2 },
        { ...c, id: '2', rating: 5 },
      ])?.average,
    ).toBe(3.5);
  });
});

describe('optimistic writes and conflicts', () => {
  const slow = (
    base: StorageAdapter,
    hold: { release?: () => void; fail?: boolean },
  ): StorageAdapter => ({
    get: (c, id) => base.get(c, id),
    list: (c, q) => base.list(c, q),
    delete: (c, id, v) => base.delete(c, id, v),
    watch: (c, fn) => base.watch?.(c, fn) ?? (() => {}),
    async put(c, doc) {
      await new Promise<void>((resolve) => {
        hold.release = resolve;
      });
      if (hold.fail) throw new Error('disk full');
      return base.put(c, doc);
    },
  });

  it('shows a comment before the write finishes and keeps it once it did', async () => {
    const hold: { release?: () => void } = {};
    const world = createWorld({ storage: (b) => slow(b, hold) });
    const thread = await (await world.tab()).api.thread('x');
    const pending = thread.add(text('instant'));
    expect(bodies(thread)).toEqual(['instant']);
    await until(() => !!hold.release);
    hold.release?.();
    await pending;
    expect(bodies(thread)).toEqual(['instant']);
  });

  it('takes the comment back when the write fails', async () => {
    const hold: { release?: () => void; fail?: boolean } = { fail: true };
    const world = createWorld({ storage: (b) => slow(b, hold) });
    const thread = await (await world.tab()).api.thread('x');
    const pending = thread.add(text('doomed'));
    expect(bodies(thread)).toEqual(['doomed']);
    await until(() => !!hold.release);
    hold.release?.();
    await expect(pending).rejects.toThrow('disk full');
    expect(bodies(thread)).toEqual([]);
  });

  it('keeps both comments when two people write at the same moment', async () => {
    const world = createWorld();
    const a = await (await world.tab(alice)).api.thread('x');
    const b = await (await world.tab(bob)).api.thread('x');
    await Promise.all([a.add(text('from alice')), b.add(text('from bob'))]);
    await until(() => a.state.get().count === 2 && b.state.get().count === 2);
    expect(bodies(a).sort()).toEqual(['from alice', 'from bob']);
    expect(bodies(b).sort()).toEqual(['from alice', 'from bob']);
  });

  it('keeps every reaction when several people react at once', async () => {
    const world = createWorld();
    const tabs = await Promise.all([alice, bob, carol].map((u) => world.tab(u)));
    const threads = await Promise.all(tabs.map((t) => t.api.thread('x')));
    const comment = await threads[0]?.add(text('popular'));
    await until(() => threads.every((t) => t.state.get().count === 1));
    await Promise.all(threads.map((t) => t.react(comment?.id as string, '🎉')));
    await until(() => (threads[0]?.state.get().comments[0]?.reactions['🎉'] ?? []).length === 3);
    expect(threads.map((t) => t.state.get().comments[0]?.reactions['🎉']?.length)).toEqual([
      3, 3, 3,
    ]);
  });

  it('reports a change to a comment that someone else removed meanwhile', async () => {
    const world = createWorld();
    const a = await (await world.tab(alice)).api.thread('x');
    const b = await (await world.tab(alice)).api.thread('x');
    const c = await a.add(text('doomed'));
    await until(() => bodies(b).length === 1);
    await a.remove(c.id);
    // b has not heard yet; its edit finds the comment gone in the fresh copy.
    await expect(b.edit(c.id, text('too late'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(bodies(b)).toEqual([]);
  });
});

describe('live updates', () => {
  it('shows another tab’s comments through storage changes', async () => {
    const world = createWorld();
    const a = await (await world.tab(alice)).api.thread('x');
    const b = await (await world.tab(bob)).api.thread('x');
    await a.add(text('hello bob'));
    await until(() => bodies(b).length === 1);
    expect(bodies(b)).toEqual(['hello bob']);
  });

  it('shows them through transport notifications when storage cannot report changes', async () => {
    const hub = new FakeHub();
    const world = createWorld({
      hub,
      storage: (b) => ({
        get: (c, id) => b.get(c, id),
        list: (c, q) => b.list(c, q),
        put: (c, d) => b.put(c, d),
        delete: (c, id, v) => b.delete(c, id, v),
      }),
    });
    const a = await (await world.tab(alice)).api.thread('x');
    const b = await (await world.tab(bob)).api.thread('x');
    await hub.settle();
    await a.add(text('over the wire'));
    await until(() => bodies(b).length === 1);
    expect(bodies(b)).toEqual(['over the wire']);
  });

  it('does not listen when live is off', async () => {
    const world = createWorld();
    const a = await (await world.tab(alice, { live: false })).api.thread('x');
    const b = await (await world.tab(bob)).api.thread('x');
    await b.add(text('unheard'));
    await new Promise((r) => setTimeout(r, 50));
    expect(bodies(a)).toEqual([]);
  });

  it('stops following a thread that was closed', async () => {
    const world = createWorld();
    const a = await (await world.tab(alice)).api.thread('x');
    const b = await (await world.tab(bob)).api.thread('x');
    a.close();
    await b.add(text('late'));
    await new Promise((r) => setTimeout(r, 50));
    expect(bodies(a)).toEqual([]);
    await expect(a.add(text('nope'))).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' });
  });
});

describe('count', () => {
  it('follows the number of comments while somebody subscribes and stops afterwards', async () => {
    const world = createWorld();
    const a = await world.tab(alice);
    const b = await world.tab(bob);
    const thread = await b.api.thread('x');
    await thread.add(text('one'));
    const counts: number[] = [];
    const off = a.api.count('x').subscribe((n) => counts.push(n));
    await until(() => counts.includes(1));
    await thread.add(text('two'));
    await until(() => counts.at(-1) === 2);
    off();
    await thread.add(text('three'));
    await new Promise((r) => setTimeout(r, 50));
    expect(counts.at(-1)).toBe(2);
  });
});

describe('signed-out users', () => {
  it('cannot write', async () => {
    const world = createWorld();
    const tab = await world.tab();
    const thread = await tab.api.thread('x');
    (tab.instance.ctx.auth as { getUser(): unknown }).getUser = () => null;
    await expect(thread.add(text('hi'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
