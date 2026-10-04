import { cleanup, expectAccessible, must } from '@tessera-internal/test-utils';
import { alice, bob, carol, FakeHub } from '@tessera-kit/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { TesseraVideoTile } from '../src/elements/index.js';
import { buttonIn, mountTab, shadow, tilesOf, until, videoOf } from './ui.js';

afterEach(cleanup);

const CALL = '<tessera-call call-id="standup"></tessera-call>';

async function join(call: HTMLElement): Promise<void> {
  buttonIn(call, 'Join call').click();
  await until(() => shadow(call, '.prejoin'));
  // The preview shows the fake camera.
  await until(() => {
    const own = tilesOf(call)[0];
    return own && (videoOf(own)?.videoWidth ?? 0) > 0;
  });
  buttonIn(call, 'Join').click();
  await until(() => shadow(call, '.controls'));
}

const remoteFlowing = (call: HTMLElement): boolean => {
  const remote = tilesOf(call).find((t) => !t.hasAttribute('self'));
  return !!remote && (videoOf(remote)?.videoWidth ?? 0) > 0;
};

describe('<tessera-call> with real WebRTC between two tabs', () => {
  it('goes from the preview to a call where both see each other’s video', async () => {
    const hub = new FakeHub();
    const a = await mountTab(hub, CALL, alice);
    const b = await mountTab(hub, CALL, bob);
    await join(a.el);
    await join(b.el);
    await until(() => remoteFlowing(a.el) && remoteFlowing(b.el), 15_000);
    expect(tilesOf(a.el)).toHaveLength(2);
    expect(shadow(a.el, '.count')?.textContent).toContain('2 people');
    const remote = must(tilesOf(a.el).find((t) => !t.hasAttribute('self')));
    expect(remote.getAttribute('name')).toBe('Bob Baker');
    await expectAccessible(a.el);
  });

  it('shows mute and camera-off to the other side', async () => {
    const hub = new FakeHub();
    const a = await mountTab(hub, CALL, alice);
    const b = await mountTab(hub, CALL, bob);
    await join(a.el);
    await join(b.el);
    await until(() => remoteFlowing(a.el), 15_000);
    buttonIn(b.el, 'Turn microphone off').click();
    await until(() => {
      const t = tilesOf(a.el).find((x) => !x.hasAttribute('self'));
      return t?.shadowRoot?.querySelector('tessera-icon[name=mic-off]');
    });
    buttonIn(b.el, 'Turn camera off').click();
    await until(() => {
      const t = tilesOf(a.el).find((x) => !x.hasAttribute('self'));
      return t?.shadowRoot?.querySelector('.off');
    });
    expect(buttonIn(b.el, 'Turn microphone on').getAttribute('aria-pressed')).toBe('false');
  });

  it('removes the tile when the other person leaves and ends cleanly when you leave', async () => {
    const hub = new FakeHub();
    const a = await mountTab(hub, CALL, alice);
    const b = await mountTab(hub, CALL, bob);
    await join(a.el);
    await join(b.el);
    await until(() => tilesOf(a.el).length === 2 && remoteFlowing(a.el), 15_000);
    buttonIn(b.el, 'Leave call').click();
    await until(() => tilesOf(a.el).length === 1);
    await until(() => shadow(b.el, '.center'));
    expect(shadow(b.el, '.center')?.textContent).toContain('You left the call');
    buttonIn(a.el, 'Leave call').click();
    await until(() => shadow(a.el, '.center'));
  });

  it('switches between grid and spotlight and pins a person', async () => {
    const hub = new FakeHub();
    const a = await mountTab(hub, CALL, alice);
    const b = await mountTab(hub, CALL, bob);
    await join(a.el);
    await join(b.el);
    await until(() => tilesOf(a.el).length === 2, 15_000);
    const grid = must(shadow<HTMLElement>(a.el, '.grid'));
    const sizes = tilesOf(a.el).map((t) => Math.round(t.getBoundingClientRect().width));
    expect(sizes[0]).toBe(sizes[1]);
    expect(grid.style.gridTemplateColumns).toContain('px');
    buttonIn(a.el, 'Spotlight layout').click();
    await until(() => shadow(a.el, '.spot'));
    expect(shadow(a.el, '.big tessera-video-tile')).not.toBeNull();
    buttonIn(a.el, 'Grid layout').click();
    await until(() => shadow(a.el, '.grid'));
    // pinning someone moves them to the spotlight
    const remote = must(tilesOf(a.el).find((t) => !t.hasAttribute('self')));
    must(remote.shadowRoot?.querySelector<HTMLElement>('tessera-icon-button.pin')).click();
    await until(() => shadow(a.el, '.big tessera-video-tile[pinned]'));
  });

  it('tells a third person the call is full and offers to try again', async () => {
    const hub = new FakeHub();
    const [a, b, c] = [
      await mountTab(hub, CALL, alice, { maxParticipants: 2 }),
      await mountTab(hub, CALL, bob, { maxParticipants: 2 }),
      await mountTab(hub, CALL, carol, { maxParticipants: 2 }),
    ];
    await join(a.el);
    await join(b.el);
    buttonIn(c.el, 'Join call').click();
    await until(() => shadow(c.el, '.prejoin'));
    buttonIn(c.el, 'Join').click();
    await until(() => shadow(c.el, '[role=alert]'));
    expect(shadow(c.el, '[role=alert]')?.textContent).toContain('This call is full');
    expect(buttonIn(c.el, 'Try again')).toBeTruthy();
  });

  it('can skip the preview', async () => {
    const hub = new FakeHub();
    const a = await mountTab(
      hub,
      '<tessera-call call-id="quick" autostart></tessera-call>',
      alice,
      {
        prejoin: false,
      },
    );
    await until(() => shadow(a.el, '.controls'), 8000);
  });

  it('offers a chat panel next to the video only when the chat kit is on', async () => {
    const hub = new FakeHub();
    const without = await mountTab(hub, CALL, alice);
    await join(without.el);
    const hasChatButton = (el: HTMLElement) =>
      [...(el.shadowRoot?.querySelectorAll('tessera-icon-button') ?? [])].some((b) =>
        b.getAttribute('label')?.includes('chat'),
      );
    expect(hasChatButton(without.el)).toBe(false);

    const withChat = await mountTab(
      hub,
      '<tessera-call call-id="other"></tessera-call>',
      bob,
      {},
      {
        chat: { enabled: true },
      },
    );
    await join(withChat.el);
    buttonIn(withChat.el, 'Show chat').click();
    const chat = await until(() => shadow(withChat.el, 'aside tessera-chat'));
    expect(chat.getAttribute('conversation')).toBe('call:other');
  });

  it('shares the screen through the button and shows it as a screen tile for the others', async () => {
    const hub = new FakeHub();
    const a = await mountTab(hub, CALL, alice);
    const b = await mountTab(hub, CALL, bob);
    await join(a.el);
    await join(b.el);
    await until(() => remoteFlowing(b.el), 20_000);
    buttonIn(a.el, 'Share your screen').click();
    await until(() => tilesOf(b.el).some((t) => (t as TesseraVideoTile).screen), 10_000);
    expect(buttonIn(a.el, 'Stop sharing your screen').getAttribute('aria-pressed')).toBe('true');
    buttonIn(a.el, 'Stop sharing your screen').click();
    await until(() => tilesOf(b.el).every((t) => !(t as TesseraVideoTile).screen));
  });
});

