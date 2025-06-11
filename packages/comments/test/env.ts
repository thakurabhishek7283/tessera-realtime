import { createTessera, type StorageAdapter, type Transport, type UserInfo } from '@tessera/core';
import { createMemoryStorage, createUploads } from '@tessera/storage';
import {
  alice,
  createFakeClock,
  createSequentialIds,
  type FakeClock,
  type FakeHub,
} from '@tessera/testing';
import type { CommentsApi } from '../src/index.js';

export interface Tab {
  api: CommentsApi;
  instance: ReturnType<typeof createTessera>;
  user: UserInfo;
}

export interface World {
  clock: FakeClock;
  storage: StorageAdapter;
  hub: FakeHub | undefined;
  tab(user?: UserInfo, comments?: Record<string, unknown>): Promise<Tab>;
}

export async function until(fn: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('until(): timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/**
 * Tabs that share one storage adapter, like tabs of one browser profile. With a hub they are also
 * connected through a transport; `storage` can be replaced to simulate slow or failing storage.
 */
export function createWorld(
  opts: { hub?: FakeHub; storage?: (base: StorageAdapter) => StorageAdapter } = {},
): World {
  const clock = opts.hub?.clock ?? createFakeClock();
  const ids = createSequentialIds();
  const base = createMemoryStorage({ clock, userId: () => undefined });
  const storage = opts.storage ? opts.storage(base) : base;
  return {
    clock,
    storage,
    hub: opts.hub,
    async tab(user = alice, comments = {}) {
      const transport = opts.hub?.transport(user);
      const instance = createTessera(
        {
          appId: 'comments-test',
          auth: { type: 'static', user },
          storage: { type: 'custom', adapter: storage },
          uploads: { type: 'dataurl' },
          transport: transport
            ? { type: 'custom', create: (): Transport => transport }
            : { type: 'none' },
          features: { comments: { enabled: true, ...comments } },
        },
        {
          plugins: { comments: () => import('../src/plugin.js') },
          clock,
          ids,
          adapters: { uploads: createUploads },
        },
      );
      await instance.ready;
      const api = instance.feature('comments');
      if (!api) throw new Error('comments did not start');
      return { api, instance, user };
    },
  };
}
