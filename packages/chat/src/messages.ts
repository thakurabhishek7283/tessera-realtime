import type { Message } from './types.js';

/** Message ids are ULIDs, so string order is time order. */
export const byId = (a: Message, b: Message): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** True for messages the server stored (as opposed to the sender's unsent ones). */
export const isStored = (m: Message): boolean => m.status !== 'sending' && m.status !== 'failed';

/**
 * Inserts `incoming` in id order, or replaces the entry it stands for: the same id, or the
 * sender's own optimistic copy (same author and client id). Pure; returns a new array.
 */
export function upsert(list: readonly Message[], incoming: Message): Message[] {
  const index = list.findIndex(
    (m) =>
      m.id === incoming.id ||
      (m.clientId === incoming.clientId && m.authorId === incoming.authorId && !isStored(m)),
  );
  if (index >= 0) {
    const next = [...list];
    next[index] = incoming;
    return next.sort(byId);
  }
  const next = [...list, incoming];
  // Appending is the common case; only sort when the new message is older than the last one.
  const last = list.at(-1);
  return last && last.id > incoming.id ? next.sort(byId) : next;
}

/** Applies a reaction change to a message's `reactions` without mutating it. */
export function withReaction(
  reactions: Message['reactions'],
  emoji: string,
  userId: string,
  on: boolean,
): Message['reactions'] {
  const users = reactions[emoji] ?? [];
  const has = users.includes(userId);
  if (on === has) return reactions;
  const { [emoji]: _removed, ...others } = reactions;
  const next = on ? [...users, userId] : users.filter((id) => id !== userId);
  return next.length > 0 ? { ...others, [emoji]: next } : others;
}

/** Plain text of a message body, for previews and notifications. */
export function previewText(message: Pick<Message, 'body'>): string {
  if (message.body.type === 'text') return message.body.text;
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const { text, content } = node as { text?: unknown; content?: unknown };
    if (typeof text === 'string') parts.push(text);
    if (Array.isArray(content)) for (const child of content) walk(child);
  };
  walk(message.body.doc);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
