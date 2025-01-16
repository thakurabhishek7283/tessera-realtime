import type { UserInfo } from '@tessera/core';
import { alice, createTestInstance, type FakeHub, type TestInstance } from '@tessera/testing';
import type { PresenceApi } from '../src/index.js';

export interface Env extends TestInstance {
  api: PresenceApi;
}

/** One simulated browser tab for `user`, with the presence feature on. */
export async function tab(
  hub: FakeHub,
  user: UserInfo = alice,
  presence: Record<string, unknown> = {},
): Promise<Env> {
  const test = await createTestInstance(
    { appId: hub.appId, features: { presence: { enabled: true, ...presence } } },
    { presence: () => import('../src/plugin.js') },
    { hub, user },
  );
  const api = test.instance.feature('presence');
  if (!api) throw new Error('presence did not start');
  return { ...test, api };
}

export async function until(fn: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('until(): timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}
