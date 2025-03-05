import { describe, expect, it } from 'vitest';
import { EMOJI_GROUPS } from '../src/emoji.js';
import type { Message } from '../src/index.js';
import { buildRows, computeWindow, dayLabel, linkify } from '../src/ui-util.js';

const msg = (
  id: string,
  at: string,
  authorId = 'alice',
  extra: Partial<Message> = {},
): Message => ({
  id,
  clientId: `c${id}`,
  conversationId: 'general',
  authorId,
  authorName: authorId,
  body: { type: 'text', text: id },
  attachments: [],
  reactions: {},
  createdAt: at,
  ...extra,
});

describe('linkify', () => {
  it('finds http and https links and leaves the rest as text', () => {
    expect(linkify('see https://example.com/a?b=1 now')).toEqual([
      { text: 'see ' },
      { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { text: ' now' },
    ]);
  });

  it('keeps sentence punctuation out of the link', () => {
    expect(linkify('Visit https://example.com.')).toEqual([
      { text: 'Visit ' },
      { text: 'https://example.com', href: 'https://example.com' },
      { text: '.' },
    ]);
    expect(linkify('(https://example.com/a_(b))')).toEqual([
      { text: '(' },
      { text: 'https://example.com/a_(b)', href: 'https://example.com/a_(b)' },
      { text: ')' },
    ]);
  });

  it('never links other schemes', () => {
    expect(linkify('javascript:alert(1) ftp://x.org data:text/html,hi')).toEqual([
      { text: 'javascript:alert(1) ftp://x.org data:text/html,hi' },
    ]);
  });

  it('returns plain text unchanged', () => {
    expect(linkify('hello')).toEqual([{ text: 'hello' }]);
    expect(linkify('')).toEqual([]);
  });
});

describe('buildRows', () => {
  it('adds day separators, groups runs by one author and marks the first unread', () => {
    const rows = buildRows(
      [
        msg('1', '2026-03-01T10:00:00'),
        msg('2', '2026-03-01T10:02:00'),
        msg('3', '2026-03-01T10:30:00'),
        msg('4', '2026-03-01T10:31:00', 'bob'),
        msg('5', '2026-03-02T09:00:00', 'bob'),
      ],
      '4',
    );
    expect(
      rows.map((r) => [r.kind, r.kind === 'message' ? r.message?.id : '', r.compact ?? false]),
    ).toEqual([
      ['day', '', false],
      ['message', '1', false],
      ['message', '2', true],
      ['message', '3', false],
      ['unread', '', false],
      ['message', '4', false],
      ['day', '', false],
      ['message', '5', false],
    ]);
  });

  it('keys a message by its client id while it is unsent, so its row survives being stored', () => {
    const unsent = buildRows(
      [msg('c1', '2026-03-01T10:00:00', 'alice', { clientId: 'c1', status: 'sending' })],
      undefined,
    );
    const stored = buildRows(
      [msg('s1', '2026-03-01T10:00:00', 'alice', { clientId: 'c1', status: 'sent' })],
      undefined,
    );
    expect(unsent[1]?.key).toBe(stored[1]?.key);
  });
});

describe('computeWindow', () => {
  const keys = Array.from({ length: 1000 }, (_, i) => `k${i}`);
  const heights = new Map<string, number>();

  it('renders only what is near the viewport and pads for the rest', () => {
    const w = computeWindow({
      heights,
      keys,
      estimate: 50,
      scrollTop: 10_000,
      viewport: 500,
      overscan: 500,
    });
    expect(w.start).toBe(190);
    expect(w.end).toBe(220);
    expect(w.before).toBe(190 * 50);
    expect(w.after).toBe((1000 - 220) * 50);
  });

  it('uses measured heights where known', () => {
    const measured = new Map([['k0', 500]]);
    const w = computeWindow({
      heights: measured,
      keys,
      estimate: 50,
      scrollTop: 0,
      viewport: 100,
      overscan: 0,
    });
    expect(w).toMatchObject({ start: 0, end: 1, before: 0 });
    expect(w.after).toBe(500 * 0 + 999 * 50);
  });

  it('handles the end of the list and an empty list', () => {
    const end = computeWindow({
      heights,
      keys,
      estimate: 50,
      scrollTop: 49_500,
      viewport: 500,
      overscan: 100,
    });
    expect(end.end).toBe(1000);
    expect(end.after).toBe(0);
    expect(
      computeWindow({ heights, keys: [], estimate: 50, scrollTop: 0, viewport: 500, overscan: 0 }),
    ).toEqual({
      start: 0,
      end: 0,
      before: 0,
      after: 0,
    });
  });
});

describe('dayLabel', () => {
  const now = new Date('2026-03-10T12:00:00').getTime();
  it('uses relative words for today and yesterday and dates otherwise', () => {
    expect(dayLabel('2026-03-10T08:00:00', now, 'en')).toBe('today');
    expect(dayLabel('2026-03-09T23:00:00', now, 'en')).toBe('yesterday');
    expect(dayLabel('2026-03-01T08:00:00', now, 'en')).toBe('Sunday, March 1');
    expect(dayLabel('2025-12-24T08:00:00', now, 'en')).toContain('2025');
  });
});

describe('emoji groups', () => {
  it('has about 200 distinct emoji in total, none repeated within a group', () => {
    for (const g of EMOJI_GROUPS) expect(new Set(g.emojis).size).toBe(g.emojis.length);
    const total = EMOJI_GROUPS.reduce((n, g) => n + g.emojis.length, 0);
    expect(total).toBeGreaterThan(180);
    expect(total).toBeLessThan(220);
  });
});
