import {
  type Clock,
  createStore,
  type ReadonlyStore,
  type Room,
  type TesseraContext,
  TesseraError,
  type Unsubscribe,
  type UserInfo,
} from '@tessera/core';
import type { Collection } from '@tessera/storage';
import type { CommentsConfigValue } from './config.js';
import {
  addComment,
  editComment,
  emptyThread,
  type Op,
  reactToComment,
  removeComment,
  setResolved,
  summarise,
} from './ops.js';
import type { Comment, ThreadDoc } from './schemas.js';
import type { CommentNode, ThreadController, ThreadState } from './types.js';

const MAX_WRITE_ATTEMPTS = 3;
const MAX_BODY = 4000;

const iso = (clock: Clock): string => new Date(clock.now()).toISOString();

/** Groups a thread document into top-level comments with their replies, in display order. */
export function deriveState(
  doc: ThreadDoc,
  config: Pick<CommentsConfigValue, 'sort' | 'ratings'>,
  loading: boolean,
  error: string | undefined,
): ThreadState {
  const repliesOf = new Map<string, Comment[]>();
  for (const c of doc.comments) {
    if (!c.parentId) continue;
    const list = repliesOf.get(c.parentId);
    if (list) list.push(c);
    else repliesOf.set(c.parentId, [c]);
  }
  const byTime = (a: Comment, b: Comment): number =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;
  const top: CommentNode[] = doc.comments
    .filter((c) => !c.parentId)
    .map((c) => ({
      ...c,
      replies: (repliesOf.get(c.id) ?? []).sort(byTime).filter((r) => !r.deletedAt),
    }))
    // A tombstone nobody replies to any more has nothing left to show.
    .filter((c) => !c.deletedAt || c.replies.length > 0)
    .sort(byTime);
  if (config.sort === 'newest') top.reverse();
  return {
    comments: top,
    count: doc.comments.filter((c) => !c.deletedAt).length,
    resolved: doc.resolved,
    loading,
    error,
    summary: config.ratings ? summarise(doc.comments) : undefined,
  };
}

export interface ThreadOptions {
  ctx: TesseraContext;
  config: CommentsConfigValue;
  coll: Collection<ThreadDoc>;
  targetId: string;
}

/**
 * One thread: an optimistic copy of the thread document, writes that are re-applied on version
 * conflicts, and live updates from storage changes and transport notifications.
 */
