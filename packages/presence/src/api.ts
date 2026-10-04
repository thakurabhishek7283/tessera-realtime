import type { TesseraContext } from '@tessera-kit/core';
import { TesseraError } from '@tessera-kit/core';
import type { PresenceConfigValue } from './config.js';
import { createPresenceHandle, type SharedPresence } from './handle.js';
import type { PresenceApi, PresenceHandle } from './types.js';

interface Joined {
  handle: SharedPresence;
  refs: number;
}

/** The `presence` feature API: join a scope to see who else is there. */
export function createPresenceApi(
  ctx: TesseraContext,
  config: PresenceConfigValue,
): PresenceApi & { dispose(): Promise<void> } {
  const scopes = new Map<string, Promise<Joined>>();

  const release = async (scope: string): Promise<void> => {
    const entry = await scopes.get(scope);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    scopes.delete(scope);
    await entry.handle.dispose();
  };

  return {
    config,
    async join(scope = config.scope): Promise<PresenceHandle> {
      let pending = scopes.get(scope);
      if (!pending) {
        const transport = ctx.transport();
        if (!transport) {
          throw new TesseraError('ADAPTER_MISSING', 'Presence needs a transport');
        }
        pending = transport
          .join(`presence:${scope}`, { presence: { status: 'active' } })
          .then((room): Joined => {
            const handle = createPresenceHandle({ ctx, config, scope, room });
            return { handle, refs: 0 };
          });
        scopes.set(scope, pending);
        // A failed join must not poison later attempts.
        pending.catch(() => scopes.delete(scope));
      }
      const entry = await pending;
      entry.refs += 1;
      let released = false;
      return {
        scope,
        peers: entry.handle.peers,
        cursors: entry.handle.cursors,
        set: (state) => entry.handle.set(state),
        leave: async () => {
          if (released) return;
          released = true;
          await release(scope);
        },
      };
    },
    async dispose() {
      const all = [...scopes.values()];
      scopes.clear();
      for (const pending of all)
        await pending.then(
          (e) => e.handle.dispose(),
          () => undefined,
        );
    },
  };
}
