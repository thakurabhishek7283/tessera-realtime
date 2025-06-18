import { alice, bob } from '@tessera/testing';
import { cleanup, expectAccessible, must } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import {
  bodies,
  bodyOf,
  composerOf,
  items,
  linkIn,
  mountTab,
  newWorld,
  textareaIn,
  until,
} from './ui.js';

afterEach(cleanup);

const THREAD = '<tessera-comments target="listing-1"></tessera-comments>';
const text = (t: string) => ({ type: 'text' as const, text: t });

async function write(
  el: HTMLElement,
  message: string,
  index = 0,
  label = 'Comment',
): Promise<void> {
  const area = await until(() => textareaIn(composerOf(el, index)));
  await userEvent.click(area);
  await userEvent.keyboard(message);
  linkIn(composerOf(el, index).shadowRoot as ShadowRoot, label).click();
}

describe('<tessera-comments>', () => {
  it('shows an empty thread, takes a comment and counts it, and is accessible', async () => {
    const world = newWorld();
    const { el } = await mountTab(world, THREAD);
    await until(() => el.shadowRoot?.querySelector('tessera-comment-composer'));
    expect(el.shadowRoot?.textContent).toContain('No comments yet. Be the first');
    expect(el.shadowRoot?.querySelector('h2')?.textContent).toBe('Comments');
    await write(el, 'Great place, see https://example.com.');
    await until(() => items(el).length === 1);
    expect(bodies(el)).toEqual(['Great place, see https://example.com.']);
    const link = must(items(el)[0]?.querySelector<HTMLAnchorElement>('.body a'));
    expect(link.href).toBe('https://example.com/');
    expect(link.rel).toContain('noopener');
    expect(el.shadowRoot?.querySelector('h2')?.textContent).toBe('1 comment');
    await expectAccessible(el);
  });

  it('disables the button while the box is empty', async () => {
    const world = newWorld();
    const { el } = await mountTab(world, THREAD);
    const composer = await until(() => composerOf(el));
    const submit = must(
      composer.shadowRoot?.querySelector<HTMLElement>('tessera-button[part=submit]'),
    );
    expect(submit.hasAttribute('disabled')).toBe(true);
    await userEvent.click(textareaIn(composer));
    await userEvent.keyboard('x');
    await until(() => !submit.hasAttribute('disabled'));
  });

  it('replies to a comment, one level deep', async () => {
    const world = newWorld();
    const { el } = await mountTab(world, THREAD);
    await write(el, 'top level');
    await until(() => items(el).length === 1);
    linkIn(items(el)[0] as HTMLElement, 'Reply').click();
    await until(() => el.shadowRoot?.querySelectorAll('tessera-comment-composer').length === 2);
    await write(el, 'a reply', 1, 'Reply');
    await until(() => items(el).length === 2);
    const nested = el.shadowRoot?.querySelectorAll('ol ol article');
    expect(nested?.length).toBe(1);
    expect(bodyOf(nested?.[0] as Element)).toBe('a reply');
    // replies cannot be replied to
    expect(linkIn(nested?.[0]?.parentElement as HTMLElement, 'Edit')).toBeTruthy();
    expect(() => linkIn(nested?.[0]?.parentElement as HTMLElement, 'Reply')).toThrow();
  });

  it('reacts with the configured emoji and the other tab sees it', async () => {
    const world = newWorld();
    const a = await mountTab(world, THREAD, alice);
    const b = await mountTab(world, THREAD, bob);
    await write(a.el, 'react to me');
    await until(() => items(b.el).length === 1);
    const article = items(b.el)[0] as HTMLElement;
    article.querySelector<HTMLElement>('tessera-icon-button[label="Add reaction"]')?.click();
    const emoji = await until(() => article.querySelector<HTMLElement>('.picker button'));
    emoji.click();
    await until(() => items(a.el)[0]?.querySelector('.chip'));
    expect(items(a.el)[0]?.querySelector('.chip')?.getAttribute('aria-label')).toBe(
      '👍 1 reaction',
    );
    // pressing the chip again takes it back
    items(b.el)[0]?.querySelector<HTMLElement>('.chip[aria-pressed=true]')?.click();
    await until(() => !items(a.el)[0]?.querySelector('.chip'));
  });

  it('edits and deletes your own comments, asking before deleting', async () => {
    const world = newWorld();
    const { el } = await mountTab(world, THREAD);
    await write(el, 'draft');
    await until(() => items(el).length === 1);
    linkIn(items(el)[0] as HTMLElement, 'Edit').click();
    const edit = await until(() => composerOf(el, 1));
    const area = textareaIn(edit);
    await until(() => area.value === 'draft');
    await userEvent.click(area);
    await userEvent.keyboard('{Control>}a{/Control}final');
    linkIn(edit.shadowRoot as ShadowRoot, 'Save').click();
    await until(() => bodyOf(items(el)[0] as HTMLElement) === 'final');
    expect(items(el)[0]?.textContent).toContain('edited');

    linkIn(items(el)[0] as HTMLElement, 'Delete').click();
    await until(() => el.shadowRoot?.querySelector('tessera-dialog[open]'));
    must(el.shadowRoot?.querySelector<HTMLElement>('tessera-button[variant=danger]')).click();
    await until(() => items(el).length === 0);
  });

  it('does not offer edit or delete on other people’s comments', async () => {
    const world = newWorld();
    const a = await mountTab(world, THREAD, alice);
    const b = await mountTab(world, THREAD, bob);
    await write(a.el, 'mine');
    await until(() => items(b.el).length === 1);
    expect(() => linkIn(items(b.el)[0] as HTMLElement, 'Edit')).toThrow();
    expect(() => linkIn(items(b.el)[0] as HTMLElement, 'Delete')).toThrow();
  });

  it('shows other people’s comments live and announces them', async () => {
    const world = newWorld();
    const a = await mountTab(world, THREAD, alice);
    const b = await (await mountTab(world, THREAD, bob)).tab.api.thread('listing-1');
    await until(() => a.el.shadowRoot?.querySelector('tessera-comment-composer'));
    await b.add(text('hello from bob'));
    await until(() => items(a.el).length === 1);
    expect(a.el.shadowRoot?.querySelector('[role=status]')?.textContent).toContain(
      'Bob Baker: hello from bob',
    );
  });

  it('is read-only when asked: no composer and no actions', async () => {
    const world = newWorld();
    const seed = await world.tab(alice);
    await (await seed.api.thread('listing-1')).add(text('seen'));
    const { el } = await mountTab(
      world,
      '<tessera-comments target="listing-1" readonly></tessera-comments>',
    );
    await until(() => items(el).length === 1);
    expect(el.shadowRoot?.querySelector('tessera-comment-composer')).toBeNull();
    expect(items(el)[0]?.querySelector('.actions .link')).toBeNull();
  });
});

