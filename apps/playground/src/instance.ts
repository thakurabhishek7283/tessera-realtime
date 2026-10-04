import {
  createTessera,
  type PluginLoader,
  type TesseraConfig,
  type TesseraInstance,
  type ThemeMode,
  type UserInfo,
} from '@tessera-kit/core';
import { createStorage, createUploads } from '@tessera-kit/storage';
import { createTransport } from '@tessera-kit/transport';
import { SECTIONS } from './sections.js';
import { USERS } from './users.js';

export type Mode = 'local' | 'server';

export interface InstanceOptions {
  mode: Mode;
  serverUrl: string;
  user: string;
  theme: ThemeMode;
  locale: string;
  enabled: Record<string, boolean>;
  configs: Record<string, Record<string, unknown>>;
}

/** Signs in through the reference server's dev-mode guest endpoint. */
async function guestLogin(
  serverUrl: string,
  name: string,
): Promise<{ token: string; user: UserInfo }> {
  const res = await fetch(new URL('/v1/auth/guest', serverUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`The server answered ${res.status} to the guest login`);
  return (await res.json()) as { token: string; user: UserInfo };
}

/**
 * Builds the playground's Tessera instance. In `local` mode every tab talks through
 * BroadcastChannel and IndexedDB, so the page works with no backend at all; in `server` mode the
 * same kits use tessera-server over WebSocket and REST.
 */
export async function createInstance(opts: InstanceOptions): Promise<TesseraInstance> {
  const demoUser = USERS[opts.user] ?? USERS.alice;
  if (!demoUser) throw new Error('no demo users');
  const features: TesseraConfig['features'] = Object.fromEntries(
    SECTIONS.map((s) => [
      s.id,
      {
        ...s.defaults,
        // Calls through the server get time-limited TURN credentials from it.
        ...(s.id === 'video' && opts.mode === 'server'
          ? { iceServersUrl: new URL('/v1/ice', opts.serverUrl).href }
          : {}),
        ...opts.configs[s.id],
        enabled: opts.enabled[s.id] ?? true,
      },
    ]),
  );
  const plugins: Record<string, PluginLoader> = Object.fromEntries(
    SECTIONS.map((s) => [s.id, s.load]),
  );

  const base = {
    appId: 'realtime-playground',
    locale: opts.locale,
    theme: { mode: opts.theme },
    features,
  } satisfies Partial<TesseraConfig>;

  const config: TesseraConfig =
    opts.mode === 'server'
      ? await (async () => {
          const { token, user } = await guestLogin(opts.serverUrl, demoUser.name);
          const wsUrl = new URL('/v1/ws', opts.serverUrl);
          wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
          return {
            ...base,
            auth: { type: 'static', user, token },
            transport: { type: 'websocket', url: wsUrl.href },
            storage: { type: 'rest', baseUrl: opts.serverUrl },
            uploads: { type: 'rest', baseUrl: opts.serverUrl },
          } satisfies TesseraConfig;
        })()
      : {
          ...base,
          auth: { type: 'static', user: demoUser },
          transport: { type: 'local' },
          storage: { type: 'indexeddb', dbName: 'tessera-realtime-playground' },
          uploads: { type: 'dataurl' },
        };

  return createTessera(config, {
    plugins,
    adapters: { storage: createStorage, uploads: createUploads, transport: createTransport },
  });
}
