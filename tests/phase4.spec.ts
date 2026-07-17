import { expect, test, type Page } from '@playwright/test';

function watchBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function freshDemoLogin(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Enter VYBE/ }).click();
  await expect(page).toHaveURL(/home/);
}

test('voice notes, replies, reactions, pins, deletion controls, and mute work in direct chat', async ({ page }) => {
  test.setTimeout(75_000);
  const errors = watchBrowserErrors(page);
  await freshDemoLogin(page);
  await page.goto('/chat/u-kai');
  await expect(page.getByPlaceholder(/Message Kai/)).toBeVisible();

  await page.getByRole('button', { name: 'Reply' }).first().click();
  await expect(page.getByText('Replying', { exact: true })).toBeVisible();
  await page.getByPlaceholder(/Message Kai/).fill('Phase 4 reply works');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Phase 4 reply works')).toBeVisible();

  const sentBubble = page.getByText('Phase 4 reply works').locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await sentBubble.getByRole('button', { name: 'React' }).click();
  await sentBubble.getByRole('button', { name: '🔥' }).click();
  await expect(sentBubble.getByText(/🔥 1/)).toBeVisible();
  await sentBubble.getByRole('button', { name: 'More message actions' }).click();
  await page.getByRole('button', { name: 'Pin message' }).click();
  await expect(sentBubble.getByText('Pinned')).toBeVisible();

  const record = page.getByRole('button', { name: 'Record voice message' });
  const box = await record.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Play preview' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Send voice message' }).click();
  await expect(page.getByRole('button', { name: 'Play voice message' }).last()).toBeVisible();

  await page.getByRole('button', { name: 'Mute conversation' }).click();
  await expect(page.getByRole('button', { name: 'Unmute conversation' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('stories, private groups, rich group messages, and expanded profile customization work', async ({ page }) => {
  test.setTimeout(75_000);
  const errors = watchBrowserErrors(page);
  await freshDemoLogin(page);

  await page.goto('/stories');
  await page.getByRole('button', { name: 'Add story', exact: true }).click();
  await page.getByPlaceholder('Type your story…').fill('Phase 4 story is alive ✨');
  await page.getByRole('button', { name: 'Share story' }).click();
  await expect(page.getByText('Phase 4 story is alive ✨')).toBeVisible();

  await page.goto('/chat/group/demo-group-1');
  const groupInput = page.getByPlaceholder('Message After School VYBE');
  await groupInput.fill('Phase 4 group message');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Phase 4 group message')).toBeVisible();
  const groupBubble = page.getByText('Phase 4 group message').locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await groupBubble.getByRole('button', { name: 'More message actions' }).click();
  await page.getByRole('button', { name: 'Pin message' }).click();
  await expect(groupBubble.getByText('Pinned', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Group settings' }).click();
  const groupName = page.locator('input.vybe-input:visible').first();
  await groupName.fill('Hoopers & Creators');
  await page.getByRole('button', { name: 'Save group' }).click();
  await expect(page.getByRole('heading', { name: 'Hoopers & Creators' })).toBeVisible();

  await page.goto('/profile');
  await page.getByLabel(/Favorite music/).fill('Lil Baby, gospel rap, R&B');
  await page.getByLabel(/Favorite games/).fill('2K, Fortnite, Minecraft');
  await page.getByLabel(/Favorite sports/).fill('Basketball, football');
  await page.getByLabel(/Favorite hobbies/).fill('Editing, hoops, music');
  await page.getByLabel(/School grade/).selectOption('9th');
  await page.getByLabel(/Pronouns/).fill('he/him');
  await page.getByRole('button', { name: 'Choose #0ea5e9 accent' }).click();
  await page.getByRole('button', { name: /Save profile/ }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Favorite music/)).toHaveValue('Lil Baby, gospel rap, R&B');
  await expect(page.getByLabel(/School grade/)).toHaveValue('9th');
  expect(errors).toEqual([]);
});

test('privacy controls, safety appeal UI, notifications, and admin moderation dashboard work', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await freshDemoLogin(page);

  await page.goto('/settings');
  const messagePrivacy = page.getByRole('group', { name: 'Who can message you' });
  const storyPrivacy = page.getByRole('group', { name: 'Who can view stories' });
  const onlinePrivacy = page.getByRole('group', { name: 'Who can see online status' });
  await messagePrivacy.getByRole('button', { name: 'matches' }).click();
  await storyPrivacy.getByRole('button', { name: 'matches' }).click();
  await onlinePrivacy.getByRole('button', { name: 'nobody' }).click();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Who can message you' }).getByRole('button', { name: 'matches' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Who can view stories' }).getByRole('button', { name: 'matches' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Who can see online status' }).getByRole('button', { name: 'nobody' })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/safety');
  await expect(page.getByText('Automated safety screening')).toBeVisible();
  await page.getByLabel('Appeal reason').fill('Please review this account action because important context was missed.');
  await page.getByRole('button', { name: 'Submit appeal' }).click();
  await expect(page.getByText('Demo appeal submitted')).toBeVisible();

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Trust & Safety Dashboard' })).toBeVisible();
  await expect(page.getByText('A potentially severe message was hidden automatically pending review.')).toBeVisible();
  await page.getByRole('button', { name: /Warn/ }).first().click();
  await expect(page.getByText('Moderation action recorded')).toBeVisible();
  await page.getByRole('tab', { name: /Appeals/ }).click();
  await page.getByRole('button', { name: 'Approve & restore' }).click();
  await expect(page.getByText('Appeal approved')).toBeVisible();
  await page.getByRole('tab', { name: /Logs/ }).click();
  await expect(page.getByText(/appeal approve/i)).toBeVisible();

  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Phase 4 routes preserve both themes and 390×844 mobile responsiveness', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vybe-theme', 'light'); });
  await page.reload();
  await page.getByRole('button', { name: /Enter VYBE/ }).click();
  for (const route of ['/stories', '/groups', '/chat', '/chat/group/demo-group-1', '/profile', '/settings', '/safety', '/admin']) {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${route} overflowed`).toBe(false);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  const nav = page.locator('nav[aria-label="Mobile navigation"]');
  for (const label of ['Home', 'Match', 'Friends', 'Chat', 'Profile', 'Settings']) await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
