import {
  batch,
  createStore,
  type ReadonlyStore,
  type Room,
  type TesseraContext,
  TesseraError,
  type Unsubscribe,
  type UserInfo,
} from '@tessera-kit/core';
import {
  ChatReactionEvent,
  ChatReadEvent,
  Message as MessageSchema,
  type RequestTopic,
  type TopicRequest,
  type TopicResponse,
  TopicSchemas,
} from '@tessera-kit/protocol';
import type { ChatConfigValue } from './config.js';
import { isStored, upsert, withReaction } from './messages.js';
import type {
  Conversation,
  ConversationController,
  ConversationState,
  Message,
  MessageBody,
  SendOptions,
} from './types.js';

const TYPING_TIMEOUT_MS = 4000;
const READ_DEBOUNCE_MS = 1000;

export interface SessionOptions {
  ctx: TesseraContext;
  config: ChatConfigValue;
  room: Room;
  conversation: Conversation;
  /** Called whenever the conversation's summary (last message, unread) changes. */
  onSummary(conversation: Conversation): void;
  /** Called for every author seen, so the API can show names for direct conversations. */
  onUser?(user: UserInfo): void;
  /** Whether the page is visible; reading only counts while it is. */
  visible?: () => boolean;
}

/** One conversation's shared state. Controllers are thin views on it. */
export interface Session {
  readonly id: string;
  readonly state: ReadonlyStore<ConversationState>;
  readonly conversation: ReadonlyStore<Conversation>;
  controller(): ConversationController;
  /** Loads the newest page once; later calls return the same promise. */
  ensureLoaded(): Promise<void>;
  /**
   * Adopts the server's unread count unless the user has already read something in this session.
   * `lastId` is the newest message the count covers; messages that arrived live after it are added.
   */
  syncUnread(unread: number, lastId: string | undefined): void;
  dispose(): Promise<void>;
}

interface PendingSend {
  body: MessageBody;
  files: File[];
  replyTo: string | undefined;
  uploaded: Message['attachments'];
}

const defaultVisible = (): boolean =>
  typeof document === 'undefined' ? true : document.visibilityState === 'visible';

