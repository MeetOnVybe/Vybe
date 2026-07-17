import { expect, test, type Page } from '@playwright/test';

function watchBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function demoLogin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /Enter VYBE/ }).click();
  await expect(page).toHaveURL(/home/);
}

test('Phase 2 preserves the complete demo social flow', async ({ page }) => {
  test.setTimeout(60_000);
  const browserErrors = watchBrowserErrors(page);

  await page.goto('/signup');
  await page.getByPlaceholder('your_vybe').fill('Malachi');
  await page.getByPlaceholder('Your name').fill('Malachi');
  await page.locator('input[type="date"]').fill('2012-04-04');
  await page.getByPlaceholder('you@example.com').fill('malachi@example.com');
  await page.getByPlaceholder('At least 8 characters').fill('vybe1234');
  await page.getByRole('button', { name: /continue/i }).click();

  await expect(page).toHaveURL(/onboarding\/age/);
  await page.getByRole('button', { name: /Ages 13–15/ }).click();
  await page.getByRole('button', { name: /Choose interests/ }).click();
  await page.getByRole('button', { name: 'Fashion' }).click();
  await page.getByRole('button', { name: /Enter VYBE/ }).click();

  await expect(page).toHaveURL(/home/);
  await expect(page.getByText(/What’s the VYBE, Malachi/)).toBeVisible();
  // Headless CI does not need audio/GPU-heavy motion to verify the behavior contract.
  await page.goto('/settings');
  await page.getByRole('checkbox', { name: 'VYBE sounds' }).click({ force: true });
  await page.getByRole('checkbox', { name: 'Animations' }).click({ force: true });
  await page.goto('/home');
  await page.getByRole('link', { name: /Start Solo Match/ }).click();
  await page.getByRole('button', { name: 'Legacy demo' }).click();

  await expect(page.getByText(/Finding your VYBE/)).toBeVisible();
  const remoteName = page.locator('article').nth(1).locator('h2');
  await expect(remoteName).toBeVisible({ timeout: 7000 });
  const firstName = (await remoteName.textContent())?.trim();
  expect(firstName).toBeTruthy();

  await page.getByRole('button', { name: /^Skip$/ }).click();
  await expect(page.getByText(/Finding your VYBE/)).toBeVisible();
  await expect(remoteName).toBeVisible({ timeout: 7000 });
  const secondName = (await remoteName.textContent())?.trim();
  expect(secondName).toBeTruthy();
  expect(secondName).not.toBe(firstName);

  await page.getByRole('button', { name: /Add Friend/ }).click();
  await expect(page.getByText('Friend request sent')).toBeVisible();
  await expect(page.getByText(new RegExp(`${secondName} accepted your request`))).toBeVisible({ timeout: 6000 });

  await page.getByRole('link', { name: /Leave/ }).click();
  await page.getByRole('link', { name: /Friends Manage accepted friends/i }).click();
  const friendNameLink = page.getByRole('link', { name: secondName!, exact: true });
  await expect(friendNameLink).toBeVisible();
  const row = friendNameLink.locator('xpath=ancestor::div[contains(@class,"flex")][1]');
  const chatLink = row.getByRole('link', { name: 'Chat' });
  if (await chatLink.count()) await chatLink.click();
  else {
    await friendNameLink.click();
    await page.getByRole('link', { name: /Private Chat/ }).click();
  }

  const messageBox = page.getByPlaceholder(new RegExp(`Message ${secondName}`));
  await messageBox.fill('Yo this prototype is fire');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Yo this prototype is fire')).toBeVisible();
  await expect(page.getByText('typing', { exact: true })).toBeVisible({ timeout: 4000 });
  await expect(page.getByText('Seen', { exact: true })).toBeVisible({ timeout: 4000 });

  await page.goto('/group');
  await expect(page.getByText(/Finding your VYBE/)).toBeVisible();
  const groupNames = page.locator('article h2');
  await expect(groupNames.first()).toBeVisible({ timeout: 7000 });
  expect(await groupNames.count()).toBeGreaterThanOrEqual(4);
  const before = await groupNames.allTextContents();
  await page.getByRole('button', { name: /Skip Group/ }).click();
  await expect(page.getByText(/Finding your VYBE/)).toBeVisible();
  await expect(groupNames.first()).toBeVisible({ timeout: 7000 });
  expect((await groupNames.allTextContents()).join('|')).not.toBe(before.join('|'));
  expect(browserErrors).toEqual([]);
});

test('profile customization and settings persist in demo mode', async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);
  await demoLogin(page);
  await page.goto('/profile');
  await page.getByLabel('Username').fill('ChiVYBE');
  await page.getByLabel('Display name').fill('Chi');
  await page.getByLabel('Short bio').fill('Hoops, music, games, and good energy only.');
  await page.getByLabel('Status').selectOption({ label: '🏀 Looking for hoopers' });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'profile.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Choose this profile banner' }).nth(2).click();
  await page.getByRole('button', { name: /Save profile/ }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Username')).toHaveValue('ChiVYBE');
  await expect(page.getByLabel('Display name')).toHaveValue('Chi');
  await expect(page.getByLabel('Short bio')).toHaveValue('Hoops, music, games, and good energy only.');

  await page.goto('/settings');
  const sound = page.getByRole('checkbox', { name: 'VYBE sounds' });
  await expect(sound).toBeChecked();
  await sound.click({ force: true });
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'VYBE sounds' })).not.toBeChecked();
  expect(browserErrors).toEqual([]);
});

test('all application pages render without runtime or hydration errors', async ({ page }) => {
  test.setTimeout(60_000);
  const browserErrors = watchBrowserErrors(page);
  const routes = [
    '/', '/signup', '/login', '/forgot-password', '/reset-password', '/onboarding/age', '/onboarding/interests',
    '/home', '/discover', '/matches', '/search', '/finding', '/solo', '/group', '/friends', '/requests', '/chat', '/chat/u-kai',
    '/notifications', '/profile', '/profile/u-kai', '/settings', '/safety',
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
  }
  expect(browserErrors).toEqual([]);
});

test('390px mobile match layout and six-item navigation remain responsive', async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/solo');
  await page.getByRole('button', { name: 'Legacy demo' }).click();
  const panels = page.locator('article');
  await expect(panels).toHaveCount(2, { timeout: 7000 });
  const first = await panels.nth(0).boundingBox();
  const second = await panels.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(second!.y).toBeGreaterThan(first!.y + first!.height - 5);
  await expect(page.getByRole('button', { name: /^Skip$/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);

  await page.goto('/home');
  const mobileNav = page.locator('nav').last();
  for (const label of ['Home', 'Match', 'Friends', 'Chat', 'Profile', 'Settings']) {
    await expect(mobileNav.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  expect(browserErrors).toEqual([]);
});
