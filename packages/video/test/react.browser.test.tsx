import '@tessera-kit/elements/define';
import { TesseraProvider } from '@tessera-kit/react';
import { alice, createTestInstance, FakeHub } from '@tessera-kit/testing';
import { cleanup, until } from '@tessera-internal/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Call, useCall } from '../src/react/index.js';

afterEach(cleanup);

async function tab() {
  const hub = new FakeHub();
  const { instance } = await createTestInstance(
    { appId: hub.appId, features: { video: { enabled: true, iceServers: [] } } },
    { video: () => import('../src/plugin.js') },
    { hub, user: alice },
  );
  return instance;
}

function Status() {
  const { controller, state } = useCall('react-call');
  return (
    <div>
      <output>{state?.phase ?? 'loading'}</output>
      <button type="button" onClick={() => void controller?.start()}>
        start
      </button>
      <button type="button" onClick={() => void controller?.leave()}>
        leave
      </button>
    </div>
  );
}

describe('React video bindings', () => {
  it('useCall follows the call and gives a fresh controller after it ended', async () => {
    const instance = await tab();
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={instance}>
        <Status />
      </TesseraProvider>,
    );
    const phase = () => container.querySelector('output')?.textContent;
    await until(() => phase() === 'idle');
    (await until(() => container.querySelectorAll('button')[0])).click();
    await until(() => phase() === 'prejoin');
    (await until(() => container.querySelectorAll('button')[1])).click();
    await until(() => phase() === 'idle');
    // The call ended, and starting it again works with the new controller.
    (await until(() => container.querySelectorAll('button')[0])).click();
    await until(() => phase() === 'prejoin');
  });

  it('<Call> forwards the call events', async () => {
    const instance = await tab();
    const onJoin = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    createRoot(container).render(
      <TesseraProvider instance={instance}>
        <Call callId="events" autostart onCallJoin={onJoin} />
      </TesseraProvider>,
    );
    const call = await until(() => container.querySelector('tessera-call'));
    const join = await until(() =>
      [...(call.shadowRoot?.querySelectorAll('tessera-button') ?? [])].find(
        (b) => b.textContent?.trim() === 'Join',
      ),
    );
    (join as HTMLElement).click();
    await until(() => onJoin.mock.calls.length === 1);
    expect(onJoin.mock.calls[0]?.[0].detail).toEqual({ callId: 'events' });
  });
});