export async function openThread(opts: ThreadOptions): Promise<ThreadController> {
  const { ctx, config, coll, targetId } = opts;
  const clock = ctx.clock;
  let doc: ThreadDoc = emptyThread(targetId, iso(clock));
  /** Version of the stored document; 0 means it does not exist yet. */
  let version = 0;
  let inFlight = 0;
  let closed = false;
  let room: Room | undefined;
  const offs: Unsubscribe[] = [];
  const state = createStore<ThreadState>(deriveState(doc, config, true, undefined));

  const publish = (loading = false, error?: string): void => {
    state.set(deriveState(doc, config, loading, error));
  };

  const load = async (): Promise<void> => {
    const stored = await coll.get(targetId);
    if (stored) {
      doc = stored.data;
      version = stored.version;
    }
  };

  const refresh = async (): Promise<void> => {
    if (closed || inFlight > 0) return;
    try {
      const stored = await coll.get(targetId);
      if (closed || inFlight > 0) return;
      if (stored && stored.version > version) {
        doc = stored.data;
        version = stored.version;
        publish();
      } else if (!stored && version > 0) {
        doc = emptyThread(targetId, iso(clock));
        version = 0;
        publish();
      }
    } catch (error) {
      ctx.logger.warn('could not refresh a comment thread', error);
    }
  };

  try {
    await load();
    publish();
  } catch (error) {
    publish(false, error instanceof Error ? error.message : String(error));
    throw error;
  }

  if (config.live) {
    offs.push(
      coll.watch((change) => {
        if (change.id !== targetId || closed || inFlight > 0) return;
        if (!change.deleted && change.version <= version) return;
        void refresh();
      }),
    );
    const transport = ctx.transport();
    if (transport) {
      void transport
        .join(`comments:${targetId}`)
        .then((joined) => {
          if (closed) {
            void joined.leave();
            return;
          }
          room = joined;
          offs.push(
            joined.on<{ version?: number }>('comments.changed', (data) => {
              if (typeof data?.version === 'number' && data.version > version) void refresh();
            }),
            joined.on('$reconnected', () => void refresh()),
          );
        })
        .catch((error: unknown) =>
          ctx.logger.debug('comment notifications are unavailable', error),
        );
    }
  }

  /** Applies `op` now, writes it with the stored version and re-applies it on conflicts. */
  const apply = async (op: Op): Promise<void> => {
    if (closed) throw new TesseraError('TRANSPORT_CLOSED', 'This thread was closed');
    const before = { doc, version };
    let base = doc;
    let reapplied = false;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      let next: ThreadDoc;
      try {
        next = op(base, iso(clock));
      } catch (error) {
        // The comment it targets is gone in the fresher copy: show that copy, not our guess.
        doc = base;
        publish();
        if (reapplied) ctx.bus.emit('comments:conflict', { targetId, resolution: 'dropped' });
        throw error;
      }
      if (next === base) return;
      doc = next;
      publish();
      inFlight += 1;
      try {
        const saved = await coll.put({ id: targetId, data: next, version });
        version = saved.version;
        if (reapplied) ctx.bus.emit('comments:conflict', { targetId, resolution: 'reapplied' });
        room?.publish('comments.changed', { version });
        return;
      } catch (error) {
        if (!TesseraError.is(error, 'CONFLICT')) {
          doc = before.doc;
          version = before.version;
          publish();
          throw error;
        }
        const fresh = await coll.get(targetId);
        base = fresh?.data ?? emptyThread(targetId, iso(clock));
        version = fresh?.version ?? 0;
        doc = base;
        reapplied = true;
      } finally {
        inFlight -= 1;
      }
    }
    doc = base;
    publish();
    ctx.bus.emit('comments:conflict', { targetId, resolution: 'reverted' });
    throw new TesseraError('CONFLICT', 'The thread kept changing; your change was not saved');
  };

  const self = (): UserInfo => {
    const user = ctx.auth.getUser();
    if (!user) throw new TesseraError('UNAUTHORIZED', 'Sign in to comment');
    return user;
  };

  const validBody = (body: Comment['body']): void => {
    if (body.type === 'text') {
      if (body.text.trim().length === 0)
        throw new TesseraError('VALIDATION', 'A comment cannot be empty');
      if (body.text.length > MAX_BODY) {
        throw new TesseraError('VALIDATION', `A comment can have at most ${MAX_BODY} characters`);
      }
    }
  };

  const mine = (id: string): Comment => {
    const comment = doc.comments.find((c) => c.id === id);
    if (!comment) throw new TesseraError('NOT_FOUND', 'That comment does not exist');
    return comment;
  };

  return {
    targetId,
    state: state as ReadonlyStore<ThreadState>,

    async add(body, addOpts) {
      const user = self();
      validBody(body);
      if (addOpts?.parentId && !config.replies) {
        throw new TesseraError('FORBIDDEN', 'Replies are turned off');
      }
      if (addOpts?.rating !== undefined) {
        if (!config.ratings) throw new TesseraError('FORBIDDEN', 'Ratings are turned off');
        if (addOpts.parentId)
          throw new TesseraError('VALIDATION', 'Only top-level comments can have a rating');
        if (!Number.isInteger(addOpts.rating) || addOpts.rating < 1 || addOpts.rating > 5) {
          throw new TesseraError('VALIDATION', 'A rating is 1 to 5 stars');
        }
      }
      const comment: Comment = {
        id: ctx.ids.next(),
        ...(addOpts?.parentId ? { parentId: addOpts.parentId } : {}),
        authorId: user.id,
        authorName: user.name,
        ...(user.avatarUrl ? { authorAvatarUrl: user.avatarUrl } : {}),
        body,
        ...(addOpts?.rating !== undefined ? { rating: addOpts.rating } : {}),
        reactions: {},
        createdAt: iso(clock),
      };
      await apply(addComment(comment));
      ctx.bus.emit('comments:added', { targetId, comment });
      return comment;
    },

    async edit(id, body) {
      const user = self();
      validBody(body);
      if (mine(id).authorId !== user.id) {
        throw new TesseraError('FORBIDDEN', 'Only the author can edit a comment');
      }
      await apply(editComment(id, body));
    },

    async remove(id) {
      const user = self();
      const moderator = user.roles?.includes('moderator') ?? false;
      if (mine(id).authorId !== user.id && !moderator) {
        throw new TesseraError('FORBIDDEN', 'Only the author or a moderator can remove a comment');
      }
      await apply(removeComment(id));
    },

    async react(id, emoji) {
      const user = self();
      if (!config.reactions.includes(emoji)) {
        throw new TesseraError('VALIDATION', `"${emoji}" is not one of the allowed reactions`);
      }
      const on = !(mine(id).reactions[emoji]?.includes(user.id) ?? false);
      await apply(reactToComment(id, emoji, user.id, on));
    },

    async setResolved(resolved) {
      if (!config.resolve) throw new TesseraError('FORBIDDEN', 'Resolving threads is turned off');
      self();
      await apply(setResolved(resolved));
    },

    close() {
      if (closed) return;
      closed = true;
      for (const off of offs.splice(0)) off();
      void room?.leave();
    },
  };
}
