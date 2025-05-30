import { expect, test } from '@playwright/test';

const CALL = 'tessera-call[call-id=playground]';

test('two tabs join a call and see each other’s live video', async ({ context }) => {
  const alice = await context.newPage();
  const bob = await context.newPage();
  await alice.goto('/?tab=video&user=alice');
  await bob.goto('/?tab=video&user=bob');

  for (const page of [alice, bob]) {
    await page.locator(CALL).getByRole('button', { name: 'Join call' }).click();
    await expect(page.locator(`${CALL} .prejoin`)).toBeVisible();
    await page.locator(CALL).getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.locator(`${CALL} .controls`)).toBeVisible();
  }

  // Playwright's locators pierce shadow roots; `evaluate` runs with the element in hand.
  const tile = (page: typeof alice, name: string) =>
    page.locator(CALL).evaluate((call, n) => {
      const el = [...(call.shadowRoot?.querySelectorAll('tessera-video-tile') ?? [])].find(
        (t) => t.getAttribute('name') === n,
      );
      const video = el?.shadowRoot?.querySelector('video');
      return {
        playing: !!video && video.videoWidth > 0 && !video.paused,
        muted: !!el?.shadowRoot?.querySelector('tessera-icon[name=mic-off]'),
      };
    }, name);

  await expect.poll(async () => (await tile(alice, 'Bob Baker')).playing).toBe(true);
  await expect.poll(async () => (await tile(bob, 'Alice Archer')).playing).toBe(true);

  // Mute is visible on the other side.
  await bob.locator(CALL).getByRole('button', { name: 'Turn microphone off' }).click();
  await expect.poll(async () => (await tile(alice, 'Bob Baker')).muted).toBe(true);

  await bob.locator(CALL).getByRole('button', { name: 'Leave call' }).click();
  await expect(alice.locator(CALL).getByText('1 person in the call')).toBeVisible();
});
