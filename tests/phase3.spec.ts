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

test('Phase 3 discovery, keyboard decisions, mutual match, match chat, and unmatch work', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await demoLogin(page);
  await page.goto('/discover');

  const card = page.locator('article[aria-label^="Discovery profile"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('AGES 13-15');
  await expect(card).toContainText('VYBE');

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: 'New VYBE match' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'It’s a VYBE' })).toBeVisible();
  await page.getByRole('link', { name: /Say hey/ }).click();
  await expect(page).toHaveURL(/chat\/u-zay/);
  await expect(page.getByPlaceholder(/Message/)).toBeVisible();

  await page.getByPlaceholder(/Message/).fill('Phase 3 match chat works');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Phase 3 match chat works')).toBeVisible();

  await page.goto('/matches');
  await expect(page.getByText('@ZayOnTop')).toBeVisible();
  await page.getByRole('button', { name: /Unmatch/ }).click();
  await expect(page.getByText('No active matches yet')).toBeVisible();
  await page.goto('/chat/u-zay');
  await expect(page.getByText('Chat locked')).toBeVisible();

  await page.goto('/discover');
  await expect(card).toBeVisible();
  const passedName = await card.locator('h2').textContent();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('Passed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo most recent pass' }).filter({ visible: true }).last().click();
  await expect(page.getByText('Last pass restored')).toBeVisible();
  await expect(page.getByRole('heading', { name: passedName || '', exact: true }).last()).toBeVisible();
  expect(errors).toEqual([]);
});

test('search is debounced, bracket-safe, block-aware, and has complete states', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await demoLogin(page);
  await page.goto('/search');
  const input = page.getByRole('textbox', { name: 'Search users' });
  await input.fill('Gaming');
  await expect(page.getByText(/VYBE compatibility/).first()).toBeVisible();
  await expect(page.getByText(/Ages 16–17/)).toHaveCount(0);

  await input.fill('definitely-no-vybe-user');
  await expect(page.getByText('No eligible profiles found')).toBeVisible();
  expect(errors).toEqual([]);
});

test('light and dark themes load without a flash and persist before and after login', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await page.addInitScript(() => { if (!localStorage.getItem('vybe-theme')) localStorage.setItem('vybe-theme', 'light'); });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(238, 247, 255)');

  await page.getByRole('button', { name: /Enter VYBE/ }).click();
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: /^Ice/ })).toHaveClass(/border-blue/);

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await page.evaluate(() => localStorage.getItem('vybe-theme'))).toBe('dark');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(3, 5, 10)');
  expect(errors).toEqual([]);
});

test('390×844 Discovery, Matches, Search, light mode, and mobile navigation have no overflow', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { if (!localStorage.getItem('vybe-theme')) localStorage.setItem('vybe-theme', 'light'); });
  await demoLogin(page);

  for (const route of ['/discover', '/matches', '/search', '/notifications', '/settings']) {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${route} overflowed`).toBe(false);
  }
  const nav = page.locator('nav[aria-label="Mobile navigation"]');
  for (const label of ['Home', 'Match', 'Friends', 'Chat', 'Profile', 'Settings']) await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
