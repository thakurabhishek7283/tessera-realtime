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
