import type { Message } from './types.js';

/** Messages by the same person within this long of each other share one header. */
export const GROUP_WITHIN_MS = 5 * 60 * 1000;

export interface TextPart {
  text: string;
  /** Set when the part is a link. */
  href?: string;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;

/**
 * Splits plain text into text and link parts. Only `http` and `https` URLs become links, and
 * punctuation that ends a sentence is not part of the link. The parts are meant to be rendered as
 * text nodes and anchors, never as HTML.
 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let url = match[0];
    // Punctuation that ends a sentence is not part of the link; a ")" is, when it closes a "(".
    for (;;) {
      const end = url.at(-1) ?? '';
      const closing = end === ')' || end === ']' || end === '}';
      const open = end === ')' ? '(' : end === ']' ? '[' : '{';
      const count = (c: string): number => url.split(c).length - 1;
      if (/[.,;:!?'"]/.test(end) || (closing && count(end) > count(open))) url = url.slice(0, -1);
      else break;
    }
    try {
      new URL(url);
    } catch {
      continue;
    }
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export interface Row {
  key: string;
  kind: 'message' | 'day' | 'unread';
  message?: Message;
  /** For `day` rows: the day's first timestamp. */
  day?: string;
  /** A message that continues the previous one by the same author. */
  compact?: boolean;
}

const dayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/**
 * Turns messages into list rows: day separators, a "new messages" divider before
 * `firstUnreadId`, and `compact` flags for runs by one author.
 */
export function buildRows(messages: readonly Message[], firstUnreadId: string | undefined): Row[] {
  const rows: Row[] = [];
  let previous: Message | undefined;
  for (const message of messages) {
    const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
    if (newDay)
      rows.push({ key: `day:${dayKey(message.createdAt)}`, kind: 'day', day: message.createdAt });
    const divider = message.id === firstUnreadId;
    if (divider) rows.push({ key: 'unread', kind: 'unread' });
    const compact =
      !!previous &&
      !newDay &&
      !divider &&
      previous.authorId === message.authorId &&
      !previous.deletedAt &&
      Date.parse(message.createdAt) - Date.parse(previous.createdAt) <= GROUP_WITHIN_MS;
    rows.push({
      key: message.clientId && message.status ? `m:${message.clientId}` : `m:${message.id}`,
      kind: 'message',
      message,
      compact,
    });
    previous = message;
  }
  return rows;
}

export interface WindowInput {
  /** Measured heights by row key; rows without a measurement use `estimate`. */
  heights: ReadonlyMap<string, number>;
  keys: readonly string[];
  estimate: number;
  scrollTop: number;
  viewport: number;
  overscan: number;
}

export interface WindowRange {
  start: number;
  end: number;
  before: number;
  after: number;
}

/** Distance from the top of the list to row `index`, using measured heights where known. */
export function offsetOf(
  keys: readonly string[],
  heights: ReadonlyMap<string, number>,
  estimate: number,
  index: number,
): number {
  let offset = 0;
  for (let i = 0; i < index && i < keys.length; i++) {
    offset += heights.get(keys[i] as string) ?? estimate;
  }
  return offset;
}

/** Which rows to render: those intersecting the viewport plus `overscan` pixels on both sides. */
export function computeWindow(input: WindowInput): WindowRange {
  const { heights, keys, estimate, scrollTop, viewport, overscan } = input;
  const top = Math.max(0, scrollTop - overscan);
  const bottom = scrollTop + viewport + overscan;
  let offset = 0;
  let start = -1;
  let end = keys.length;
  let before = 0;
  for (let i = 0; i < keys.length; i++) {
    const height = heights.get(keys[i] as string) ?? estimate;
    if (start < 0 && offset + height > top) {
      start = i;
      before = offset;
    }
    if (offset >= bottom) {
      end = i;
      break;
    }
    offset += height;
  }
  if (start < 0) {
    start = Math.max(0, keys.length - 1);
    before = Math.max(0, offset - (heights.get(keys[start] as string) ?? estimate));
  }
  let after = 0;
  for (let i = end; i < keys.length; i++) after += heights.get(keys[i] as string) ?? estimate;
  return { start, end, before, after };
}

/** `Today`, `Yesterday` or a long date, in the locale's own words. */
export function dayLabel(iso: string, now: number, locale: string): string {
  const day = new Date(iso);
  const today = new Date(now);
  const diff = Math.round(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())) /
      86_400_000,
  );
  if (diff === 0 || diff === 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-diff, 'day');
  }
  return day.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(day.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Hour and minute in the locale's format. */
export const timeLabel = (iso: string, locale: string): string =>
  new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
