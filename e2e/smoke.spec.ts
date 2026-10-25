import { expect, test } from '@playwright/test';

test('production build loads the setup screen with the local-only notice', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up this device' })).toBeVisible();
  await expect(page.getByText('Each device has its own separate workspace')).toBeVisible();
});

test('the web app manifest is served for installation', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
});
