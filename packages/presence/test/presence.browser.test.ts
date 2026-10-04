import '@tessera-kit/elements/define';
import '../src/elements/index.js';
import {
  cleanup,
  expectAccessible,
  mountInstance,
  must,
  settle,
  until,
} from '@tessera-internal/test-utils';
import { alice, bob, carol, FakeHub } from '@tessera-kit/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { TesseraCursorsElement, TesseraPresenceElement } from '../src/elements/index.js';
import type { PresenceApi } from '../src/index.js';
import { tab } from './helpers.js';

afterEach(cleanup);

async function mountPresence(hub: FakeHub, markup: string, config: Record<string, unknown> = {}) {
  const { root } = await mountInstance(
    { appId: hub.appId, features: { presence: { enabled: true, ...config } } },
    { presence: () => import('../src/plugin.js') },
    { hub, user: alice },
  );
  root.innerHTML = markup;
  const el = must(root.firstElementChild as TesseraPresenceElement, 'element');
  await settle(el);
  return { root, el };
}

const people = (el: Element): string[] =>
  [...(el.shadowRoot?.querySelectorAll('.stack li') ?? [])].map(
    (li) => li.querySelector('.visually-hidden')?.textContent ?? '',
  );

describe('<tessera-presence>', () => {
  it('shows the people in the scope with their status, and is accessible', async () => {
    const hub = new FakeHub();
    const { el } = await mountPresence(hub, '<tessera-presence scope="page"></tessera-presence>');
    const hb = await (await tab(hub, bob)).api.join('page');
    await (await tab(hub, carol)).api.join('page');
    await until(() => people(el).length === 2);
    hb.set({ status: 'idle' });
    await until(() => people(el)[0]?.includes('idle'));
    expect(people(el)).toEqual(['Bob Baker, idle', 'Carol Chen, active']);
    await expectAccessible(el);
  });

  it('shows the empty slot when nobody else is there', async () => {
    const hub = new FakeHub();
    const { el } = await mountPresence(
      hub,
      '<tessera-presence scope="page"><span slot="empty">Just you</span></tessera-presence>',
    );
    await settle(el);
    expect(el.shadowRoot?.querySelector('slot[name=empty]')).not.toBeNull();
    expect(el.querySelector('[slot=empty]')?.textContent).toBe('Just you');
  });

  it('collapses extra people into a +N button that lists everyone', async () => {
    const hub = new FakeHub();
    const { el } = await mountPresence(
      hub,
      '<tessera-presence scope="page" max="1"></tessera-presence>',
    );
    for (const user of [bob, carol]) await (await tab(hub, user)).api.join('page');
    await until(() => el.shadowRoot?.querySelector('.more'));
    expect(people(el)).toHaveLength(1);
    const more = must(el.shadowRoot?.querySelector<HTMLButtonElement>('.more'));
    expect(more.textContent).toBe('+1');
    expect(more.getAttribute('aria-label')).toBe('1 more person');
    more.click();
    await settle(el);
    const names = [...(el.shadowRoot?.querySelectorAll('.list li') ?? [])].map(
      (li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
    expect(names).toEqual(['Bob Baker active', 'Carol Chen active']);
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('fires presence-change when someone arrives or leaves', async () => {
    const hub = new FakeHub();
    const { el } = await mountPresence(hub, '<tessera-presence scope="page"></tessera-presence>');
    const counts: number[] = [];
    el.addEventListener('presence-change', (e) =>
      counts.push((e as CustomEvent<{ peers: unknown[] }>).detail.peers.length),
    );
    const b = await tab(hub, bob);
    await b.api.join('page');
    await until(() => counts.includes(1));
    await b.instance.destroy();
    await until(() => counts.at(-1) === 0);
  });

  it('renders nothing and hides itself when the feature is off', async () => {
    const hub = new FakeHub();
    const { el } = await mountPresence(hub, '<tessera-presence scope="page"></tessera-presence>', {
      enabled: false,
    });
    await settle(el);
    expect(el.hasAttribute('hidden')).toBe(true);
  });
});

const cursorIn = (el: Element): HTMLElement | null =>
  el.shadowRoot?.querySelector<HTMLElement>('.cursor') ?? null;

describe('<tessera-cursors>', () => {
  const frame =
    '<div style="position:relative;width:400px;height:200px"><tessera-cursors scope="page"></tessera-cursors></div>';

  async function mountCursors(hub: FakeHub) {
    const { root } = await mountInstance(
      { appId: hub.appId, features: { presence: { enabled: true } } },
      { presence: () => import('../src/plugin.js') },
      { hub, user: alice },
    );
    root.innerHTML = frame;
    const box = must(root.firstElementChild as HTMLElement);
    const el = must(box.querySelector<TesseraCursorsElement>('tessera-cursors'));
    await settle(el);
    return { box, el };
  }

  it('draws other people’s pointers where they are, as a fraction of the container', async () => {
    const hub = new FakeHub();
    const { el } = await mountCursors(hub);
    const hb = await (await tab(hub, bob)).api.join('page');
    hb.set({ cursor: { x: 0.25, y: 0.5 } });
    const cursor = await until(() => cursorIn(el));
    expect(cursor.style.left).toBe('25%');
    expect(cursor.style.top).toBe('50%');
    expect(cursor.querySelector('.label')?.textContent).toBe('Bob Baker');
    expect(cursor.getAttribute('aria-hidden')).toBe('true');
    hb.set({ cursor: null });
    await until(() => !cursorIn(el));
  });

  it('fades a pointer that stopped moving', async () => {
    const hub = new FakeHub();
    const { el } = await mountCursors(hub);
    const hb = await (await tab(hub, bob)).api.join('page');
    hb.set({ cursor: { x: 0.1, y: 0.1 } });
    const cursor = await until(() => cursorIn(el));
    expect(cursor.hasAttribute('data-faded')).toBe(false);
    hub.clock.advance(3500);
    el.requestUpdate();
    await el.updateComplete;
    expect(cursorIn(el)?.hasAttribute('data-faded')).toBe(true);
  });

  it('shares this pointer as fractions of the container and clears it on leave', async () => {
    const hub = new FakeHub();
    const { box } = await mountCursors(hub);
    const watcher = await (await tab(hub, bob)).api.join('page');
    await until(() => box.querySelector('tessera-cursors'));
    const rect = box.getBoundingClientRect();
    box.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 4,
      }),
    );
    await until(() => watcher.cursors.get().length === 1);
    expect(watcher.cursors.get()[0]).toMatchObject({ x: 0.5, y: 0.25, user: { id: 'alice' } });
    box.dispatchEvent(new PointerEvent('pointerleave'));
    await until(() => watcher.cursors.get().length === 0);
  });
});

describe('when a scope cannot be joined', () => {
  it('does not keep retrying in a loop', async () => {
    const hub = new FakeHub({ capacity: { presence: 0 } });
    const { root } = await mountInstance(
      { appId: hub.appId, features: { presence: { enabled: true } } },
      { presence: () => import('../src/plugin.js') },
      { hub, user: alice },
    );
    const api = must(
      (root as unknown as { tessera: { feature(id: 'presence'): PresenceApi } }).tessera.feature(
        'presence',
      ),
    );
    let attempts = 0;
    const join = api.join.bind(api);
    api.join = (scope) => {
      attempts += 1;
      return join(scope);
    };
    root.innerHTML = '<tessera-presence scope="full"></tessera-presence>';
    await new Promise((r) => setTimeout(r, 400));
    expect(attempts).toBe(1);
  });
});

describe('theme and language', () => {
  it('stays accessible in the dark theme and follows the language', async () => {
    const hub = new FakeHub();
    const { el, root } = await mountPresence(
      hub,
      '<tessera-presence scope="page" max="1"></tessera-presence>',
    );
    for (const user of [bob, carol]) await (await tab(hub, user)).api.join('page');
    await until(() => el.shadowRoot?.querySelector('.more'));
    const instance = (
      root as unknown as { tessera: { setTheme(m: string): void; setLocale(l: string): void } }
    ).tessera;
    instance.setTheme('dark');
    await new Promise((r) => setTimeout(r, 100));
    await expectAccessible(el);
    instance.setLocale('de');
    await until(
      () =>
        el.shadowRoot?.querySelector('.more')?.getAttribute('aria-label') === '1 weitere Person',
    );
  });
});
