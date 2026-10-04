import { expect, type Page, test } from '@playwright/test';

// Session 0.3: a page downloads code only for the elements it renders.

/** Records the path of every script the page requests, in order. */
function recordScripts(page: Page): string[] {
  const scripts: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith('.js')) scripts.push(path);
  });
  return scripts;
}

const isInbox = (path: string): boolean => /\/tessera-inbox-[\w-]+\.js$/.test(path);
const isLauncher = (path: string): boolean => /\/tessera-chat-launcher-[\w-]+\.js$/.test(path);

test('a page with only <tessera-chat> never requests the inbox or launcher chunks', async ({
  page,
}) => {
  const scripts = recordScripts(page);
  await page.goto('/chat-only.html');
  await expect(
    page.locator('tessera-chat').locator('tessera-chat-composer textarea'),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter(isInbox)).toEqual([]);
  expect(scripts.filter(isLauncher)).toEqual([]);
});

test('adding <tessera-inbox> later triggers exactly one request', async ({ page }) => {
  const scripts = recordScripts(page);
  await page.goto('/chat-only.html');
  await expect(
    page.locator('tessera-chat').locator('tessera-chat-composer textarea'),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  const before = scripts.length;

  await page.evaluate(() => document.body.append(document.createElement('tessera-inbox')));
  await expect(page.locator('tessera-inbox').locator('.direct input')).toBeVisible();
  await page.waitForLoadState('networkidle');

  const added = scripts.slice(before);
  expect(added).toHaveLength(1);
  expect(isInbox(added[0] ?? '')).toBe(true);
});

test('a lazily defined element upgrades inside other components’ shadow roots', async ({
  page,
}) => {
  await page.goto('/chat-only.html');
  await expect(
    page.locator('tessera-chat').locator('tessera-chat-composer textarea'),
  ).toBeVisible();

  await page.evaluate(() => {
    // An app's own component, created after the page loaded.
    customElements.define(
      'app-shell',
      class extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: 'open' }).innerHTML = '<tessera-inbox></tessera-inbox>';
        }
      },
    );
    document.body.append(document.createElement('app-shell'));
    // And a kit element's shadow root.
    document
      .querySelector('tessera-chat')
      ?.shadowRoot?.append(document.createElement('tessera-inbox'));
  });

  // Playwright locators pierce open shadow roots, so this finds both inboxes.
  await expect(page.locator('app-shell tessera-inbox .direct input')).toBeVisible();
  await expect(page.locator('tessera-chat tessera-inbox .direct input')).toBeVisible();
});

test('the launcher downloads the inbox when its panel first opens', async ({ page }) => {
  const scripts = recordScripts(page);
  await page.goto('/chat-only.html');
  await expect(
    page.locator('tessera-chat').locator('tessera-chat-composer textarea'),
  ).toBeVisible();

  await page.evaluate(() => document.body.append(document.createElement('tessera-chat-launcher')));
  const fab = page.locator('tessera-chat-launcher .fab');
  await expect(fab).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(scripts.filter(isLauncher)).toHaveLength(1);
  expect(scripts.filter(isInbox)).toEqual([]);

  await fab.click();
  await expect(page.locator('tessera-chat-launcher tessera-inbox .direct input')).toBeVisible();
  expect(scripts.filter(isInbox)).toHaveLength(1);
  // Focus still moves into the panel, although the inbox had to download first.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const launcher = document.querySelector('tessera-chat-launcher');
        const inbox = launcher?.shadowRoot?.querySelector('tessera-inbox');
        return inbox?.shadowRoot?.activeElement?.matches('.item, input') ?? false;
      }),
    )
    .toBe(true);
});
