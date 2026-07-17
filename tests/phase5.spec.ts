import { expect, test, type Page } from '@playwright/test';

function watchBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
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

async function startLiveDemo(page: Page) {
  await page.goto('/solo');
  await expect(page.getByText('Live Solo Match')).toBeVisible();
  await page.getByRole('button', { name: /Everyone/ }).click();
  await page.getByRole('button', { name: 'Start Video Match' }).click();
  await expect(page.getByText(/Getting you ready|Finding your VYBE/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('YOU', { exact: true })).toBeVisible();
  await expect(page.getByText(/VYBE compatibility/)).toBeVisible();
}

test('Phase 5 live 1:1 demo supports permissions, controls, profile actions, next, and end', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchBrowserErrors(page);
  await freshDemoLogin(page);
  await startLiveDemo(page);

  await expect(page.locator('video').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Mute' }).click();
  await expect(page.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Unmute' }).click();

  await page.getByRole('button', { name: 'Camera' }).click();
  await expect(page.getByRole('button', { name: 'Camera on' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Camera off', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Camera on' }).click();

  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByText(/VYBE compatibility/).last()).toBeVisible();
  await expect(page.getByRole('link', { name: /Full profile/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close profile' }).click();

  await page.getByLabel('Add friend', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sent' })).toBeVisible();
  await page.getByLabel('Like', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Matched' })).toBeVisible();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText(/Finding your VYBE/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Video Match' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Phase 5 location privacy and light theme use the VYBE palette', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('vybe-theme', 'light');
  });
  await page.reload();
  await page.getByRole('button', { name: /Enter VYBE/ }).click();
  await page.goto('/solo');

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(238, 247, 255)');
  await expect(page.getByText(/No GPS, address, ZIP, school/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anywhere' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Location visibility')).toHaveValue('hidden');

  await page.getByLabel('Location visibility').selectOption('city');
  await page.getByLabel('Country code').fill('US');
  await page.getByLabel('Country name').fill('United States');
  await page.getByLabel('State or region').fill('Florida');
  await page.getByLabel('City').fill('Jacksonville');
  await page.getByRole('button', { name: 'Same city' }).click();
  await expect(page.getByRole('button', { name: 'Same city' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('Phase 5 mobile video setup and call controls fit 390×844 without overflow', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await freshDemoLogin(page);
  await page.goto('/solo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  await page.getByRole('button', { name: /Everyone/ }).click();
  await page.getByRole('button', { name: 'Start Video Match' }).click();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible({ timeout: 15_000 });
  for (const label of ['Mute', 'Camera', 'Profile', 'Next', 'Report', 'Block', 'End']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  const stage = page.locator('[data-video-stage]');
  await expect(stage).toBeVisible();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  expect(errors).toEqual([]);
});
