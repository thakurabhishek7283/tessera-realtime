import type { TesseraContext } from '@tessera/core';
import type { PresenceApi, PresenceHandle, PresenceUser } from '../types.js';

/**
 * Keeps an element joined to the scope it asks for. Elements call `sync()` after every update; it
 * joins when the feature is available, re-joins when the scope changes and leaves when the
 * feature goes away or the element is removed.
 */
export class ScopeSession {
  handle: PresenceHandle | undefined;
  failure: string | undefined;
  #scope: string | undefined;
  #opening: string | undefined;
  /** A scope that could not be joined is not retried until the wanted scope changes. */
  #failed: string | undefined;
  #generation = 0;
  #stop: (() => void) | undefined;

  constructor(
    private readonly onChange: () => void,
    private readonly onPeers?: (peers: PresenceUser[]) => void,
  ) {}

  sync(ctx: TesseraContext | undefined, enabled: boolean, scope: string | undefined): void {
    const api: PresenceApi | undefined = enabled ? ctx?.services.get('presence') : undefined;
    const wanted = api ? scope || api.config.scope : undefined;
    if (!api || wanted === undefined) {
      this.close();
      return;
    }
    if (wanted === this.#scope || wanted === this.#opening || wanted === this.#failed) return;
    this.close();
    void this.#join(api, wanted);
  }

  async #join(api: PresenceApi, scope: string): Promise<void> {
    const generation = ++this.#generation;
    this.#opening = scope;
    this.failure = undefined;
    try {
      const handle = await api.join(scope);
      if (generation !== this.#generation) {
        void handle.leave();
        return;
      }
      this.handle = handle;
      this.#scope = scope;
      const onPeers = this.onPeers;
      if (onPeers) this.#stop = handle.peers.subscribe((peers) => onPeers(peers));
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#failed = scope;
      this.failure = error instanceof Error ? error.message : String(error);
    } finally {
      if (generation === this.#generation) this.#opening = undefined;
    }
    this.onChange();
  }

  close(): void {
    this.#failed = undefined;
    this.#generation++;
    const handle = this.handle;
    this.#stop?.();
    this.#stop = undefined;
    this.handle = undefined;
    this.#scope = undefined;
    this.#opening = undefined;
    if (handle) {
      void handle.leave();
      this.onChange();
    }
  }
}
