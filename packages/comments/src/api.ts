import { createStore, type ReadonlyStore, type TesseraContext } from '@tessera-kit/core';
import { createCollection } from '@tessera-kit/storage';
import type { CommentsConfigValue } from './config.js';
import { ThreadSchema } from './schemas.js';
import { openThread } from './thread.js';
import type { CommentsApi, ThreadController } from './types.js';

/** The `comments` feature API. */
export function createCommentsApi(
  ctx: TesseraContext,
  config: CommentsConfigValue,
): CommentsApi & { dispose(): void } {
  const coll = createCollection(ctx, 'comments.threads', ThreadSchema);
  const open = new Set<ThreadController>();
  const stops = new Set<() => void>();

  return {
    config,

    async thread(targetId) {
      const controller = await openThread({ ctx, config, coll, targetId });
      open.add(controller);
      const close = controller.close.bind(controller);
      controller.close = () => {
        open.delete(controller);
        close();
      };
      return controller;
    },

    count(targetId): ReadonlyStore<number> {
      // A count only costs something while somebody watches it: the thread is opened on the first
      // subscriber and closed with the last.
      const store = createStore(0);
      let subscribers = 0;
      let controller: ThreadController | undefined;
      let stopFollowing: (() => void) | undefined;
      let opening = false;

      const start = (): void => {
        if (opening || controller) return;
        opening = true;
        openThread({ ctx, config: { ...config, live: true }, coll, targetId })
          .then((thread) => {
            opening = false;
            if (subscribers === 0) {
              thread.close();
              return;
            }
            controller = thread;
            store.set(thread.state.get().count);
            stopFollowing = thread.state.subscribe((s) => store.set(s.count));
            stops.add(stop);
          })
          .catch((error: unknown) => {
            opening = false;
            ctx.logger.debug('could not count comments', error);
          });
      };
      const stop = (): void => {
        stopFollowing?.();
        stopFollowing = undefined;
        controller?.close();
        controller = undefined;
        stops.delete(stop);
      };

      return {
        get: store.get,
        select: store.select,
        subscribe(fn) {
          subscribers += 1;
          if (subscribers === 1) start();
          const off = store.subscribe(fn);
          return () => {
            off();
            subscribers -= 1;
            if (subscribers === 0) stop();
          };
        },
      };
    },

    dispose() {
      for (const controller of [...open]) controller.close();
      for (const stop of [...stops]) stop();
    },
  };
}