describe('ratings and resolving', () => {
  it('lets people rate with the keyboard and shows the average and distribution', async () => {
    const world = newWorld();
    const a = await mountTab(world, THREAD, alice, { ratings: true });
    const seed = await (await mountTab(world, THREAD, bob, { ratings: true })).tab.api.thread(
      'listing-1',
    );
    await seed.add(text('ok'), { rating: 3 });
    await until(() => items(a.el).length === 1);
    expect(
      items(a.el)[0]?.querySelector('tessera-star-rating')?.getAttribute('readonly'),
    ).not.toBeNull();

    const composer = composerOf(a.el);
    const stars = must(composer.shadowRoot?.querySelector<HTMLElement>('tessera-star-rating'));
    const firstStar = must(stars.shadowRoot?.querySelector<HTMLElement>('button'));
    firstStar.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    await until(
      () =>
        stars.shadowRoot?.querySelector('button[aria-checked=true]')?.getAttribute('aria-label') ===
        '5 stars',
    );
    await userEvent.click(textareaIn(composer));
    await userEvent.keyboard('loved it');
    linkIn(composer.shadowRoot as ShadowRoot, 'Comment').click();
    await until(() => items(a.el).length === 2);
    const summary = must(a.el.shadowRoot?.querySelector('.summary'));
    expect(summary.getAttribute('aria-label')).toBe('Average rating 4.0 out of 5, from 2 ratings');
    expect(summary.querySelectorAll('.bar')).toHaveLength(5);
    expect(summary.querySelector('.average')?.textContent).toContain('4.0');
    await expectAccessible(a.el);
  });

  it('clears a star by pressing it again', async () => {
    const world = newWorld();
    const { el } = await mountTab(world, THREAD, alice, { ratings: true });
    const composer = await until(() => composerOf(el));
    const stars = must(composer.shadowRoot?.querySelector<HTMLElement>('tessera-star-rating'));
    const buttons = [...(stars.shadowRoot?.querySelectorAll<HTMLElement>('button') ?? [])];
    buttons[3]?.click();
    await until(() => stars.shadowRoot?.querySelector('button[aria-checked=true]'));
    buttons[3]?.click();
    await until(() => !stars.shadowRoot?.querySelector('button[aria-checked=true]'));
  });

  it('resolves and reopens a thread', async () => {
    const world = newWorld();
    const a = await mountTab(world, THREAD, alice, { resolve: true });
    const b = await mountTab(world, THREAD, bob, { resolve: true });
    const resolve = await until(() => linkIn(a.el.shadowRoot as ShadowRoot, 'Resolve thread'));
    resolve.click();
    await until(() => a.el.shadowRoot?.querySelector('.banner'));
    await until(() => b.el.shadowRoot?.querySelector('.banner'));
    linkIn(b.el.shadowRoot as ShadowRoot, 'Reopen thread').click();
    await until(() => !a.el.shadowRoot?.querySelector('.banner'));
  });
});

