import type { TesseraContext } from '@tessera/core';
import { browserEnv, type CallEnv, createCall } from './call.js';
import type { VideoConfigValue } from './config.js';
import type { CallController, VideoApi } from './types.js';

/** The `video` feature API. `env` lets tests replace the browser's WebRTC and media devices. */
export function createVideoApi(
  ctx: TesseraContext,
  config: VideoConfigValue,
  env: CallEnv = browserEnv,
): VideoApi & { dispose(): Promise<void> } {
  const calls = new Map<string, CallController>();
  return {
    config,
    call(callId) {
      const existing = calls.get(callId);
      if (existing) return existing;
      const controller: CallController = createCall({
        ctx,
        config,
        id: callId,
        env,
        onEnded: () => {
          if (calls.get(callId) === controller) calls.delete(callId);
        },
      });
      calls.set(callId, controller);
      return controller;
    },
    async dispose() {
      const open = [...calls.values()];
      calls.clear();
      await Promise.all(open.map((c) => c.leave()));
    },
  };
}
