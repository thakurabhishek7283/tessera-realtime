import { createTessera, type StorageAdapter, type Transport, type UserInfo } from '@tessera/core';
import { createMemoryStorage, createUploads } from '@tessera/storage';
import {
  alice,
  createFakeClock,
  createSequentialIds,
  createTestInstance,
  type FakeClock,
  type FakeHub,
  type TestInstance,
} from '@tessera/testing';
import { createLocalTransport } from '@tessera/transport';
import type { ChatApi, ChatConfigValue } from '../src/index.js';
import { createLocalChatServer } from '../src/index.js';

export interface Tab extends TestInstance {
  api: ChatApi;
}

export type ChatOptions = Partial<Omit<ChatConfigValue, 'enabled'>>;

/** Waits until `fn` is true, polling every few milliseconds. */
export async function until(fn: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('until(): timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

export interface World {
  mode: 'server' | 'local';
  clock: FakeClock;
  /** Opens one more browser tab for `user`. */
  tab(user?: UserInfo, chat?: ChatOptions): Promise<Tab>;
  /** Lets queued deliveries finish. */
  settle(): Promise<void>;
  /** Server mode only. */
  hub?: FakeHub;
}

const pluginLoader = { chat: () => import('../src/plugin.js') };

/**
 * Server mode: tabs talk to a FakeHub that answers `chat.*` with the same engine the local mode
 * runs in the browser. Local mode: tabs use the real local transport over an in-memory
 * "BroadcastChannel" and share one storage adapter, like tabs of one browser profile.
 */
export async function createWorld(mode: World['mode'], hubClass: typeof FakeHub): Promise<World> {
  if (mode === 'server') {
    const hub = new hubClass({ appId: 'chat-test' });
    const server = await createTestInstance({ appId: 'chat-test', features: {} }, {});
    const engine = createLocalChatServer(
      {
        storage: server.instance.ctx.storage,
        logger: server.instance.ctx.logger,
        clock: hub.clock,
        ids: hub.ids,
      },
      [{ id: 'general', title: 'General' }],
    );
    for (const topic of [
      'chat.conversations',
      'chat.open-direct',
      'chat.send',
      'chat.history',
      'chat.edit',
      'chat.delete',
      'chat.react',
      'chat.read',
    ]) {
      hub.handle(topic, (data, hctx) =>
        engine.handle(topic, data, { user: hctx.user, broadcast: hctx.broadcast }),
      );
    }
    return {
      mode,
      hub,
      clock: hub.clock,
      settle: () => hub.settle(),
      async tab(user = alice, chat = {}) {
        const test = await createTestInstance(
          { appId: 'chat-test', features: { chat: { enabled: true, ...chat } } },
          pluginLoader,
          { hub, user },
        );
        return { ...test, api: must(test.instance.feature('chat')) };
      },
    };
  }

  const clock = createFakeClock();
  const ids = createSequentialIds();
  const storage = createMemoryStorage({ clock, userId: () => undefined });
  const bus = new Set<(event: MessageEvent) => void>();
  const channelFor = () => {
    const listeners = new Set<(event: MessageEvent) => void>();
    const mine = (event: MessageEvent): void => {
      for (const fn of listeners) fn(event);
    };
    bus.add(mine);
    return {
      postMessage(message: unknown) {
        const data = structuredClone(message);
        queueMicrotask(() => {
          for (const other of bus) if (other !== mine) other({ data } as MessageEvent);
        });
      },
      addEventListener(_type: 'message', fn: (event: MessageEvent) => void) {
        listeners.add(fn);
      },
      close() {
        bus.delete(mine);
      },
    };
  };
  return {
    mode,
    clock,
    settle: async () => {
      for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
    },
    async tab(user = alice, chat = {}) {
      const instance = createTessera(
        {
          appId: 'chat-test',
          auth: { type: 'static', user },
          storage: { type: 'custom', adapter: storage as StorageAdapter },
          uploads: { type: 'dataurl' },
          transport: {
            type: 'custom',
            create: (ctx): Transport =>
              createLocalTransport({
                appId: 'chat-test',
                user: () => user,
                ids,
                clock,
                logger: ctx.logger,
                createChannel: channelFor,
              }),
          },
          features: { chat: { enabled: true, ...chat } },
        },
        { plugins: pluginLoader, clock, ids, adapters: { uploads: createUploads } },
      );
      await instance.ready;
      return { instance, clock, transport: undefined, user, api: must(instance.feature('chat')) };
    },
  };
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('chat did not start');
  return value;
}