describe('<tessera-call-button>', () => {
  it('shows how many people are in the call when the presence kit is on', async () => {
    const hub = new FakeHub();
    const features = { presence: { enabled: true } };
    const caller = await mountTab(hub, CALL, alice, {}, features);
    const watcher = await mountTab(
      hub,
      '<tessera-call-button call-id="standup"></tessera-call-button>',
      bob,
      {},
      features,
    );
    await join(caller.el);
    const badge = await until(() => watcher.el.shadowRoot?.querySelector('tessera-badge'), 8000);
    expect(badge.getAttribute('count')).toBe('1');
    expect(badge.getAttribute('aria-label')).toBe('1 in the call');
    buttonIn(caller.el, 'Leave call').click();
    await until(() => !watcher.el.shadowRoot?.querySelector('tessera-badge'), 8000);
  });

  it('opens the call in a dialog and leaves it when the dialog closes', async () => {
    const hub = new FakeHub();
    const a = await mountTab(
      hub,
      '<tessera-call-button call-id="demo"></tessera-call-button>',
      alice,
    );
    const button = must(a.el.shadowRoot?.querySelector<HTMLElement>('tessera-button'));
    button.click();
    const dialog = await until(() => shadow(a.el, 'tessera-dialog[open]'));
    const call = await until(() => dialog.querySelector<HTMLElement>('tessera-call'));
    await until(() => shadow(call, '.prejoin'), 8000);
    await expectAccessible(a.el);
    must(dialog.shadowRoot?.querySelector<HTMLElement>('header tessera-icon-button')).click();
    await until(() => !shadow(a.el, 'tessera-dialog'));
    expect(a.instance.feature('video')?.call('demo').state.get().phase).toBe('idle');
  });
});

describe('theme and language', () => {
  it('speaks German and stays accessible in the dark theme', async () => {
    const hub = new FakeHub();
    const a = await mountTab(hub, CALL, alice);
    a.instance.setTheme('dark');
    a.instance.setLocale('de');
    await until(() => buttonIn(a.el, 'Anruf beitreten'));
    buttonIn(a.el, 'Anruf beitreten').click();
    await until(() => shadow(a.el, '.prejoin'));
    await until(() => (videoOf(tilesOf(a.el)[0] as HTMLElement)?.videoWidth ?? 0) > 0);
    await expectAccessible(a.el);
    buttonIn(a.el, 'Beitreten').click();
    await until(() => shadow(a.el, '.controls'));
    expect(buttonIn(a.el, 'Mikrofon ausschalten')).toBeTruthy();
    await expectAccessible(a.el);
  });
});
