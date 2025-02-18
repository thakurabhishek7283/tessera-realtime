import { type TesseraContext, TesseraError, type UserInfo } from '@tessera/core';
import {
  type MessageDto,
  Message as MessageSchema,
  type TopicRequest,
  type TopicResponse,
  TopicSchemas,
} from '@tessera/protocol';
import { type Collection, createCollection } from '@tessera/storage';
import { z } from 'zod';
import { DELETED_TEXT, type RequestContext } from './topics.js';

const DirectDoc = z.object({
  id: z.string(),
  kind: z.literal('direct'),
  members: z.array(z.string()).length(2),
  createdAt: z.string(),
});
const ReadDoc = z.object({ conversationId: z.string(), userId: z.string(), messageId: z.string() });

type Deps = Pick<TesseraContext, 'storage' | 'logger' | 'clock' | 'ids'>;

export interface LocalChatServer {
  /** Answers one `chat.*` request, the way tessera-server would. */
  handle(topic: string, data: unknown, ctx: RequestContext): Promise<unknown>;
}

/** FNV-1a: a short, stable id for the pair of users of a direct conversation. */
function pairId(a: string, b: string): string {
  let hash = 0x811c9dc5;
  for (const char of [a, b].sort().join('\n')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `dm:${hash.toString(16).padStart(8, '0')}`;
}

const MAX_WRITE_ATTEMPTS = 3;

/**
 * An in-browser stand-in for tessera-server's chat module: the same requests, answered from the
 * instance's storage adapter. With the `local` transport every tab runs one, so tabs of one
 * browser profile share conversations through IndexedDB and hear each other through the
 * transport's broadcasts. It is meant for demos and small apps, not for large histories: a
 * history request reads the conversation's messages in full.
 */
export function createLocalChatServer(
  ctx: Deps,
  rooms: ReadonlyArray<{ id: string; title: string }>,
): LocalChatServer {
  const messages: Collection<MessageDto> = createCollection(ctx, 'chat.messages', MessageSchema);
  const directs = createCollection(ctx, 'chat.directs', DirectDoc);
  const reads = createCollection(ctx, 'chat.reads', ReadDoc);

  const now = (): string => new Date(ctx.clock.now()).toISOString();

  const listAll = async <T>(
    coll: Collection<T>,
    where?: Record<string, string>,
  ): Promise<Array<{ id: string; data: T; version: number }>> => {
    const out: Array<{ id: string; data: T; version: number }> = [];
    let cursor: string | undefined;
    do {
      const page = await coll.list({
        ...(where ? { where } : {}),
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      out.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  };

  const inConversation = async (conversationId: string): Promise<MessageDto[]> =>
    (await listAll(messages, { conversationId }))
      .map((d) => d.data)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const assertAccess = async (conversationId: string, user: UserInfo): Promise<void> => {
    if (!conversationId.startsWith('dm:')) return;
    const doc = await directs.get(conversationId);
    if (!doc?.data.members.includes(user.id)) {
      throw new TesseraError('NOT_FOUND', 'Conversation does not exist');
    }
  };

  const marker = async (conversationId: string, userId: string): Promise<string | undefined> =>
    (await reads.get(`${conversationId}~${userId}`))?.data.messageId;

  const unreadCount = (all: MessageDto[], userId: string, readUpTo: string | undefined): number =>
    all.filter(
      (m) => m.authorId !== userId && !m.deletedAt && (readUpTo === undefined || m.id > readUpTo),
    ).length;

  /** Read-modify-write with the document's version, retried when another tab wrote first. */
  const update = async (
    messageId: string,
    change: (current: MessageDto) => MessageDto,
  ): Promise<MessageDto> => {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      const doc = await messages.get(messageId);
      if (!doc) throw new TesseraError('NOT_FOUND', 'Message does not exist');
      const next = change(doc.data);
      try {
        await messages.put({ id: messageId, data: next, version: doc.version });
        return next;
      } catch (error) {
        if (!TesseraError.is(error, 'CONFLICT') || attempt === MAX_WRITE_ATTEMPTS - 1) throw error;
      }
    }
    throw new TesseraError('CONFLICT', 'The message kept changing');
  };

  const load = async (messageId: string, user: UserInfo): Promise<MessageDto> => {
    const doc = await messages.get(messageId);
    if (!doc) throw new TesseraError('NOT_FOUND', 'Message does not exist');
    await assertAccess(doc.data.conversationId, user);
    return doc.data;
  };

  const handlers: {
    [K in keyof typeof TopicSchemas]: (
      req: TopicRequest<K>,
      ctx: RequestContext,
    ) => Promise<TopicResponse<K>>;
  } = {
    async 'chat.conversations'(_req, { user }) {
      const mine = (await listAll(directs)).filter((d) => d.data.members.includes(user.id));
      const entries = [
        ...rooms.map((r) => ({ id: r.id, kind: 'room' as const, title: r.title, createdAt: '' })),
        ...mine.map((d) => ({
          id: d.id,
          kind: 'direct' as const,
          members: d.data.members,
          createdAt: d.data.createdAt,
        })),
      ];
      const conversations = await Promise.all(
        entries.map(async (entry) => {
          const all = await inConversation(entry.id);
          const last = all.at(-1);
          const { createdAt, ...rest } = entry;
          return {
            conversation: {
              ...rest,
              ...(last ? { lastMessage: last } : {}),
              unread: unreadCount(all, user.id, await marker(entry.id, user.id)),
            },
            lastId: last?.id,
            createdAt,
          };
        }),
      );
      conversations.sort((a, b) => {
        if (a.lastId && b.lastId) return a.lastId < b.lastId ? 1 : -1;
        if (a.lastId || b.lastId) return a.lastId ? -1 : 1;
        return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
      });
      return { conversations: conversations.map((c) => c.conversation) };
    },

    async 'chat.open-direct'(req, { user }) {
      if (req.userId === user.id) {
        throw new TesseraError('VALIDATION', 'Cannot open a conversation with yourself');
      }
      const id = pairId(user.id, req.userId);
      const existing = await directs.get(id);
      if (!existing) {
        await directs.put({
          id,
          data: { id, kind: 'direct', members: [user.id, req.userId].sort(), createdAt: now() },
        });
      }
      return { id, kind: 'direct', members: [user.id, req.userId].sort(), unread: 0 };
    },

    async 'chat.send'(req, { user, broadcast }) {
      await assertAccess(req.conversationId, user);
      // A retry after a lost response returns the stored message and does not announce it again.
      const duplicate = (await listAll(messages, { conversationId: req.conversationId })).find(
        (d) => d.data.authorId === user.id && d.data.clientId === req.clientId,
      );
      if (duplicate) return duplicate.data;
      if (req.replyTo) {
        const parent = await messages.get(req.replyTo);
        if (!parent || parent.data.conversationId !== req.conversationId) {
          throw new TesseraError(
            'VALIDATION',
            'replyTo must be a message in the same conversation',
          );
        }
      }
      const message: MessageDto = {
        id: ctx.ids.next(),
        clientId: req.clientId,
        conversationId: req.conversationId,
        authorId: user.id,
        authorName: user.name,
        ...(user.avatarUrl ? { authorAvatarUrl: user.avatarUrl } : {}),
        body: req.body,
        attachments: req.attachments ?? [],
        ...(req.replyTo ? { replyTo: req.replyTo } : {}),
        reactions: {},
        createdAt: now(),
      };
      await messages.put({ id: message.id, data: message, version: 0 });
      broadcast('chat.message', message);
      return message;
    },

    async 'chat.history'(req, { user }) {
      await assertAccess(req.conversationId, user);
      const all = await inConversation(req.conversationId);
      const limit = req.limit ?? 30;
      if (req.after) {
        const after = req.after;
        const newer = all.filter((m) => m.id > after);
        return { messages: newer.slice(0, limit), hasMore: newer.length > limit };
      }
      const before = req.before;
      const older = before ? all.filter((m) => m.id < before) : all;
      return { messages: older.slice(-limit), hasMore: older.length > limit };
    },

    async 'chat.edit'(req, { user, broadcast }) {
      const current = await load(req.messageId, user);
      if (current.authorId !== user.id) {
        throw new TesseraError('FORBIDDEN', 'Only the author can edit a message');
      }
      if (current.deletedAt) throw new TesseraError('NOT_FOUND', 'Message was deleted');
      const next = await update(req.messageId, (m) => ({ ...m, body: req.body, editedAt: now() }));
      broadcast('chat.message-updated', next);
      return next;
    },

    async 'chat.delete'(req, { user, broadcast }) {
      const current = await load(req.messageId, user);
      const moderator = user.roles?.includes('moderator') ?? false;
      if (current.authorId !== user.id && !moderator) {
        throw new TesseraError('FORBIDDEN', 'Only the author or a moderator can delete a message');
      }
      if (current.deletedAt) return current;
      const next = await update(req.messageId, (m) => {
        const { editedAt: _editedAt, ...rest } = m;
        return {
          ...rest,
          body: { type: 'text', text: DELETED_TEXT },
          attachments: [],
          deletedAt: now(),
        };
      });
      broadcast('chat.message-updated', next);
      return next;
    },

    async 'chat.react'(req, { user, broadcast }) {
      const current = await load(req.messageId, user);
      if (current.deletedAt) throw new TesseraError('NOT_FOUND', 'Message was deleted');
      let changed = false;
      const next = await update(req.messageId, (m) => {
        const users = m.reactions[req.emoji] ?? [];
        const has = users.includes(user.id);
        changed = req.on !== has;
        if (!changed) return m;
        const nextUsers = req.on ? [...users, user.id] : users.filter((id) => id !== user.id);
        const { [req.emoji]: _drop, ...others } = m.reactions;
        return {
          ...m,
          reactions: nextUsers.length > 0 ? { ...others, [req.emoji]: nextUsers } : others,
        };
      });
      if (changed) {
        broadcast('chat.reaction', {
          conversationId: next.conversationId,
          messageId: next.id,
          emoji: req.emoji,
          userId: user.id,
          on: req.on,
        });
      }
      return { messageId: next.id, reactions: next.reactions };
    },

    async 'chat.read'(req, { user, broadcast }) {
      const target = await load(req.messageId, user);
      if (target.conversationId !== req.conversationId) {
        throw new TesseraError('NOT_FOUND', 'Message does not exist in this conversation');
      }
      const current = await marker(req.conversationId, user.id);
      if (current !== undefined && current >= req.messageId) {
        return { conversationId: req.conversationId, messageId: current };
      }
      await reads.put({
        id: `${req.conversationId}~${user.id}`,
        data: { conversationId: req.conversationId, userId: user.id, messageId: req.messageId },
      });
      broadcast('chat.read', {
        conversationId: req.conversationId,
        messageId: req.messageId,
        userId: user.id,
      });
      return { conversationId: req.conversationId, messageId: req.messageId };
    },
  };

  return {
    async handle(topic, data, rctx) {
      if (!(topic in handlers)) throw new TesseraError('NOT_FOUND', `No handler for "${topic}"`);
      const key = topic as keyof typeof TopicSchemas;
      const parsed = TopicSchemas[key].request.safeParse(data);
      if (!parsed.success) {
        throw new TesseraError('VALIDATION', parsed.error.issues.map((i) => i.message).join('; '), {
          details: parsed.error.issues,
        });
      }
      const handler = handlers[key] as (req: unknown, c: RequestContext) => Promise<unknown>;
      return handler(parsed.data, rctx);
    },
  };
}
