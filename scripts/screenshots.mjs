// Captures the README screenshots from the built playground. Usage: `pnpm screenshots`.
// Starts `vite preview` itself, so the playground must already be built (`pnpm build`).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:4173/';
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const out = (name) => new URL(`../docs/media/${name}.png`, import.meta.url).pathname;
mkdirSync(new URL('../docs/media/', import.meta.url), { recursive: true });

const server = spawn('pnpm', ['--filter', 'playground', 'preview'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

const view = { width: 1280, height: 860 };

try {
  await waitForServer();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });

  for (const scheme of ['light', 'dark']) {
    // One context per scheme so the two users share a BroadcastChannel and IndexedDB.
    const context = await browser.newContext({ viewport: view, colorScheme: scheme });
    const alice = await context.newPage();
    const bob = await context.newPage();
    const go = (page, tab, user) => page.goto(`${base}?tab=${tab}&user=${user}&theme=${scheme}`);

    // ----- presence -----
    await go(alice, 'presence', 'alice');
    await go(bob, 'presence', 'bob');
    const third = await context.newPage();
    await go(third, 'presence', 'carol');
    await alice.locator('tessera-presence').getByRole('img', { name: 'Carol Chen' }).waitFor();
    const box = await alice.locator('tessera-cursors').locator('xpath=..').boundingBox();
    await bob.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await bob.mouse.move(box.x + box.width * 0.32, box.y + box.height * 0.42);
    await third.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
    await third.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.62);
    await alice.waitForTimeout(500);
    await alice.screenshot({ path: out(`presence-${scheme}`) });
    await third.close();

    // ----- chat -----
    await go(alice, 'chat', 'alice');
    await go(bob, 'chat', 'bob');
    const room = (page) => page.locator('tessera-inbox tessera-chat').first();
    const say = async (page, text) => {
      const area = room(page).locator('tessera-chat-composer textarea');
      await area.fill(text);
      await area.press('Enter');
    };
    await say(alice, 'Morning! Anyone looked at the pitch map for the lake site?');
    await room(bob).locator('tessera-chat-message').first().waitFor();
    await say(bob, 'Yes, the shady corner by the water is still free for the weekend.');
    await say(alice, 'Perfect, I will book it. Can you send the gear list?');
    await room(alice).locator('tessera-chat-message').nth(2).waitFor();
    const first = room(bob).locator('tessera-chat-message').nth(2);
    await first.hover();
    await first.getByRole('button', { name: 'Add reaction' }).click();
    await first.getByRole('button', { name: '🎉' }).click();
    await bob
      .locator('tessera-inbox tessera-chat-composer textarea')
      .first()
      .pressSequentially('Sending it now');
    await alice.waitForTimeout(700);
    await alice.screenshot({ path: out(`chat-${scheme}`) });

    // ----- comments -----
    await go(alice, 'comments', 'alice');
    await go(bob, 'comments', 'bob');
    const composer = (page) => page.locator('tessera-comments tessera-comment-composer').first();
    await composer(alice)
      .locator('textarea')
      .fill('Quiet at night, flat pitch and the water is a minute away.');
    await composer(alice).getByRole('radio', { name: '5 stars' }).click();
    await composer(alice).getByRole('button', { name: 'Comment' }).click();
    await bob.locator('tessera-comments article').first().waitFor();
    await composer(bob)
      .locator('textarea')
      .fill('Showers were cold in the morning, otherwise lovely.');
    await composer(bob).getByRole('radio', { name: '4 stars' }).click();
    await composer(bob).getByRole('button', { name: 'Comment' }).click();
    await alice.locator('tessera-comments article').nth(1).waitFor();
    await alice
      .locator('tessera-comments article')
      .first()
      .getByRole('button', { name: 'Add reaction' })
      .click();
    await alice.locator('tessera-comments .picker button').first().click();
    await alice.waitForTimeout(500);
    await alice.screenshot({ path: out(`comments-${scheme}`) });

    // ----- video -----
    await go(alice, 'video', 'alice');
    await go(bob, 'video', 'bob');
    const call = 'tessera-call[call-id=playground]';
    for (const page of [alice, bob]) {
      await page.locator(call).getByRole('button', { name: 'Join call' }).click();
      await page.locator(`${call} .prejoin`).waitFor();
      await page.waitForTimeout(800);
      if (page === alice && scheme === 'light')
        await page.screenshot({ path: out('video-prejoin-light') });
      await page.locator(call).getByRole('button', { name: 'Join', exact: true }).click();
      await page.locator(`${call} .controls`).waitFor();
    }
    await alice.waitForTimeout(2500);
    await alice.screenshot({ path: out(`video-${scheme}`) });
    await context.close();
  }
  await browser.close();
} finally {
  stop();
}
