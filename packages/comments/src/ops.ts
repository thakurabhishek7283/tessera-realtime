import { TesseraError } from '@tessera/core';
import { MAX_COMMENTS } from './config.js';
import type { Comment, ThreadDoc } from './schemas.js';

/** An operation on a thread document. Pure, so it can be re-applied to a fresher copy. */
export type Op = (doc: ThreadDoc, now: string) => ThreadDoc;

const touch = (doc: ThreadDoc, comments: Comment[], now: string): ThreadDoc => ({
  ...doc,
  comments,
  updatedAt: now,
});

const find = (doc: ThreadDoc, id: string): Comment => {
  const comment = doc.comments.find((c) => c.id === id);
  if (!comment) throw new TesseraError('NOT_FOUND', 'That comment does not exist any more');
  return comment;
};

const replace = (doc: ThreadDoc, next: Comment): Comment[] =>
  doc.comments.map((c) => (c.id === next.id ? next : c));

export const emptyThread = (targetId: string, now: string): ThreadDoc => ({
  targetId,
  comments: [],
  resolved: false,
  updatedAt: now,
});

export const addComment =
  (comment: Comment): Op =>
  (doc, now) => {
    if (doc.comments.length >= MAX_COMMENTS) {
      throw new TesseraError('VALIDATION', `A thread can have at most ${MAX_COMMENTS} comments`);
    }
    if (comment.parentId) {
      const parent = find(doc, comment.parentId);
      if (parent.parentId) {
        throw new TesseraError('VALIDATION', 'Replies to replies are not supported');
      }
      if (parent.deletedAt) throw new TesseraError('VALIDATION', 'That comment was deleted');
    }
    if (doc.comments.some((c) => c.id === comment.id)) return doc;
    return touch(doc, [...doc.comments, comment], now);
  };

export const editComment =
  (id: string, body: Comment['body']): Op =>
  (doc, now) => {
    const current = find(doc, id);
    if (current.deletedAt) throw new TesseraError('NOT_FOUND', 'That comment was deleted');
    return touch(doc, replace(doc, { ...current, body, editedAt: now }), now);
  };

/**
 * Removes a comment. One with replies stays as a tombstone so the conversation keeps its shape;
 * one without is dropped.
 */
export const removeComment =
  (id: string): Op =>
  (doc, now) => {
    const current = doc.comments.find((c) => c.id === id);
    if (!current) return doc;
    const hasReplies = doc.comments.some((c) => c.parentId === id);
    if (!hasReplies) {
      return touch(
        doc,
        doc.comments.filter((c) => c.id !== id),
        now,
      );
    }
    const { rating: _rating, editedAt: _edited, ...rest } = current;
    return touch(
      doc,
      replace(doc, {
        ...rest,
        body: { type: 'text', text: '—' },
        reactions: {},
        deletedAt: now,
      }),
      now,
    );
  };

export const reactToComment =
  (id: string, emoji: string, userId: string, on: boolean): Op =>
  (doc, now) => {
    const current = find(doc, id);
    if (current.deletedAt) throw new TesseraError('NOT_FOUND', 'That comment was deleted');
    const users = current.reactions[emoji] ?? [];
    if (users.includes(userId) === on) return doc;
    const { [emoji]: _removed, ...others } = current.reactions;
    const next = on ? [...users, userId] : users.filter((u) => u !== userId);
    const reactions = next.length > 0 ? { ...others, [emoji]: next } : others;
    return touch(doc, replace(doc, { ...current, reactions }), now);
  };

export const setResolved =
  (resolved: boolean): Op =>
  (doc, now) =>
    doc.resolved === resolved ? doc : { ...doc, resolved, updatedAt: now };

export interface RatingSummary {
  average: number;
  count: number;
  /** Number of ratings for 1, 2, 3, 4 and 5 stars. */
  histogram: [number, number, number, number, number];
}

/** Average and distribution of the ratings on top-level comments. `undefined` when there are none. */
export function summarise(comments: readonly Comment[]): RatingSummary | undefined {
  const histogram: RatingSummary['histogram'] = [0, 0, 0, 0, 0];
  let sum = 0;
  let count = 0;
  for (const c of comments) {
    if (c.parentId || c.deletedAt || c.rating === undefined) continue;
    histogram[c.rating - 1] = (histogram[c.rating - 1] ?? 0) + 1;
    sum += c.rating;
    count += 1;
  }
  return count === 0 ? undefined : { average: sum / count, count, histogram };
}
