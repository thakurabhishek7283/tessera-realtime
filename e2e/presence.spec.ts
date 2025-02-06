import { expect, test } from '@playwright/test';

test('two tabs see each other and each other’s pointer', async ({ context }) => {
  const alice = await context.newPage();
  const bob = await context.newPage();
  await alice.goto('/?tab=presence&user=alice');
  await bob.goto('/?tab=presence&user=bob');

  await expect(
    alice.locator('tessera-presence').getByRole('img', { name: 'Bob Baker' }),
  ).toBeVisible();
  await expect(
    bob.locator('tessera-presence').getByRole('img', { name: 'Alice Archer' }),
  ).toBeVisible();

  const box = bob.locator('tessera-cursors').locator('xpath=..');
  const rect = await box.boundingBox();
  if (!rect) throw new Error('no box');
  await bob.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await bob.mouse.move(rect.x + rect.width / 2 + 5, rect.y + rect.height / 2 + 5);
  await expect(alice.locator('tessera-cursors .cursor')).toHaveCount(1);
  await expect(alice.locator('tessera-cursors .label')).toHaveText('Bob Baker');

  await bob.close();
  await expect(
    alice.locator('tessera-presence').getByRole('img', { name: 'Bob Baker' }),
  ).toHaveCount(0);
});
