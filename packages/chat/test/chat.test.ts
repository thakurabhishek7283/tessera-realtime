import { alice, bob, carol, FakeHub } from '@tessera/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationController, Message } from '../src/index.js';
import { createWorld, until, type World } from './env.js';

afterEach(() => {
  vi.useRealTimers();
});

const text = (t: string) => ({ type: 'text' as const, text: t });
const texts = (c: ConversationController): string[] =>
  c.state.get().messages.map((m) => (m.body.type === 'text' ? m.body.text : '[rich]'));

describe.each(['server', 'local'] as const)('chat (%s)', (mode) => {
  const world = (): Promise<World> => createWorld(mode, FakeHub);

  describe('sending', () => {
    it('shows the message at once, confirms it and delivers it to the others in order', async () => {
      const w = await world();
      const a = await (await w.tab(alice)).api.openConversation('general');
      const b = await (await w.tab(bob)).api.openConversation('general');
      const pending = a.send(text('first'));
      expect(a.state.get().messages.map((m) => m.status)).toEqual(['sending']);
      const sent = await pending;
      expect(sent.status).toBe('sent');
      await a.send(text('second'));
      await until(() => texts(b).length === 2);
      expect(texts(a)).toEqual(['first', 'second']);
      expect(texts(b)).toEqual(['first', 'second']);
      expect(a.state.get().messages.every((m) => m.status === 'sent')).toBe(true);
      expect(b.state.get().messages[0]).toMatchObject({
        authorId: 'alice',
        authorName: 'Alice Archer',
      });
    });

    it('never shows a message twice when the broadcast beats the response', async () => {
      const w = await world();
      const a = await (await w.tab(alice)).api.openConversation('general');
      await Promise.all([a.send(text('one')), a.send(text('two')), a.send(text('three'))]);
      await w.settle();
      expect(texts(a)).toEqual(['one', 'two', 'three']);
    });

    it('rejects empty and over-long messages without adding them', async () => {
      const w = await world();
      const a = await (
        await w.tab(alice, { composer: { maxLength: 10 } as never })
      ).api.openConversation('general');
      await expect(a.send(text('   '))).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(a.send(text('x'.repeat(11)))).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(a.state.get().messages).toEqual([]);
    });

    it('replies to a message', async () => {
      const w = await world();
      const a = await (await w.tab(alice)).api.openConversation('general');
      const first = await a.send(text('question'));
      const reply = await a.send(text('answer'), { replyTo: first.id });
      expect(reply.replyTo).toBe(first.id);
      await expect(a.send(text('bad'), { replyTo: 'missing' })).rejects.toBeDefined();
    });

    it('emits bus events for sent and received messages', async () => {
      const w = await world();
      const ta = await w.tab(alice);
      const tb = await w.tab(bob);
      const sent: Message[] = [];
      const received: Message[] = [];
      ta.instance.on('chat:message-sent', (m) => sent.push(m));
      tb.instance.on('chat:message-received', (m) => received.push(m));
      const a = await ta.api.openConversation('general');
      await tb.api.openConversation('general');
      await a.send(text('hi'));
      await until(() => received.length === 1);
      expect(sent.map((m) => m.id)).toEqual(received.map((m) => m.id));
    });
  });

  describe('history', () => {
    it('loads the newest page, then older pages on demand', async () => {
      const w = await world();
      const writer = await (await w.tab(bob)).api.openConversation('general');
      for (let i = 1; i <= 25; i++) await writer.send(text(`m${String(i).padStart(2, '0')}`));
      const reader = await (await w.tab(alice, { pageSize: 10 })).api.openConversation('general');
      expect(texts(reader).at(0)).toBe('m16');
      expect(texts(reader)).toHaveLength(10);
      expect(reader.state.get().hasMore).toBe(true);
      await reader.loadOlder();
      expect(texts(reader).at(0)).toBe('m06');
      await reader.loadOlder();
      expect(texts(reader)).toHaveLength(25);
      expect(texts(reader).at(0)).toBe('m01');
      expect(reader.state.get().hasMore).toBe(false);
    });

    it('keeps messages that arrive while older ones load in order', async () => {
      const w = await world();
      const writer = await (await w.tab(bob)).api.openConversation('general');
      for (let i = 1; i <= 15; i++) await writer.send(text(`m${i}`));
      const reader = await (await w.tab(alice, { pageSize: 10 })).api.openConversation('general');
      const older = reader.loadOlder();
      await writer.send(text('late'));
      await older;
      await until(() => texts(reader).includes('late'));
      const ids = reader.state.get().messages.map((m) => m.id);
      expect(ids).toEqual([...ids].sort());
    });
  });

  describe('typing and reading', () => {
    it('shows who is typing and clears it after 4 seconds', async () => {
      const w = await world();
      const a = await (await w.tab(alice)).api.openConversation('general');
      const b = await (await w.tab(bob)).api.openConversation('general');
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      b.setTyping(true);
      await vi.advanceTimersByTimeAsync(150);
      expect(a.state.get().typing.map((u) => u.id)).toEqual(['bob']);
      expect(b.state.get().typing).toEqual([]);
      await vi.advanceTimersByTimeAsync(4100);
      expect(a.state.get().typing).toEqual([]);
    });

    it('stops showing someone as typing once their message arrives', async () => {
      const w = await world();
      const a = await (await w.tab(alice)).api.openConversation('general');
      const b = await (await w.tab(bob)).api.openConversation('general');
      b.setTyping(true);
      await until(() => a.state.get().typing.length === 1);
      await b.send(text('done'));
      await until(() => a.state.get().typing.length === 0);
    });

    it('counts unread messages, marks them read and tells the others', async () => {
      const w = await world();
      const writer = await (await w.tab(bob)).api.openConversation('general');
      const ta = await w.tab(alice);
      await writer.send(text('one'));
      await writer.send(text('two'));
      await writer.send(text('three'));
      await w.settle();
      const a = await ta.api.openConversation('general');
      expect(a.state.get().unread).toBe(3);
      expect(a.state.get().firstUnreadId).toBe(a.state.get().messages[0]?.id);
      expect(ta.api.totalUnread.get()).toBe(3);

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      a.markRead();
      expect(a.state.get().unread).toBe(0);
      await vi.advanceTimersByTimeAsync(1100);
      await vi.advanceTimersByTimeAsync(150);
      const last = a.state.get().messages.at(-1)?.id as string;
      expect(writer.state.get().readBy[last]?.map((u) => u.id)).toEqual(['alice']);
      expect(ta.api.totalUnread.get()).toBe(0);
    });

    it('does not count its own messages as unread, and counts new ones from others', async () => {
      const w = await world();
      const ta = await w.tab(alice);
      const a = await ta.api.openConversation('general');
      const b = await (await w.tab(bob)).api.openConversation('general');
      await a.send(text('mine'));
      expect(a.state.get().unread).toBe(0);
      await b.send(text('theirs'));
      await until(() => a.state.get().unread === 1);
      expect(ta.api.conversations.get().find((c) => c.id === 'general')?.unread).toBe(1);
    });

    it('tracks unread messages of conversations that are not open', async () => {
      const w = await world();
      const ta = await w.tab(alice);
      await ta.api.openConversation('general').then((c) => c.close());
      const b = await (await w.tab(bob)).api.openConversation('general');
      await b.send(text('hello'));
      await until(() => ta.api.totalUnread.get() === 1);
    });
  });

  describe('changing messages', () => {
    it('toggles reactions for everyone', async () => {
      const w = await world();
      const a = await (await w.tab(alice)).api.openConversation('general');
      const b = await (await w.tab(bob)).api.openConversation('general');
      const m = await a.send(text('react to me'));
      await until(() => b.state.get().messages.length === 1);
      await b.react(m.id, '👍');
      await a.react(m.id, '👍');
      await until(() => (a.state.get().messages[0]?.reactions['👍'] ?? []).length === 2);
      expect(b.state.get().messages[0]?.reactions['👍']).toEqual(['bob', 'alice']);
      await b.react(m.id, '👍');
      await until(() => (a.state.get().messages[0]?.reactions['👍'] ?? []).length === 1);
      await a.react(m.id, '👍');
      await until(() => !('👍' in (b.state.get().messages[0]?.reactions ?? {})));
    });

    it('edits and deletes only the author’s own messages', async () => {
      const w = await world();
      const a = await (await w.tab(alice)).api.openConversation('general');
      const b = await (await w.tab(bob)).api.openConversation('general');
      const m = await a.send(text('draft'));
      await until(() => b.state.get().messages.length === 1);
      await a.edit(m.id, text('final'));
      await until(() => b.state.get().messages[0]?.editedAt !== undefined);
      expect(texts(b)).toEqual(['final']);
      await expect(b.edit(m.id, text('hijack'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(b.remove(m.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await a.remove(m.id);
      await until(() => b.state.get().messages[0]?.deletedAt !== undefined);
      expect(b.state.get().messages).toHaveLength(1);
    });

    it('lets a moderator delete anyone’s message', async () => {
      const w = await world();
      const a = await (await w.tab(bob)).api.openConversation('general');
      const mod = await (await w.tab(carol)).api.openConversation('general');
      const m = await a.send(text('rude'));
      await until(() => mod.state.get().messages.length === 1);
      await mod.remove(m.id);
      await until(() => a.state.get().messages[0]?.deletedAt !== undefined);
    });
  });

  describe('direct messages and the conversation list', () => {
    it('opens the same direct conversation from both sides and keeps it private', async () => {
      const w = await world();
      const ta = await w.tab(alice);
      const tb = await w.tab(bob);
      const tc = await w.tab(carol);
      const a = await ta.api.openDirect('bob');
      const b = await tb.api.openDirect('alice');
      expect(a.id).toBe(b.id);
      expect(a.id.startsWith('dm:')).toBe(true);
      await a.send(text('psst'));
      await until(() => texts(b).length === 1);
      await expect(tc.api.openConversation(a.id)).rejects.toBeDefined();
      await expect(ta.api.openDirect('alice')).rejects.toBeDefined();
    });

    it('shows a direct conversation to the other person as soon as it is opened', async () => {
      const w = await world();
      const ta = await w.tab(alice);
      const tb = await w.tab(bob);
      await tb.api.openConversation('general').then((c) => c.close());
      await ta.api.openDirect('bob');
      await until(() => tb.api.conversations.get().some((c) => c.kind === 'direct'));
      const [dm] = tb.api.conversations.get().filter((c) => c.kind === 'direct');
      expect(dm?.members).toEqual(['alice', 'bob']);
    });

    it('lists conversations by recent activity, including configured rooms', async () => {
      const w = await world();
      const ta = await w.tab(alice, {
        conversations: [
          { id: 'general', title: 'General' },
          { id: 'random', title: 'Random' },
        ],
      });
      await until(() => ta.api.conversations.get().length === 2);
      expect(ta.api.conversations.get().map((c) => c.id)).toEqual(['general', 'random']);
      const random = await ta.api.openConversation('random');
      await random.send(text('hi'));
      expect(ta.api.conversations.get().map((c) => [c.id, c.title])).toEqual([
        ['random', 'Random'],
        ['general', 'General'],
      ]);
      expect(ta.api.conversations.get()[0]?.lastMessage?.body).toEqual(text('hi'));
    });

    it('refuses direct messages when they are turned off', async () => {
      const w = await world();
      const ta = await w.tab(alice, { directMessages: false });
      await expect(ta.api.openDirect('bob')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('attachments', () => {
    it('uploads files first and sends their descriptions with the message', async () => {
      const w = await world();
      const a = await (await w.tab(alice)).api.openConversation('general');
      const b = await (await w.tab(bob)).api.openConversation('general');
      const file = new File([new Uint8Array([1, 2, 3])], 'note.pdf', { type: 'application/pdf' });
      const sent = await a.send(text('see attached'), { attachments: [file] });
      expect(sent.attachments).toHaveLength(1);
      expect(sent.attachments[0]).toMatchObject({
        name: 'note.pdf',
        mime: 'application/pdf',
        size: 3,
      });
      await until(() => b.state.get().messages.length === 1);
      expect(b.state.get().messages[0]?.attachments[0]?.name).toBe('note.pdf');
    });

    it('keeps the message as failed when an upload is refused, and does not send it', async () => {
      const w = await world();
      const a = await (await w.tab(alice)).api.openConversation('general');
      const bad = new File(['x'], 'run.exe', { type: 'application/x-msdownload' });
      await expect(a.send(text('oops'), { attachments: [bad] })).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      expect(a.state.get().messages.map((m) => m.status)).toEqual(['failed']);
    });
  });

  it('closing a controller stops it from being used', async () => {
    const w = await world();
    const a = await (await w.tab(alice)).api.openConversation('general');
    a.close();
    expect(() => a.setTyping(true)).toThrow();
  });
});

describe('chat on a server (FakeHub)', () => {
  it('retries a failed send without duplicating it', async () => {
    const w = await createWorld('server', FakeHub);
    const hub = w.hub as FakeHub;
    const a = await (await w.tab(alice)).api.openConversation('general');
    const send = hub.handlers.get('chat.send');
    let fail = true;
    hub.handle('chat.send', async (data, ctx) => {
      if (fail) throw new Error('network down');
      return send?.(data, ctx);
    });
    await expect(a.send(text('hello'))).rejects.toBeDefined();
    const [failed] = a.state.get().messages;
    expect(failed?.status).toBe('failed');
    fail = false;
    await a.retry(failed?.clientId as string);
    expect(a.state.get().messages).toHaveLength(1);
    expect(a.state.get().messages[0]?.status).toBe('sent');
    const b = await (await w.tab(bob)).api.openConversation('general');
    expect(texts(b)).toEqual(['hello']);
  });

  it('is idempotent when the server already stored the message', async () => {
    const w = await createWorld('server', FakeHub);
    const hub = w.hub as FakeHub;
    const a = await (await w.tab(alice)).api.openConversation('general');
    const send = hub.handlers.get('chat.send');
    let first = true;
    hub.handle('chat.send', async (data, ctx) => {
      const result = await send?.(data, ctx);
      if (first) {
        first = false;
        throw new Error('response lost');
      }
      return result;
    });
    await expect(a.send(text('once'))).rejects.toBeDefined();
    await a.retry(a.state.get().messages[0]?.clientId as string);
    await w.settle();
    const b = await (await w.tab(bob)).api.openConversation('general');
    expect(texts(b)).toEqual(['once']);
    expect(texts(a)).toEqual(['once']);
  });

  it('fills the gap after a reconnect', async () => {
    const w = await createWorld('server', FakeHub);
    const ta = await w.tab(alice);
    const a = await ta.api.openConversation('general');
    const b = await (await w.tab(bob)).api.openConversation('general');
    await a.send(text('before'));
    await until(() => texts(b).length === 1);
    ta.transport?.drop();
    await b.send(text('missed 1'));
    await b.send(text('missed 2'));
    await w.settle();
    expect(texts(a)).toEqual(['before']);
    ta.transport?.restore();
    await until(() => texts(a).length === 3);
    expect(texts(a)).toEqual(['before', 'missed 1', 'missed 2']);
    expect(a.state.get().unread).toBe(2);
  });
});