describe('<tessera-comment-count>', () => {
  it('shows the number of comments and follows changes', async () => {
    const world = newWorld();
    const { el, tab } = await mountTab(
      world,
      '<tessera-comment-count target="card-1"></tessera-comment-count>',
    );
    expect(el.shadowRoot?.querySelector('.badge')).toBeNull();
    const thread = await tab.api.thread('card-1');
    await thread.add(text('one'));
    await until(() => el.shadowRoot?.querySelector('.badge'));
    expect(el.shadowRoot?.querySelector('.badge')?.getAttribute('aria-label')).toBe('1 comment');
    await thread.add(text('two'));
    await until(
      () => el.shadowRoot?.querySelector('.badge')?.getAttribute('aria-label') === '2 comments',
    );
  });

  it('can show zero', async () => {
    const world = newWorld();
    const { el } = await mountTab(
      world,
      '<tessera-comment-count target="c" show-zero></tessera-comment-count>',
    );
    await until(() => el.shadowRoot?.querySelector('.badge'));
  });
});

describe('when the thread cannot be loaded', () => {
  it('shows the failure once and retries only when asked', async () => {
    let gets = 0;
    const world = newWorld({
      storage: (base) => ({
        ...base,
        get: async () => {
          gets += 1;
          throw new Error('storage is down');
        },
        list: base.list.bind(base),
        put: base.put.bind(base),
        delete: base.delete.bind(base),
      }),
    });
    const { el } = await mountTab(world, THREAD);
    const alert = await until(() => el.shadowRoot?.querySelector('[role=alert]'));
    expect(alert.textContent).toContain('storage is down');
    const seen = gets;
    await new Promise((r) => setTimeout(r, 300));
    expect(gets).toBe(seen);
    must(el.shadowRoot?.querySelector<HTMLElement>('tessera-button')).click();
    await until(() => gets > seen);
  });
});
