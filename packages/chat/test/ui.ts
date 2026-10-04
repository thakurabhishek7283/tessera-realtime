import '@tessera-kit/elements/define';
import '../src/elements/index.js';
import type { UserInfo } from '@tessera-kit/core';
import { alice, FakeHub } from '@tessera-kit/testing';
import { must, settle } from '@tessera-internal/test-utils';
import type { TesseraChatElement, TesseraMessageList } from '../src/elements/index.js';
import type { ChatOptions } from './env.js';
import { createWorld, type World } from './env.js';

export { until } from '@tessera-internal/test-utils';

export async function newWorld(mode: World['mode'] = 'server'): Promise<World> {
  return createWorld(mode, FakeHub);
}

/** Mounts `markup` under a `<tessera-root>` for a new tab of `user`. */
export async function mountTab(
  world: World,
  markup: string,
  user: UserInfo = alice,
  chat: ChatOptions = {},
) {
  const tab = await world.tab(user, chat);
  const root = document.createElement('tessera-root') as HTMLElement & { tessera?: unknown };
  root.tessera = tab.instance;
  root.style.display = 'block';
  root.style.height = '480px';
  document.body.append(root);
  root.innerHTML = markup;
  const el = must(root.firstElementChild as HTMLElement, 'element');
  await settle(el);
  return { tab, root, el };
}

export const listOf = (chat: Element): TesseraMessageList =>
  must(chat.shadowRoot?.querySelector('tessera-message-list') as TesseraMessageList | null, 'list');

export const scrollerOf = (chat: Element): HTMLElement =>
  must(listOf(chat).shadowRoot?.querySelector<HTMLElement>('.scroller'), 'scroller');

export const messageEls = (chat: Element): HTMLElement[] => [
  ...(listOf(chat).shadowRoot?.querySelectorAll<HTMLElement>('tessera-chat-message') ?? []),
];

export const bodyText = (el: HTMLElement): string =>
  el.shadowRoot?.querySelector('[part=body]')?.textContent?.trim() ?? '';

export const texts = (chat: Element): string[] => messageEls(chat).map(bodyText);

export const composerOf = (chat: Element): HTMLElement =>
  must(chat.shadowRoot?.querySelector<HTMLElement>('tessera-chat-composer'), 'composer');

export const textareaOf = (chat: Element): HTMLTextAreaElement =>
  must(composerOf(chat).shadowRoot?.querySelector<HTMLTextAreaElement>('textarea'), 'textarea');

export type { TesseraChatElement };
