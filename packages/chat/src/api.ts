import {
  createStore,
  type Room,
  type TesseraContext,
  TesseraError,
  type Transport,
} from '@tessera/core';
import { ChatConversationsRes, ChatOpenDirectRes, TopicSchemas } from '@tessera/protocol';
import type { ChatConfigValue } from './config.js';
import { createLocalChatServer } from './local-server.js';
import { installNotifications } from './notify.js';
import { createSession, type Session } from './session.js';
import { CONTROL_ROOM, chatRoomName } from './topics.js';
import type { ChatApi, Conversation, ConversationController } from './types.js';

/** Joined rooms cost the connection a slot each; unread counts are tracked for this many. */
const MAX_WATCHED = 20;

interface Entry {
  session: Promise<Session>;
  refs: number;
  watched: boolean;
}

interface RegistersHandlers {
  registerHandler(
    topic: string,
    fn: (
      data: unknown,
      ctx: {
        user: import('@tessera/core').UserInfo;
        broadcast(topic: string, data: unknown): void;
      },
    ) => unknown,
  ): () => void;
}

const canRegister = (t: Transport): t is Transport & RegistersHandlers =>
  typeof (t as Partial<RegistersHandlers>).registerHandler === 'function';

/** The `chat` feature API. */
export function createChatApi(
  ctx: TesseraContext,
  config: ChatConfigValue,
): ChatApi & { dispose(): Promise<void> } {
  const transport = ctx.transport();
  if (!transport) throw new TesseraError('ADAPTER_MISSING', 'Chat needs a transport');

  const offs: Array<() => void> = [];

  // Without a server that keeps history, this tab answers `chat.*` requests itself.
  if (!transport.capabilities.serverHistory) {
    if (canRegister(transport)) {
      const server = createLocalChatServer(ctx, config.conversations);
      for (const topic of Object.keys(TopicSchemas)) {
        offs.push(
          transport.registerHandler(topic, (data, hctx) =>
            server.handle(topic, data, { user: hctx.user, broadcast: hctx.broadcast }),
          ),
        );
      }
    } else {
      ctx.logger.warn(
        'The transport keeps no chat history and cannot host local handlers; chat requests will fail.',
      );
    }
  }

  const titles = new Map(config.conversations.map((c) => [c.id, c.title]));
  const summaries = new Map<string, Conversation>();
  const order: string[] = [];
  const conversations = createStore<Conversation[]>([]);
  const totalUnread = conversations.select((list) => list.reduce((n, c) => n + c.unread, 0));
  const entries = new Map<string, Entry>();
  let control: Promise<Room> | undefined;
  let initialised: Promise<void> | undefined;
  let disposed = false;

  const publish = (): void => {
    const list = order.map((id) => summaries.get(id)).filter((c): c is Conversation => !!c);
    // Most recently active first; conversations without messages keep their configured order.
    const sorted = list
      .map((c, index) => ({ c, index }))
      .sort((a, b) => {
        const x = a.c.lastMessage?.id;
        const y = b.c.lastMessage?.id;
        if (x && y) return x < y ? 1 : x > y ? -1 : 0;
        if (x || y) return x ? -1 : 1;
        return a.index - b.index;
      })
      .map((e) => e.c);
    conversations.set(sorted);
  };

  const setSummary = (conversation: Conversation): void => {
    const known = summaries.get(conversation.id);
    const title = conversation.title ?? known?.title ?? titles.get(conversation.id);
    summaries.set(conversation.id, { ...conversation, ...(title ? { title } : {}) });
    if (!order.includes(conversation.id)) order.push(conversation.id);
    publish();
  };

  let lastTotal = 0;
  offs.push(
    totalUnread.subscribe((total) => {
      if (total !== lastTotal) {
        lastTotal = total;
        ctx.bus.emit('chat:unread-changed', { total });
      }
    }),
  );

  const controlRoom = (): Promise<Room> => {
    control ??= transport.join(CONTROL_ROOM).catch((error: unknown) => {
      control = undefined;
      throw error;
    });
    return control;
  };

  const startSession = (meta: Conversation, watched: boolean): Entry => {
    const entry: Entry = {
      refs: 0,
      watched,
      session: transport
        .join(chatRoomName(meta.id))
        .then((room) =>
          createSession({ ctx, config, room, conversation: meta, onSummary: setSummary }),
        ),
    };
    entry.session.catch(() => entries.delete(meta.id));
    entries.set(meta.id, entry);
    setSummary(meta);
    return entry;
  };

  const initialise = async (): Promise<void> => {
    const room = await controlRoom();
    const raw = await room.request('chat.conversations', {});
    const parsed = ChatConversationsRes.safeParse(raw);
    if (!parsed.success) {
      throw new TesseraError('UNKNOWN', 'The server sent an unexpected conversation list');
    }
    const known = new Map<string, Conversation>(
      parsed.data.conversations.map((c) => [c.id, c as Conversation]),
    );
    // Configured rooms exist before anyone has written to them.
    for (const c of config.conversations) {
      if (!known.has(c.id)) known.set(c.id, { id: c.id, kind: 'room', title: c.title, unread: 0 });
    }
    let watched = 0;
    const started: Entry[] = [];
    for (const meta of known.values()) {
      if (!config.directMessages && meta.kind === 'direct') continue;
      const existing = entries.get(meta.id);
      if (existing) continue;
      if (watched < MAX_WATCHED) {
        watched++;
        started.push(
          startSession({ ...meta, title: meta.title ?? titles.get(meta.id) ?? meta.title }, true),
        );
      } else setSummary(meta);
    }

    // Messages sent between the list request and joining a room were counted by neither side, so
    // ask once more now that every watched room is joined and let the server's count win.
    if (started.length === 0) return;
    await Promise.all(started.map((entry) => entry.session));
    const again = ChatConversationsRes.safeParse(await room.request('chat.conversations', {}));
    if (!again.success) return;
    for (const c of again.data.conversations) {
      const entry = entries.get(c.id);
      if (entry) void entry.session.then((s) => s.syncUnread(c.unread));
    }
  };

  const ensureInitialised = (): Promise<void> => {
    initialised ??= initialise().catch((error: unknown) => {
      initialised = undefined;
      throw error;
    });
    return initialised;
  };

  // Chat keeps working when the server is unreachable at start: the list fills in once it is not.
  const warm = (): void => {
    void ensureInitialised().catch((error: unknown) =>
      ctx.logger.warn('could not load the conversation list', error),
    );
  };
  if (transport.state.get() === 'open' || transport.state.get() === 'idle') warm();
  offs.push(
    transport.state.subscribe((state) => {
      if (state === 'open' && !initialised && !disposed) warm();
    }),
  );

  const acquire = async (id: string, meta?: Conversation): Promise<ConversationController> => {
    await ensureInitialised();
    let entry = entries.get(id);
    if (!entry) {
      entry = startSession(
        meta ??
          summaries.get(id) ?? {
            id,
            kind: id.startsWith('dm:') ? 'direct' : 'room',
            ...(titles.get(id) ? { title: titles.get(id) as string } : {}),
            unread: 0,
          },
        false,
      );
    }
    entry.refs += 1;
    const { session } = entry;
    const live = await session;
    try {
      await live.ensureLoaded();
    } catch (error) {
      entry.refs -= 1;
      throw error;
    }
    const controller = live.controller();
    const close = controller.close.bind(controller);
    let released = false;
    controller.close = () => {
      close();
      if (released) return;
      released = true;
      const current = entries.get(id);
      if (!current) return;
      current.refs -= 1;
      if (current.refs <= 0 && !current.watched) {
        entries.delete(id);
        void live.dispose();
      }
    };
    return controller;
  };

  const stopNotifications = installNotifications(ctx, config.notifications, totalUnread);

  const api: ChatApi & { dispose(): Promise<void> } = {
    config,
    conversations,
    totalUnread,
    openConversation: (id) => acquire(id),
    async openDirect(userId) {
      if (!config.directMessages) {
        throw new TesseraError('FORBIDDEN', 'Direct messages are turned off');
      }
      await ensureInitialised();
      const room = await controlRoom();
      const parsed = ChatOpenDirectRes.safeParse(
        await room.request('chat.open-direct', { userId }),
      );
      if (!parsed.success) {
        throw new TesseraError('UNKNOWN', 'The server sent an unexpected conversation');
      }
      return acquire(parsed.data.id, parsed.data as Conversation);
    },
    async dispose() {
      disposed = true;
      stopNotifications();
      for (const off of offs.splice(0)) off();
      const all = [...entries.values()];
      entries.clear();
      for (const entry of all)
        await entry.session.then(
          (s) => s.dispose(),
          () => undefined,
        );
      await control?.then(
        (room) => room.leave(),
        () => undefined,
      );
    },
  };
  return api;
}
