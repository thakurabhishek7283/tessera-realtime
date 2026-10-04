import '@tessera-kit/elements/define';
import { TesseraProvider } from '@tessera-kit/react';
import { cleanup, until } from '@tessera-internal/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Comments, useCommentCount, useThread } from '../src/react/index.js';
import { newWorld } from './ui.js';

afterEach(cleanup);

function Log() {
  const { controller, state } = useThread('react-thread');
  const count = useCommentCount('react-thread');
  return (
    <div>
      <output>
        {state
          ? state.comments.map((c) => (c.body.type === 'text' ? c.body.text : '')).join('|')
          : 'loading'}
      </output>
      <output id="count">{count}</output>
      <button
        type="button"
        onClick={() => void controller?.add({ type: 'text', text: 'from react' })}
      >
        add
      </button>
    </div>
  );
}

describe('React comments bindings', () => {
  it('useThread follows a thread and useCommentCount its size', async () => {
    const world = newWorld();
    const { instance } = await world.tab();
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={instance}>
        <Log />
      </TesseraProvider>,
    );
    await until(() => container.querySelector('output')?.textContent === '');
    (await until(() => container.querySelector('button'))).click();
    await until(() => container.querySelector('output')?.textContent === 'from react');
    await until(() => container.querySelector('#count')?.textContent === '1');
  });

  it('<Comments> shows a thread and forwards its events', async () => {
    const world = newWorld();
    const { instance } = await world.tab();
    const onAdd = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={instance}>
        <Comments target="events" onCommentAdd={onAdd} />
      </TesseraProvider>,
    );
    const el = await until(() => container.querySelector('tessera-comments'));
    const composer = await until(() => el.shadowRoot?.querySelector('tessera-comment-composer'));
    const area = await until(() => composer.shadowRoot?.querySelector('textarea'));
    await userEvent.click(area);
    await userEvent.keyboard('via react{Control>}{Enter}{/Control}');
    await until(() => onAdd.mock.calls.length === 1);
    expect(onAdd.mock.calls[0]?.[0].detail.comment.body).toEqual({
      type: 'text',
      text: 'via react',
    });
  });
});
