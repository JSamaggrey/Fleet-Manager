import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { navigateTo, waitForOfflineReady } from './helpers';

test('reports work offline, drill through to records and export CSV', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('/');
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();

  await page.getByRole('button', { name: 'Open demo workspace' }).click();
  await expect(page.getByText('DEMO', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Management profit this month' })).toBeVisible();

  await navigateTo(page, 'Reports');
  await expect(page.getByRole('region', { name: 'Report scope' })).toContainText('Demo workspace');
  await page.getByRole('button', { name: 'Previous period' }).click();
  const statement = page.getByRole('table', { name: 'Fleet management profit statement' });
  await expect(statement).toContainText('Shared / fleet expenses');
  await expect(page.getByTestId('fleet-profit')).not.toBeEmpty();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Asset & fleet profit' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^fms-demo-workspace-profit-.*\.csv$/);
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const csv = await readFile(path, 'utf8');
  expect(csv).toMatch(/row_type,period_from,period_to,asset_code/);
  expect(csv).toMatch(/\r\nfleet,/);

  // Drill through from DEMO-002's revenue to its trips in that month.
  const row = page
    .getByRole('table', { name: /Asset management profit/ })
    .getByRole('row')
    .filter({ hasText: 'DEMO-002' });
  await row.getByRole('link').nth(1).click();
  await expect(page.getByRole('heading', { name: 'Revenue' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'KSI-0202' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'TRIP-0101' })).toHaveCount(0);

  await navigateTo(page, 'Exceptions');
  await expect(page.getByText('Revenue without an asset (1)')).toBeVisible();
});
