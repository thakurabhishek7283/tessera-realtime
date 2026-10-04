import '@tessera-kit/elements/define';
import '../src/elements/index.js';
import { must, settle } from '@tessera-internal/test-utils';
import type { UserInfo } from '@tessera-kit/core';
import { alice } from '@tessera-kit/testing';
import { createWorld, type Tab, type World } from './env.js';

export { until } from '@tessera-internal/test-utils';

export function newWorld(opts: Parameters<typeof createWorld>[0] = {}): World {
  return createWorld(opts);
}

/** Mounts `markup` under a `<tessera-root>` for a new tab of `user`. */
export async function mountTab(
  world: World,
  markup: string,
  user: UserInfo = alice,
  comments: Record<string, unknown> = {},
): Promise<{ tab: Tab; el: HTMLElement; root: HTMLElement }> {
  const tab = await world.tab(user, comments);
  const root = document.createElement('tessera-root') as HTMLElement & { tessera?: unknown };
  root.tessera = tab.instance;
  root.style.display = 'block';
  document.body.append(root);
  root.innerHTML = markup;
  const el = must(root.firstElementChild as HTMLElement, 'element');
  await settle(el);
  return { tab, el, root };
}

export const items = (el: Element): HTMLElement[] => [
  ...(el.shadowRoot?.querySelectorAll<HTMLElement>('article') ?? []),
];

export const bodyOf = (article: Element): string =>
  article.querySelector('.body')?.textContent?.trim() ?? '';

export const bodies = (el: Element): string[] => items(el).map(bodyOf);

export const composerOf = (el: Element, index = 0): HTMLElement =>
  must(
    [...(el.shadowRoot?.querySelectorAll<HTMLElement>('tessera-comment-composer') ?? [])][index],
    'composer',
  );

export const textareaIn = (composer: Element): HTMLTextAreaElement =>
  must(composer.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea'), 'textarea');

export function linkIn(root: ParentNode, label: string): HTMLElement {
  return must(
    [...root.querySelectorAll<HTMLElement>('button, tessera-button, tessera-icon-button')].find(
      (b) => b.textContent?.trim() === label || b.getAttribute('label') === label,
    ),
    label,
  );
}
