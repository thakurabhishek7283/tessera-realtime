import { bob } from '@tessera/testing';
import { cleanup, expectAccessible, must } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import {
  bodyText,
  composerOf,
  listOf,
  messageEls,
  mountTab,
  newWorld,
  scrollerOf,
  textareaOf,
  texts,
  until,
} from './ui.js';

afterEach(cleanup);

const text = (t: string) => ({ type: 'text' as const, text: t });
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

describe.each(['server', 'local'] as const)('<tessera-chat> (%s)', (mode) => {
  it('shows an empty conversation, sends with Enter and delivers to another tab', async () => {
    const world = await newWorld(mode);
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    const other = await (await world.tab(bob)).api.openConversation('general');
    await until(() => el.shadowRoot?.querySelector('tessera-message-list'));
    expect(listOf(el).shadowRoot?.textContent).toContain('No messages yet');

    const area = await until(() => textareaOf(el));
    await userEvent.click(area);
    await userEvent.keyboard('hello team');
    await userEvent.keyboard('{Enter}');
    await until(() => texts(el).length === 1);
    expect(texts(el)).toEqual(['hello team']);
    expect(area.value).toBe('');
    await until(() => other.state.get().messages.length === 1);
    await other.send(text('hi alice'));
    await until(() => texts(el).length === 2);
    expect(texts(el)[1]).toBe('hi alice');
  });

  it('puts a new line in with Shift+Enter and does not send empty messages', async () => {
    const world = await newWorld(mode);
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    const area = await until(() => textareaOf(el));
    await userEvent.click(area);
    await userEvent.keyboard('{Enter}');
    expect(texts(el)).toEqual([]);
    await userEvent.keyboard('one{Shift>}{Enter}{/Shift}two');
    expect(area.value).toBe('one\ntwo');
  });

  it('groups a run of messages by one author and shows the author once', async () => {
    const world = await newWorld(mode);
    const sender = await (await world.tab(bob)).api.openConversation('general');
    for (const t of ['a', 'b', 'c']) await sender.send(text(t));
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    await until(() => messageEls(el).length === 3);
    const flags = messageEls(el).map((m) => m.hasAttribute('compact'));
    expect(flags).toEqual([false, true, true]);
    const separators = [...(listOf(el).shadowRoot?.querySelectorAll('.day') ?? [])];
    expect(separators).toHaveLength(1);
  });

  it('reacts, replies, edits and deletes through the message toolbar', async () => {
    const world = await newWorld(mode);
    const other = await (await world.tab(bob)).api.openConversation('general');
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    await other.send(text('question?'));
    await until(() => messageEls(el).length === 1);
    const theirs = messageEls(el)[0] as HTMLElement;
    const button = (host: HTMLElement, label: string) =>
      must(
        [...(host.shadowRoot?.querySelectorAll<HTMLElement>('tessera-icon-button') ?? [])].find(
          (b) => b.getAttribute('label') === label,
        ),
        label,
      );

    // react with the quick picker
    button(theirs, 'Add reaction').click();
    await until(() => theirs.shadowRoot?.querySelector('.quick button'));
    must(theirs.shadowRoot?.querySelector<HTMLElement>('.quick button')).click();
    await until(() => theirs.shadowRoot?.querySelector('.chip[aria-pressed=true]'));
    await until(() => (other.state.get().messages[0]?.reactions['👍'] ?? []).includes('alice'));

    // reply
    button(theirs, 'Reply').click();
    const area = await until(() => textareaOf(el));
    await until(() => composerOf(el).shadowRoot?.querySelector('.banner'));
    await userEvent.click(area);
    await userEvent.keyboard('an answer{Enter}');
    await until(() => messageEls(el).length === 2);
    const mine = messageEls(el)[1] as HTMLElement;
    expect(mine.shadowRoot?.querySelector('.reply')?.textContent).toContain('question?');

    // edit
    button(mine, 'Edit').click();
    await until(() => textareaOf(el).value === 'an answer');
    await userEvent.keyboard('{Control>}a{/Control}better answer{Enter}');
    await until(() => bodyText(messageEls(el)[1] as HTMLElement) === 'better answer');
    expect(messageEls(el)[1]?.shadowRoot?.textContent).toContain('edited');

    // delete asks first
    button(messageEls(el)[1] as HTMLElement, 'Delete').click();
    const dialog = await until(() => el.shadowRoot?.querySelector('tessera-dialog[open]'));
    expect(dialog).toBeTruthy();
    must(el.shadowRoot?.querySelector<HTMLElement>('tessera-button[variant=danger]')).click();
    await until(() => bodyText(messageEls(el)[1] as HTMLElement) === 'This message was deleted');
  });

  it('shows who is typing', async () => {
    const world = await newWorld(mode);
    const other = await (await world.tab(bob)).api.openConversation('general');
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    await until(() => el.shadowRoot?.querySelector('.typing'));
    other.setTyping(true);
    await until(() =>
      el.shadowRoot?.querySelector('.typing')?.textContent?.includes('Bob Baker is typing'),
    );
    await other.send(text('done'));
    await until(() => el.shadowRoot?.querySelector('.typing')?.textContent?.trim() === '');
  });

  it('sticks to the bottom, shows a pill when scrolled away and jumps back', async () => {
    const world = await newWorld(mode);
    const other = await (await world.tab(bob)).api.openConversation('general');
    for (let i = 0; i < 40; i++) await other.send(text(`message ${i}`));
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    await until(() => messageEls(el).length === 30);
    const scroller = scrollerOf(el);
    await until(() => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 4);

    scroller.scrollTop = 0;
    await nextFrame();
    await other.send(text('while you were away'));
    const pill = await until(() => listOf(el).shadowRoot?.querySelector<HTMLElement>('.pill'));
    expect(pill.textContent).toContain('1 new message');
    pill.click();
    await until(() => !listOf(el).shadowRoot?.querySelector('.pill'));
    await until(() => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 4);
  });

  it('loads older messages when scrolled to the top without losing the reading position', async () => {
    const world = await newWorld(mode);
    const other = await (await world.tab(bob)).api.openConversation('general');
    for (let i = 0; i < 60; i++) await other.send(text(`message ${String(i).padStart(2, '0')}`));
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    await until(() => messageEls(el).length === 30);
    const scroller = scrollerOf(el);
    await until(() => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 4);
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    await until(() => messageEls(el).length === 60);
    // The message that was at the top is still near the top of the view.
    const first = messageEls(el).find((m) => bodyText(m) === 'message 30') as HTMLElement;
    const offset = first.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    expect(offset).toBeGreaterThanOrEqual(-4);
    expect(offset).toBeLessThan(scroller.clientHeight / 2);
  });

  it('is accessible', async () => {
    const world = await newWorld(mode);
    const other = await (await world.tab(bob)).api.openConversation('general');
    await other.send(text('hello'));
    const { el } = await mountTab(world, '<tessera-chat conversation="general"></tessera-chat>');
    await until(() => messageEls(el).length === 1);
    await expectAccessible(el);
  });
});
