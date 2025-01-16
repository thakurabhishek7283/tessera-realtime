import { definePlugin } from '@tessera/core';
import { createPresenceApi } from './api.js';
import { PresenceConfig } from './config.js';
import { de } from './i18n/de.js';
import { en } from './i18n/en.js';
import type { PresenceApi } from './types.js';

const disposers = new WeakMap<PresenceApi, () => Promise<void>>();

/**
 * The `presence` feature: who is here, how active they are and where their pointers are.
 *
 * @example
 * createTessera(cfg, { plugins: { presence: () => import('@tessera/presence') } });
 */
export const presencePlugin = definePlugin({
  id: 'presence',
  version: '0.1.0',
  configSchema: PresenceConfig,
  requires: ['transport'],
  messages: { en, de },
  setup(ctx, config): PresenceApi {
    const api = createPresenceApi(ctx, config);
    disposers.set(api, api.dispose);
    return api;
  },
  async teardown(api) {
    await disposers.get(api)?.();
  },
});

export default presencePlugin;
