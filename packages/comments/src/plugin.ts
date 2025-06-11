import { definePlugin } from '@tessera/core';
import { createCommentsApi } from './api.js';
import { CommentsConfig } from './config.js';
import { de } from './i18n/de.js';
import { en } from './i18n/en.js';
import type { CommentsApi } from './types.js';

const disposers = new WeakMap<CommentsApi, () => void>();

/**
 * The `comments` feature: a thread per target (a listing, a card, an annotation…), stored through
 * the instance's storage adapter. A transport is optional: with one, other people's comments show
 * up as they are written.
 *
 * @example
 * createTessera(cfg, { plugins: { comments: () => import('@tessera/comments') } });
 */
export const commentsPlugin = definePlugin({
  id: 'comments',
  version: '0.1.0',
  configSchema: CommentsConfig,
  requires: ['storage'],
  messages: { en, de },
  setup(ctx, config): CommentsApi {
    const api = createCommentsApi(ctx, config);
    disposers.set(api, api.dispose);
    return api;
  },
  teardown(api) {
    disposers.get(api)?.();
  },
});

export default commentsPlugin;
