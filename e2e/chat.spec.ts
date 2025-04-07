import { expect, test } from '@playwright/test';

test('two tabs chat in a room, react and start a direct message', async ({ context }) => {
  const alice = await context.newPage();
  const bob = await context.newPage();
  await alice.goto('/?tab=chat&user=alice');
  await bob.goto('/?tab=chat&user=bob');

  const compose = (page: typeof alice) =>
    page.locator('tessera-inbox tessera-chat').first().locator('tessera-chat-composer textarea');

  await compose(alice).fill('hello from alice');
  await compose(alice).press('Enter');
  const aliceMessages = alice.locator('tessera-chat-message');
  await expect(aliceMessages.first()).toContainText('hello from alice');
  await expect(bob.locator('tessera-chat-message').first()).toContainText('hello from alice');

  // typing indicator
  await compose(bob).pressSequentially('on it');
  await expect(alice.locator('tessera-chat .typing')).toContainText('Bob Baker is typing');
  await compose(bob).press('Enter');
  await expect(alice.locator('tessera-chat-message').nth(1)).toContainText('on it');

  // reaction from bob shows up for alice
  const first = bob.locator('tessera-chat-message').first();
  await first.hover();
  await first.getByRole('button', { name: 'Add reaction' }).click();
  await first.getByRole('button', { name: '👍' }).click();
  await expect(alice.locator('tessera-chat-message').first().locator('.chip')).toContainText('1');

  // direct message
  await alice.getByPlaceholder('Message someone').fill('bob');
  await alice.getByPlaceholder('Message someone').press('Enter');
  await expect(
    alice.locator('tessera-inbox tessera-chat').first().locator('[part=title]'),
  ).toContainText('Bob Baker');
  await compose(alice).fill('psst');
  await compose(alice).press('Enter');
  await expect(bob.locator('tessera-inbox .item', { hasText: 'Alice Archer' })).toBeVisible();
});
