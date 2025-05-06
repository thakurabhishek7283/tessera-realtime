import { createStore } from '@tessera/core';
import { bob, carol } from '@tessera/testing';
import { cleanup, expectAccessible, must } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { TesseraMessageList } from '../src/elements/index.js';
import type { ConversationState, Message } from '../src/index.js';
import {
  bodyText,
  composerOf,
  messageEls,
  mountTab,
  newWorld,
  textareaOf,
  texts,
  until,
} from './ui.js';

afterEach(cleanup);

const text = (t: string) => ({ type: 'text' as const, text: t });

describe('composer', () => {
  it('attaches files by button and sends them with the message', async () => {
    const world = await newWorld('server');
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    const composer = await until(() => composerOf(el));
    const input = must(composer.shadowRoot?.querySelector<HTMLInputElement>('input[type=file]'));
    const dt = new DataTransfer();
    dt.items.add(new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await until(() => composer.shadowRoot?.querySelector('.file'));
    expect(composer.shadowRoot?.querySelector('.file')?.textContent).toContain('plan.pdf');
    await userEvent.click(textareaOf(el));
    await userEvent.keyboard('here it is{Enter}');
    await until(() => messageEls(el)[0]?.shadowRoot?.querySelector('.file'));
    expect(messageEls(el)[0]?.shadowRoot?.querySelector('.file')?.textContent).toContain(
      'plan.pdf',
    );
    expect(composer.shadowRoot?.querySelector('.file')).toBeNull();
  });

  it('takes files that are pasted or dropped, and can remove one again', async () => {
    const world = await newWorld('server');
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    const composer = await until(() => composerOf(el));
    const box = must(composer.shadowRoot?.querySelector<HTMLElement>('.box'));
    const pasted = new DataTransfer();
    pasted.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
    box.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: pasted, bubbles: true, cancelable: true }),
    );
    const dropped = new DataTransfer();
    dropped.items.add(new File(['y'], 'b.png', { type: 'image/png' }));
    box.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dropped, bubbles: true, cancelable: true }),
    );
    await until(() => composer.shadowRoot?.querySelectorAll('.file').length === 2);
    must(composer.shadowRoot?.querySelector<HTMLElement>('.file tessera-icon-button')).click();
    await until(() => composer.shadowRoot?.querySelectorAll('.file').length === 1);
  });

  it('inserts an emoji from the picker at the caret', async () => {
    const world = await newWorld('server');
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    const composer = await until(() => composerOf(el));
    const area = textareaOf(el);
    await userEvent.click(area);
    await userEvent.keyboard('hi ');
    must(composer.shadowRoot?.querySelector<HTMLElement>('#emoji')).click();
    const picker = await until(() => composer.shadowRoot?.querySelector('tessera-emoji-picker'));
    const cell = await until(() => picker.shadowRoot?.querySelector<HTMLElement>('.cell'));
    cell.click();
    await until(() => area.value.startsWith('hi '));
    expect(area.value).toBe('hi 😀');
  });

  it('warns near the limit and will not send a message that is too long', async () => {
    const world = await newWorld('server');
    const { el } = await mountTab(
      world,
      '<tessera-chat conversation="general"></tessera-chat>',
      undefined,
      { composer: { maxLength: 20 } as never },
    );
    const composer = await until(() => composerOf(el));
    await userEvent.click(textareaOf(el));
    await userEvent.keyboard('x'.repeat(25));
    await until(() => composer.shadowRoot?.querySelector('.counter[data-over]'));
    await userEvent.keyboard('{Enter}');
    expect(texts(el)).toEqual([]);
  });
});

describe('message list windowing', () => {
  it('renders only the messages near the viewport when a conversation is long', async () => {
    const world = await newWorld('server');
    const { root } = await mountTab(world, '<span></span>');
    const messages: Message[] = Array.from({ length: 900 }, (_, i) => ({
      id: String(i).padStart(6, '0'),
      clientId: `c${i}`,
      conversationId: 'general',
      authorId: i % 2 ? 'bob' : 'carol',
      authorName: i % 2 ? 'Bob' : 'Carol',
      body: text(`line ${i}`),
      attachments: [],
      reactions: {},
      createdAt: new Date(Date.UTC(2026, 0, 1, 12, i)).toISOString(),
    }));
    const store = createStore<ConversationState>({
      messages,
      hasMore: false,
      loading: false,
      typing: [],
      readBy: {},
      unread: 0,
      firstUnreadId: undefined,
      error: undefined,
    });
    const list = document.createElement('tessera-message-list') as TesseraMessageList;
    list.style.height = '400px';
    list.stateStore = store;
    list.selfId = 'alice';
    list.features = {
      reactions: true,
      replies: true,
      edit: true,
      delete: true,
      linkify: true,
      readReceipts: true,
      timestamps: 'absolute',
    };
    root.append(list);
    await until(() => list.shadowRoot?.querySelector('tessera-chat-message'));
    await new Promise((r) => setTimeout(r, 200));
    const rendered = () => list.shadowRoot?.querySelectorAll('tessera-chat-message').length ?? 0;
    expect(rendered()).toBeGreaterThan(5);
    expect(rendered()).toBeLessThan(250);
    const scroller = must(list.shadowRoot?.querySelector<HTMLElement>('.scroller'));
    // Scrolling to the middle swaps in the messages there.
    scroller.scrollTop = scroller.scrollHeight / 2;
    scroller.dispatchEvent(new Event('scroll'));
    await until(() => {
      const seen = [...(list.shadowRoot?.querySelectorAll('tessera-chat-message') ?? [])].map((m) =>
        bodyText(m as HTMLElement),
      );
      return seen.some((t) => {
        const n = Number(t.replace('line ', ''));
        return n > 300 && n < 600;
      });
    });
    expect(rendered()).toBeLessThan(250);
    // Jumping to a message that is far away brings it into the DOM.
    expect(list.reveal('000010')).toBe(true);
    await until(() =>
      [...(list.shadowRoot?.querySelectorAll('tessera-chat-message') ?? [])].some(
        (m) => bodyText(m as HTMLElement) === 'line 10',
      ),
    );
  });
});

