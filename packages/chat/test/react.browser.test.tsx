import '@tessera-kit/elements/define';
import { cleanup, until } from '@tessera-internal/test-utils';
import { TesseraProvider } from '@tessera-kit/react';
import { bob } from '@tessera-kit/testing';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Chat, useConversation, useTotalUnread } from '../src/react/index.js';
import { newWorld } from './ui.js';

afterEach(cleanup);

function Log() {
  const { controller, state } = useConversation('general');
  const unread = useTotalUnread();
  return (
    <div>
      <output>
        {state
          ? state.messages.map((m) => (m.body.type === 'text' ? m.body.text : '')).join('|')
          : 'loading'}
      </output>
      <output id="unread">{unread}</output>
      <button
        type="button"
        onClick={() => void controller?.send({ type: 'text', text: 'from react' })}
      >
        send
      </button>
    </div>
  );
}

describe('React chat bindings', () => {
  it('useConversation follows a conversation and exposes its controller', async () => {
    const world = await newWorld('server');
    const { instance } = await world.tab();
    const other = await (await world.tab(bob)).api.openConversation('general');
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={instance}>
        <Log />
      </TesseraProvider>,
    );
    await until(() => container.querySelector('output')?.textContent === '');
    await userEvent.click(await until(() => container.querySelector('button')));
    await until(() => container.querySelector('output')?.textContent === 'from react');
    await other.send({ type: 'text', text: 'reply' });
    await until(() => container.querySelector('output')?.textContent === 'from react|reply');
    await until(() => container.querySelector('#unread')?.textContent === '1');
  });

  it('<Chat> shows a conversation and forwards its events', async () => {
    const world = await newWorld('server');
    const { instance } = await world.tab();
    const onSend = vi.fn();
    const onOpen = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={instance}>
        <Chat conversation="general" onMessageSend={onSend} onConversationOpen={onOpen} />
      </TesseraProvider>,
    );
    const chat = await until(() => container.querySelector('tessera-chat'));
    await until(() => onOpen.mock.calls.length > 0);
    expect(onOpen.mock.calls[0]?.[0].detail).toEqual({ id: 'general' });
    const composer = await until(() => chat.shadowRoot?.querySelector('tessera-chat-composer'));
    const area = await until(() => composer.shadowRoot?.querySelector('textarea'));
    await userEvent.click(area);
    await userEvent.keyboard('via react{Enter}');
    await until(() => onSend.mock.calls.length === 1);
    expect(onSend.mock.calls[0]?.[0].detail.message.body).toEqual({
      type: 'text',
      text: 'via react',
    });
  });
});
