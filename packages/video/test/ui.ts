import '@tessera-kit/elements/define';
import '../src/elements/index.js';
import '@tessera-kit/presence/elements';
import '@tessera-kit/chat/elements';
import type { UserInfo } from '@tessera-kit/core';
import { alice, createTestInstance, type FakeHub } from '@tessera-kit/testing';
import { must, settle } from '@tessera-internal/test-utils';

export { until } from '@tessera-internal/test-utils';

/** One simulated browser tab: its own Tessera instance on the shared hub, mounted in the page. */
export async function mountTab(
  hub: FakeHub,
  markup: string,
  user: UserInfo = alice,
  video: Record<string, unknown> = {},
  features: Record<string, { enabled: boolean }> = {},
) {
  const test = await createTestInstance(
    {
      appId: hub.appId,
      features: { video: { enabled: true, iceServers: [], ...video }, ...features },
    },
    {
      video: () => import('../src/plugin.js'),
      presence: () => import('@tessera-kit/presence'),
      chat: () => import('@tessera-kit/chat'),
    },
    { hub, user },
  );
  const root = document.createElement('tessera-root') as HTMLElement & { tessera?: unknown };
  root.tessera = test.instance;
  root.style.display = 'block';
  root.style.marginBottom = '8px';
  document.body.append(root);
  root.innerHTML = markup;
  const el = must(root.firstElementChild as HTMLElement, 'element');
  await settle(el);
  return { ...test, root, el };
}

export const shadow = <T extends Element>(el: Element, selector: string): T | null =>
  el.shadowRoot?.querySelector<T>(selector) ?? null;

export const tilesOf = (call: Element): HTMLElement[] => [
  ...(call.shadowRoot?.querySelectorAll<HTMLElement>('tessera-video-tile') ?? []),
];

export const videoOf = (tile: Element): HTMLVideoElement | null =>
  tile.shadowRoot?.querySelector('video') ?? null;

/** Finds an icon button in a shadow root by its label. */
export function buttonIn(root: Element, label: string): HTMLElement {
  return must(
    [
      ...(root.shadowRoot?.querySelectorAll<HTMLElement>('tessera-icon-button, tessera-button') ??
        []),
    ].find((b) => b.getAttribute('label') === label || b.textContent?.trim() === label),
    label,
  );
}