/** Builds the state machine for one conversation on top of an already-joined room. */
export function createSession(opts: SessionOptions): Session {
  const { ctx, config, room } = opts;
  const id = opts.conversation.id;
  const self: UserInfo = room.self.user;
  const visible = opts.visible ?? defaultVisible;

  const state = createStore<ConversationState>({
    messages: [],
    hasMore: false,
    loading: false,
    typing: [],
    readBy: {},
    unread: opts.conversation.unread,
    firstUnreadId: undefined,
    error: undefined,
  });
  const summary = createStore<Conversation>(opts.conversation);

  const pending = new Map<string, PendingSend>();
  const markers = new Map<string, string>();
  const knownUsers = new Map<string, UserInfo>();
  // Ids of messages from others that were counted as unread because they arrived live.
  let liveUnread: string[] = [];
  let loaded: Promise<void> | undefined;
  let typingOn = false;
  let typingTimer: ReturnType<typeof setTimeout> | undefined;
  let readTimer: ReturnType<typeof setTimeout> | undefined;
  let readTarget: string | undefined;
  let disposed = false;
  const offs: Unsubscribe[] = [];

  const call = async <T extends RequestTopic>(
    topic: T,
    data: TopicRequest<T>,
  ): Promise<TopicResponse<T>> => {
    const raw = await room.request(topic, data);
    const parsed = TopicSchemas[topic].response.safeParse(raw);
    if (!parsed.success) {
      throw new TesseraError('UNKNOWN', `The server sent an unexpected "${topic}" response`);
    }
    return parsed.data as TopicResponse<T>;
  };

  const userInfo = (userId: string): UserInfo => {
    const known = knownUsers.get(userId);
    if (known) return known;
    const peer = room.peers.get().find((p) => p.user.id === userId);
    return peer?.user ?? { id: userId, name: userId };
  };

  const remember = (m: Message): void => {
    const user: UserInfo = {
      id: m.authorId,
      name: m.authorName,
      ...(m.authorAvatarUrl ? { avatarUrl: m.authorAvatarUrl } : {}),
    };
    knownUsers.set(m.authorId, user);
    opts.onUser?.(user);
  };

  const readByMarkers = (): Record<string, UserInfo[]> => {
    const out: Record<string, UserInfo[]> = {};
    for (const [userId, messageId] of markers) {
      if (userId === self.id) continue;
      out[messageId] = [...(out[messageId] ?? []), userInfo(userId)];
    }
    return out;
  };

  const countUnread = (messages: readonly Message[]): number => {
    const marker = markers.get(self.id);
    return messages.filter(
      (m) => m.authorId !== self.id && !m.deletedAt && isStored(m) && (!marker || m.id > marker),
    ).length;
  };

  /** Keeps the summary shown in conversation lists in step with the state. */
  const publishSummary = (): void => {
    const { messages, unread } = state.get();
    const last = [...messages].reverse().find(isStored);
    const next: Conversation = {
      ...summary.get(),
      unread,
      ...(last ? { lastMessage: last } : {}),
    };
    summary.set(next);
    opts.onSummary(next);
  };

  const patch = (change: Partial<ConversationState>): void => {
    state.set((prev) => ({ ...prev, ...change }));
    publishSummary();
  };

  const putMessage = (message: Message): void => {
    remember(message);
    patch({ messages: upsert(state.get().messages, message) });
  };

  const patchMessage = (messageId: string, change: (m: Message) => Message): void => {
    const messages = state.get().messages;
    const index = messages.findIndex((m) => m.id === messageId);
    const current = messages[index];
    if (index < 0 || !current) return;
    const next = [...messages];
    next[index] = change(current);
    patch({ messages: next });
  };

  // ---------- history ----------

  const oldestStored = (): string | undefined => state.get().messages.find(isStored)?.id;
  const newestStored = (): string | undefined => state.get().messages.findLast(isStored)?.id;

  const merge = (incoming: readonly Message[]): void => {
    let messages = state.get().messages;
    for (const m of incoming) {
      remember(m);
      messages = upsert(messages, m);
    }
    state.set((prev) => ({ ...prev, messages }));
  };

  const firstUnreadFrom = (messages: readonly Message[], unread: number): string | undefined => {
    if (unread <= 0) return undefined;
    const others = messages.filter((m) => m.authorId !== self.id && !m.deletedAt && isStored(m));
    return others.at(-unread)?.id;
  };

  const loadLatest = async (): Promise<void> => {
    patch({ loading: true, error: undefined });
    try {
      const res = await call('chat.history', { conversationId: id, limit: config.pageSize });
      batch(() => {
        merge(res.messages as Message[]);
        const { messages, unread } = state.get();
        state.set((prev) => ({
          ...prev,
          hasMore: res.hasMore,
          firstUnreadId: firstUnreadFrom(messages, unread),
        }));
      });
    } catch (error) {
      patch({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      patch({ loading: false });
    }
  };

  const loadOlder = async (): Promise<void> => {
    const { hasMore, loading } = state.get();
    const before = oldestStored();
    if (!hasMore || loading || !before) return;
    patch({ loading: true });
    try {
      const res = await call('chat.history', {
        conversationId: id,
        before,
        limit: config.pageSize,
      });
      batch(() => {
        merge(res.messages as Message[]);
        state.set((prev) => ({ ...prev, hasMore: res.hasMore }));
      });
    } catch (error) {
      patch({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      patch({ loading: false });
    }
  };

  /** After a reconnect: fetch what was missed, page by page, until caught up. */
  const fillGap = async (): Promise<void> => {
    let after = newestStored();
    if (!after) return;
    for (;;) {
      const res: TopicResponse<'chat.history'> = await call('chat.history', {
        conversationId: id,
        after,
        limit: config.pageSize,
      });
      merge(res.messages as Message[]);
      const last: { id: string } | undefined = res.messages.at(-1);
      if (!res.hasMore || !last) break;
      after = last.id;
    }
    patch({ unread: countUnread(state.get().messages) });
  };

  // ---------- live events ----------

  const onMessage = (data: unknown): void => {
    const parsed = MessageSchema.safeParse(data);
    if (!parsed.success || parsed.data.conversationId !== id) return;
    const message: Message = parsed.data;
    const own = message.authorId === self.id;
    const known = state.get().messages.some((m) => m.id === message.id);
    if (own && pending.has(message.clientId)) message.status = 'sent';
    batch(() => {
      putMessage(message);
      if (!own && !known && !message.deletedAt) {
        liveUnread.push(message.id);
        state.set((prev) => ({ ...prev, unread: prev.unread + 1 }));
        publishSummary();
      }
    });
    if (!own && !known) ctx.bus.emit('chat:message-received', message);
  };

  const onUpdated = (data: unknown): void => {
    const parsed = MessageSchema.safeParse(data);
    if (!parsed.success || parsed.data.conversationId !== id) return;
    const message: Message = parsed.data;
    batch(() => {
      putMessage(message);
      patch({ unread: countUnread(state.get().messages) });
    });
  };

  const onReaction = (data: unknown): void => {
    const parsed = ChatReactionEvent.safeParse(data);
    if (!parsed.success || parsed.data.conversationId !== id) return;
    const { messageId, emoji, userId, on } = parsed.data;
    patchMessage(messageId, (m) => ({
      ...m,
      reactions: withReaction(m.reactions, emoji, userId, on),
    }));
  };

  const onRead = (data: unknown): void => {
    const parsed = ChatReadEvent.safeParse(data);
    if (!parsed.success || parsed.data.conversationId !== id) return;
    const { userId, messageId } = parsed.data;
    const current = markers.get(userId);
    if (current && current >= messageId) return;
    markers.set(userId, messageId);
    batch(() => {
      state.set((prev) => ({ ...prev, readBy: readByMarkers() }));
      if (userId === self.id) patch({ unread: countUnread(state.get().messages) });
    });
  };

  const syncTyping = (): void => {
    if (!config.features.typingIndicators) return;
    const seen = new Set<string>();
    const typing: UserInfo[] = [];
    for (const peer of room.peers.get()) {
      if (peer.presence.typing !== true || peer.user.id === self.id || seen.has(peer.user.id))
        continue;
      seen.add(peer.user.id);
      typing.push(peer.user);
    }
    state.set((prev) => ({ ...prev, typing }));
  };

  offs.push(
    room.on('chat.message', onMessage),
    room.on('chat.message-updated', onUpdated),
    room.on('chat.reaction', onReaction),
    room.on('chat.read', onRead),
    room.on('$reconnected', () => {
      void fillGap().catch((error: unknown) =>
        ctx.logger.warn('could not catch up after reconnecting', error),
      );
    }),
    room.peers.subscribe(syncTyping),
  );

  // ---------- sending ----------

  const optimistic = (clientId: string, p: PendingSend): Message => ({
    id: clientId,
    clientId,
    conversationId: id,
    authorId: self.id,
    authorName: self.name,
    ...(self.avatarUrl ? { authorAvatarUrl: self.avatarUrl } : {}),
    body: p.body,
    attachments: [],
    ...(p.replyTo ? { replyTo: p.replyTo } : {}),
    reactions: {},
    createdAt: new Date(ctx.clock.now()).toISOString(),
    status: 'sending',
  });

  const setOwnStatus = (clientId: string, change: Partial<Message>): void => {
    patchMessage(clientId, (m) => ({ ...m, ...change }));
  };

  const deliver = async (clientId: string): Promise<Message> => {
    const p = pending.get(clientId);
    if (!p) throw new TesseraError('NOT_FOUND', 'That message is not waiting to be sent');
    setOwnStatus(clientId, { status: 'sending' });
    try {
      for (const [index, file] of p.files.entries()) {
        if (index < p.uploaded.length) continue;
        const result = await ctx.uploads().upload(file, {
          name: file.name,
          onProgress: (fraction) =>
            setOwnStatus(clientId, { progress: (index + fraction) / p.files.length }),
        });
        p.uploaded.push({
          id: result.id,
          url: result.url,
          name: file.name.slice(0, 255),
          mime: result.mime,
          size: result.size,
          ...(result.width ? { width: result.width } : {}),
          ...(result.height ? { height: result.height } : {}),
        });
      }
      const stored = await call('chat.send', {
        conversationId: id,
        clientId,
        body: p.body,
        ...(p.uploaded.length > 0 ? { attachments: p.uploaded } : {}),
        ...(p.replyTo ? { replyTo: p.replyTo } : {}),
      });
      pending.delete(clientId);
      const message: Message = { ...stored, status: 'sent' };
      putMessage(message);
      ctx.bus.emit('chat:message-sent', message);
      return message;
    } catch (error) {
      setOwnStatus(clientId, { status: 'failed' });
      throw error;
    }
  };

  const validate = (body: MessageBody, files: File[]): void => {
    if (body.type === 'text') {
      const text = body.text.trim();
      if (text.length === 0 && files.length === 0) {
        throw new TesseraError('VALIDATION', 'A message needs text or an attachment');
      }
      if (body.text.length > config.composer.maxLength) {
        throw new TesseraError(
          'VALIDATION',
          `A message can have at most ${config.composer.maxLength} characters`,
        );
      }
    }
  };

  // ---------- reading and typing ----------

  const flushRead = (): void => {
    readTimer = undefined;
    const target = readTarget;
    if (!target || !visible() || disposed) return;
    readTarget = undefined;
    call('chat.read', { conversationId: id, messageId: target }).catch((error: unknown) =>
      ctx.logger.warn('could not mark the conversation as read', error),
    );
  };

  const onVisibility = (): void => {
    if (readTarget && visible() && readTimer === undefined) {
      readTimer = setTimeout(flushRead, READ_DEBOUNCE_MS);
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    offs.push(() => document.removeEventListener('visibilitychange', onVisibility));
  }

  const setTyping = (on: boolean): void => {
    if (!config.features.typingIndicators || disposed) return;
    clearTimeout(typingTimer);
    typingTimer = undefined;
    if (on) {
      if (!typingOn) {
        typingOn = true;
        room.setPresence({ typing: true });
      }
      typingTimer = setTimeout(() => setTyping(false), TYPING_TIMEOUT_MS);
    } else if (typingOn) {
      typingOn = false;
      room.setPresence({ typing: false });
    }
  };

  const markRead = (messageId?: string): void => {
    const messages = state.get().messages;
    const target = messageId ?? messages.findLast(isStored)?.id;
    if (!target) return;
    const current = markers.get(self.id);
    if (current && current >= target) return;
    if (!visible()) {
      // Counts once the page is visible again.
      readTarget = readTarget && readTarget > target ? readTarget : target;
      return;
    }
    markers.set(self.id, target);
    readTarget = readTarget && readTarget > target ? readTarget : target;
    patch({ unread: countUnread(messages) });
    clearTimeout(readTimer);
    readTimer = setTimeout(flushRead, READ_DEBOUNCE_MS);
  };

  // ---------- controller ----------

  const requireStored = (messageId: string): Message => {
    const m = state.get().messages.find((x) => x.id === messageId);
    if (!m || !isStored(m)) throw new TesseraError('NOT_FOUND', 'Message does not exist');
    return m;
  };

  const controller = (): ConversationController => {
    let closed = false;
    const guard =
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        if (closed) throw new TesseraError('TRANSPORT_CLOSED', 'This conversation was closed');
        return fn(...args);
      };
    return {
      id,
      conversation: summary,
      state,
      send: guard(async (body: MessageBody, sendOpts?: SendOptions) => {
        const files = sendOpts?.attachments ?? [];
        validate(body, files);
        if (files.length > 0 && !config.composer.attachments) {
          throw new TesseraError('VALIDATION', 'Attachments are turned off');
        }
        const clientId = ctx.ids.next();
        const p: PendingSend = { body, files, replyTo: sendOpts?.replyTo, uploaded: [] };
        pending.set(clientId, p);
        putMessage(optimistic(clientId, p));
        setTyping(false);
        return deliver(clientId);
      }),
      retry: guard(async (clientId: string) => {
        await deliver(clientId);
      }),
      loadOlder: guard(loadOlder),
      edit: guard(async (messageId: string, body: MessageBody) => {
        requireStored(messageId);
        validate(body, []);
        putMessage({ ...(await call('chat.edit', { messageId, body })) });
      }),
      remove: guard(async (messageId: string) => {
        requireStored(messageId);
        putMessage({ ...(await call('chat.delete', { messageId })) });
        patch({ unread: countUnread(state.get().messages) });
      }),
      react: guard(async (messageId: string, emoji: string) => {
        const m = requireStored(messageId);
        const on = !(m.reactions[emoji]?.includes(self.id) ?? false);
        patchMessage(messageId, (x) => ({
          ...x,
          reactions: withReaction(x.reactions, emoji, self.id, on),
        }));
        try {
          await call('chat.react', { messageId, emoji, on });
        } catch (error) {
          patchMessage(messageId, (x) => ({
            ...x,
            reactions: withReaction(x.reactions, emoji, self.id, !on),
          }));
          throw error;
        }
      }),
      setTyping: guard(setTyping),
      markRead: guard(markRead),
      close() {
        closed = true;
      },
    };
  };

  return {
    id,
    state,
    conversation: summary,
    controller,
    ensureLoaded() {
      loaded ??= loadLatest().catch((error: unknown) => {
        loaded = undefined;
        throw error;
      });
      return loaded;
    },
    syncUnread(unread, lastId) {
      if (markers.has(self.id)) return;
      // The server's count covers messages up to `lastId`; later ones arrived live and still count.
      liveUnread = liveUnread.filter((messageId) => lastId === undefined || messageId > lastId);
      const total = unread + liveUnread.length;
      if (state.get().unread !== total) patch({ unread: total });
    },
    async dispose() {
      disposed = true;
      clearTimeout(typingTimer);
      clearTimeout(readTimer);
      for (const off of offs.splice(0)) off();
      if (typingOn) room.setPresence({ typing: false });
      await room.leave();
    },
  };
}
