import { expect, test } from '@playwright/test';

test('two tabs discuss a campsite: comment, rate, reply and react', async ({ context }) => {
  const alice = await context.newPage();
  const bob = await context.newPage();
  await alice.goto('/?tab=comments&user=alice');
  await bob.goto('/?tab=comments&user=bob');

  const thread = (page: typeof alice) => page.locator('tessera-comments');
  const composer = (page: typeof alice) => thread(page).locator('tessera-comment-composer').first();

  await composer(alice).locator('textarea').fill('Lovely spot, quiet at night.');
  await composer(alice).getByRole('radio', { name: '5 stars' }).click();
  await composer(alice).getByRole('button', { name: 'Comment' }).click();

  await expect(thread(bob).locator('article').first()).toContainText(
    'Lovely spot, quiet at night.',
  );
  await expect(thread(bob).locator('.summary')).toHaveAttribute('aria-label', /5\.0 out of 5/);
  await expect(bob.locator('tessera-comment-count .badge')).toHaveAttribute(
    'aria-label',
    '1 comment',
  );

  await thread(bob).getByRole('button', { name: 'Reply' }).click();
  await thread(bob).locator('tessera-comment-composer').nth(1).locator('textarea').fill('Agreed!');
  await thread(bob)
    .locator('tessera-comment-composer')
    .nth(1)
    .getByRole('button', { name: 'Reply' })
    .click();
  await expect(thread(alice).locator('ol ol article')).toContainText('Agreed!');

  await thread(alice)
    .locator('article')
    .first()
    .getByRole('button', { name: 'Add reaction' })
    .click();
  await thread(alice).locator('.picker button').first().click();
  await expect(thread(bob).locator('.chip').first()).toContainText('1');
});
