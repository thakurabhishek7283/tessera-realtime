import { wrapElement } from '@tessera-internal/react-wrap';
import { createStore } from '@tessera-kit/core';
import { useFeature, useStore } from '@tessera-kit/react';
import { useEffect, useState } from 'react';
import type { TesseraCursorsElement } from '../elements/cursors.js';
import type { TesseraPresenceElement } from '../elements/presence.js';
import type { PresenceApi, PresenceCursor, PresenceHandle, PresenceUser } from '../types.js';

// Importing the elements module defines the tags. It touches `customElements`, so it only runs
// in the browser; on the server the wrapper renders an empty tag that upgrades after hydration.
if (typeof window !== 'undefined') void import('../elements/index.js');

export interface PresenceProps {
  scope?: string | undefined;
  /** Avatars shown before the rest collapse into "+N". */
  max?: number | undefined;
  onPresenceChange?: ((event: CustomEvent<{ peers: PresenceUser[] }>) => void) | undefined;
}

/** `<tessera-presence>` for React. */
export const Presence = wrapElement<TesseraPresenceElement, PresenceProps>({
  tag: 'tessera-presence',
  properties: [],
  attributes: { scope: 'scope', max: 'max' },
  events: { onPresenceChange: 'presence-change' },
});

export interface CursorsProps {
  scope?: string | undefined;
  /** CSS selector of the element whose pointer is shared; defaults to the parent. */
  target?: string | undefined;
}

/** `<tessera-cursors>` for React. Render it inside a `position: relative` container. */
export const Cursors = wrapElement<TesseraCursorsElement, CursorsProps>({
  tag: 'tessera-cursors',
  properties: [],
  attributes: { scope: 'scope', target: 'target' },
  events: {},
});

const nobody = createStore<PresenceUser[]>([]);
const noCursors = createStore<PresenceCursor[]>([]);

/** The presence API once the feature is enabled, or `undefined`. */
export function usePresenceApi(): PresenceApi | undefined {
  return useFeature('presence');
}

export interface UsePresence {
  /** `undefined` until the scope has been joined. */
  handle: PresenceHandle | undefined;
  peers: PresenceUser[];
  cursors: PresenceCursor[];
  error: Error | undefined;
}

/**
 * Joins a scope and keeps React in sync with who is there. The scope is left when `scope`
 * changes or the component unmounts.
 *
 * @example
 * const { peers } = usePresence('invoice-42');
 * peers.map((p) => <li key={p.id}>{p.name}</li>);
 */
export function usePresence(scope?: string): UsePresence {
  const api = usePresenceApi();
  const [handle, setHandle] = useState<PresenceHandle>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    let joined: PresenceHandle | undefined;
    api
      .join(scope)
      .then((h) => {
        joined = h;
        if (cancelled) void h.leave();
        else {
          setError(undefined);
          setHandle(h);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
      void joined?.leave();
      setHandle(undefined);
    };
  }, [api, scope]);

  const peers = useStore(handle?.peers ?? nobody);
  const cursors = useStore(handle?.cursors ?? noCursors);
  return { handle, peers, cursors, error };
}

export type { TesseraCursorsElement, TesseraPresenceElement };
