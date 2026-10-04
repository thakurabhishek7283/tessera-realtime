import { definePlugin } from '@tessera-kit/core';
import { createVideoApi } from './api.js';
import { VideoConfig } from './config.js';
import { de } from './i18n/de.js';
import { en } from './i18n/en.js';
import type { VideoApi } from './types.js';

const disposers = new WeakMap<VideoApi, () => Promise<void>>();

/**
 * The `video` feature: WebRTC calls between up to six people, signalled through the instance's
 * transport. With the `local` transport two tabs of one browser can call each other with no
 * backend; with tessera-server the same code works across the internet (add TURN for strict
 * networks).
 *
 * @example
 * createTessera(cfg, { plugins: { video: () => import('@tessera-kit/video') } });
 */
export const videoPlugin = definePlugin({
  id: 'video',
  version: '0.1.0',
  configSchema: VideoConfig,
  requires: ['transport'],
  messages: { en, de },
  setup(ctx, config): VideoApi {
    const api = createVideoApi(ctx, config);
    disposers.set(api, api.dispose);
    return api;
  },
  async teardown(api) {
    await disposers.get(api)?.();
  },
});

export default videoPlugin;
