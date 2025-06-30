import { expect, test } from '@playwright/test';

// Runs against a real tessera-server when TESSERA_SERVER_URL points at one (AUTH_MODE=dev), e.g.
//   TESSERA_SERVER_URL=http://127.0.0.1:8787 pnpm e2e
const server = process.env.TESSERA_SERVER_URL;
test.skip(!server, 'set TESSERA_SERVER_URL to run the tests against tessera-server');

const url = (tab: string, user: string): string =>
  `/?tab=${tab}&mode=server&server=${encodeURIComponent(server ?? '')}&user=${user}`;

test('chat history, live delivery and read state go through the server', async ({ context }) => {
  const alice = await context.newPage();
  const bob = await context.newPage();
  await alice.goto(url('chat', 'alice'));
  await bob.goto(url('chat', 'bob'));

  const room = (page: typeof alice) => page.locator('tessera-inbox tessera-chat').first();
  const text = `hello ${Date.now()}`;
  await room(alice).locator('tessera-chat-composer textarea').fill(text);
  await room(alice).locator('tessera-chat-composer textarea').press('Enter');
  await expect(room(bob).locator('tessera-chat-message').last()).toContainText(text);

  // History survives a reload because the server keeps it.
  await bob.reload();
  await expect(room(bob).locator('tessera-chat-message').last()).toContainText(text);
});

test('presence and a video call work through the server, with ICE servers from /v1/ice', async ({
  context,
}) => {
  const alice = await context.newPage();
  const bob = await context.newPage();
  await alice.goto(url('presence', 'alice'));
  await bob.goto(url('presence', 'bob'));
  await expect(
    alice.locator('tessera-presence').getByRole('img', { name: 'Bob Baker' }),
  ).toBeVisible();

  await alice.goto(url('video', 'alice'));
  await bob.goto(url('video', 'bob'));
  const call = 'tessera-call[call-id=playground]';
  for (const page of [alice, bob]) {
    await page.locator(call).getByRole('button', { name: 'Join call' }).click();
    await expect(page.locator(`${call} .prejoin`)).toBeVisible();
    await page.locator(call).getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.locator(`${call} .controls`)).toBeVisible();
  }
  await expect
    .poll(() =>
      alice.locator(call).evaluate((el) => {
        const tile = [...(el.shadowRoot?.querySelectorAll('tessera-video-tile') ?? [])].find(
          (t) => t.getAttribute('name') === 'Bob Baker',
        );
        const video = tile?.shadowRoot?.querySelector('video');
        return !!video && video.videoWidth > 0;
      }),
    )
    .toBe(true);
});

test('comments are stored by the server and shown live to the other tab', async ({ context }) => {
  const alice = await context.newPage();
  const bob = await context.newPage();
  await alice.goto(url('comments', 'alice'));
  await bob.goto(url('comments', 'bob'));
  const text = `from the server ${Date.now()}`;
  const composer = alice.locator('tessera-comments tessera-comment-composer').first();
  await composer.locator('textarea').fill(text);
  await composer.getByRole('button', { name: 'Comment' }).click();
  await expect(bob.locator('tessera-comments article').last()).toContainText(text);
  await bob.reload();
  await expect(bob.locator('tessera-comments article').last()).toContainText(text);
});
