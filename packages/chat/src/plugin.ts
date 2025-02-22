import { definePlugin } from '@tessera/core';
import { createChatApi } from './api.js';
import { ChatConfig } from './config.js';
import type { ChatApi } from './types.js';

const disposers = new WeakMap<ChatApi, () => Promise<void>>();

/**
 * The `chat` feature: rooms and direct conversations over the instance's transport. With the
 * `local` transport, tabs of one browser share conversations through the storage adapter; with a
 * server transport (tessera-server) history and read state live on the server.
 *
 * @example
 * createTessera(cfg, { plugins: { chat: () => import('@tessera/chat') } });
 */
export const chatPlugin = definePlugin({
  id: 'chat',
  version: '0.1.0',
  configSchema: ChatConfig,
  requires: ['transport'],
  setup(ctx, config): ChatApi {
    const api = createChatApi(ctx, config);
    disposers.set(api, api.dispose);
    return api;
  },
  async teardown(api) {
    await disposers.get(api)?.();
  },
});

export default chatPlugin;
