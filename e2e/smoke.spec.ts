import { expect, test } from '@playwright/test';

test('production build loads the app shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /fleet & asset management/i })).toBeVisible();
  await expect(page.getByText('GHS', { exact: true })).toBeVisible();
});