describe('<tessera-inbox>', () => {
  it('lists conversations with unread badges and opens the one you pick', async () => {
    const world = await newWorld('server');
    const sender = await (await world.tab(bob)).api.openConversation('support');
    await sender.send(text('anyone there?'));
    const { el } = await mountTab(world, '<tessera-inbox></tessera-inbox>', undefined, {
      conversations: [
        { id: 'general', title: 'General' },
        { id: 'support', title: 'Support' },
      ],
    });
    const items = await until(() => {
      const found = el.shadowRoot?.querySelectorAll<HTMLElement>('.item');
      return found && found.length === 2 ? [...found] : undefined;
    });
    expect(items.map((i) => i.querySelector('.title')?.textContent)).toEqual([
      'Support',
      'General',
    ]);
    expect(items[0]?.querySelector('tessera-badge')?.getAttribute('count')).toBe('1');
    expect(items[0]?.querySelector('.preview')?.textContent).toContain('anyone there?');
    await expectAccessible(el);

    items[0]?.click();
    const chat = await until(() => el.shadowRoot?.querySelector('tessera-chat'));
    await until(() => chat.shadowRoot?.querySelectorAll('tessera-message-list').length);
    await until(() => el.shadowRoot?.querySelector('.item tessera-badge') === null);
    expect(chat.getAttribute('conversation')).toBe('support');
  });

  it('starts a direct conversation from a user id', async () => {
    const world = await newWorld('server');
    await world.tab(carol);
    const { el } = await mountTab(world, '<tessera-inbox></tessera-inbox>');
    const input = await until(() =>
      el.shadowRoot?.querySelector<HTMLInputElement>('.direct input'),
    );
    await userEvent.click(input);
    await userEvent.keyboard('carol{Enter}');
    await until(() => el.shadowRoot?.querySelector('tessera-chat[conversation^="dm:"]'));
  });
});

describe('<tessera-chat-launcher>', () => {
  it('opens a panel, shows unread on the button, and closes on Escape with focus restored', async () => {
    const world = await newWorld('server');
    const sender = await (await world.tab(bob)).api.openConversation('general');
    const { el } = await mountTab(world, '<tessera-chat-launcher></tessera-chat-launcher>');
    const fab = await until(() => el.shadowRoot?.querySelector<HTMLButtonElement>('.fab'));
    await sender.send(text('ping'));
    await until(() => el.shadowRoot?.querySelector('.fab tessera-badge'));
    expect(fab.getAttribute('aria-label')).toContain('1 unread');
    expect(el.shadowRoot?.querySelector<HTMLElement>('.panel')?.hasAttribute('hidden')).toBe(true);

    await userEvent.click(fab);
    await until(() => el.shadowRoot?.querySelector('tessera-inbox'));
    expect(fab.getAttribute('aria-expanded')).toBe('true');
    await expectAccessible(el);
    await userEvent.keyboard('{Escape}');
    await until(() => fab.getAttribute('aria-expanded') === 'false');
    expect(el.shadowRoot?.activeElement).toBe(fab);
  });
});

describe('when a conversation cannot be opened', () => {
  it('shows the failure once and retries only when asked', async () => {
    const world = await newWorld('server');
    const hub = world.hub;
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    await until(() => el.shadowRoot?.querySelector('tessera-message-list'));
    // The server starts refusing history requests.
    let calls = 0;
    hub?.handle('chat.history', () => {
      calls += 1;
      throw new Error('history is down');
    });
    const { el: broken } = await mountTab(
      world,
      '<tessera-chat conversation="support"></tessera-chat>',
      bob,
    );
    const alert = await until(() => broken.shadowRoot?.querySelector('[role=alert]'));
    expect(alert.textContent).toContain('history is down');
    const seen = calls;
    await new Promise((r) => setTimeout(r, 300));
    expect(calls).toBe(seen);
    must(broken.shadowRoot?.querySelector<HTMLElement>('tessera-button')).click();
    await until(() => calls > seen);
  });
});
