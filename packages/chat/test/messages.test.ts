import { describe, expect, it } from 'vitest';
import type { Message } from '../src/index.js';
import { previewText, upsert, withReaction } from '../src/messages.js';

const msg = (id: string, extra: Partial<Message> = {}): Message => ({
  id,
  clientId: `c-${id}`,
  conversationId: 'general',
  authorId: 'alice',
  authorName: 'Alice',
  body: { type: 'text', text: id },
  attachments: [],
  reactions: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

describe('upsert', () => {
  it('appends newer messages and keeps older ones in id order', () => {
    const list = upsert(upsert([], msg('b')), msg('a'));
    expect(list.map((m) => m.id)).toEqual(['a', 'b']);
    expect(upsert(list, msg('c')).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('replaces the sender’s unsent copy by client id', () => {
    const unsent = msg('client-1', { clientId: 'client-1', status: 'sending' });
    const stored = msg('server-9', { clientId: 'client-1' });
    const list = upsert([msg('server-1'), unsent], stored);
    expect(list.map((m) => m.id)).toEqual(['server-1', 'server-9']);
  });

  it('does not mistake another author’s message with the same client id for a copy', () => {
    const mine = msg('x', { clientId: 'same', status: 'sending' });
    const theirs = msg('y', { clientId: 'same', authorId: 'bob' });
    expect(upsert([mine], theirs)).toHaveLength(2);
  });

  it('replaces an existing id and does not mutate its input', () => {
    const list = [msg('a')];
    const next = upsert(list, msg('a', { editedAt: 'now' }));
    expect(next[0]?.editedAt).toBe('now');
    expect(list[0]?.editedAt).toBeUndefined();
  });
});

describe('withReaction', () => {
  it('adds, removes and drops emptied emoji', () => {
    const one = withReaction({}, '👍', 'alice', true);
    expect(one).toEqual({ '👍': ['alice'] });
    expect(withReaction(one, '👍', 'bob', true)).toEqual({ '👍': ['alice', 'bob'] });
    expect(withReaction(one, '👍', 'alice', false)).toEqual({});
  });

  it('is idempotent', () => {
    const one = withReaction({}, '👍', 'alice', true);
    expect(withReaction(one, '👍', 'alice', true)).toBe(one);
    expect(withReaction({}, '👍', 'alice', false)).toEqual({});
  });
});

describe('previewText', () => {
  it('reads text and rich bodies', () => {
    expect(previewText({ body: { type: 'text', text: 'hi' } })).toBe('hi');
    expect(
      previewText({
        body: {
          type: 'rich',
          doc: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Hello' },
                  { type: 'text', text: 'world' },
                ],
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'again' }] },
            ],
          },
        },
      }),
    ).toBe('Hello world again');
  });
});
