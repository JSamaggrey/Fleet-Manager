import { expect, test } from '@playwright/test';
import { createWorkspace, navigateTo, waitForOfflineReady } from './helpers';

test('create an asset offline and inspect its depreciation schedule', async ({ page, context }) => {
  await page.goto('/');
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();

  await createWorkspace(page, 'Asset Fleet');
  await navigateTo(page, 'Assets');
  await page.getByRole('link', { name: 'Add asset' }).click();

  await page.getByLabel('Asset code').fill('GR-100');
  await page.getByLabel('Name').fill('Nissan Urvan');
  await page.getByLabel('Category').selectOption({ label: 'Minibus / bus' });
  await page.getByLabel('Acquisition date').fill('2025-01-05');
  await page.getByLabel('In-service date').fill('2025-01-10');
  await page.getByLabel('Useful life (months)').fill('48');
  await page.getByLabel('Capitalised cost (GHS)').fill('240,000.00');
  await page.getByLabel('Residual value (GHS)').fill('48000');
  await page.getByLabel('Registration / plate').fill('GT 4455-24');
  await page.getByRole('button', { name: 'Create asset' }).click();

  await expect(page.getByRole('heading', { name: /GR-100/ })).toBeVisible();
  const schedule = page.getByRole('table', { name: /Depreciation schedule for GR-100/ });
  // 192,000 / 48 = 4,000 per month, 48 months.
  await expect(schedule.getByRole('row')).toHaveCount(49);
  await expect(schedule.getByRole('row').nth(1)).toContainText('Jan 2025');
  await expect(schedule.getByRole('row').nth(1)).toContainText('4,000.00');
  await expect(schedule.getByRole('row').last()).toContainText('48,000.00');

  // Survives a reload while still offline.
  await page.reload();
  await expect(page.getByRole('heading', { name: /GR-100/ })).toBeVisible();
  await navigateTo(page, 'Assets');
  await expect(page.getByRole('link', { name: 'GR-100' })).toBeVisible();
});

test('a demo workspace backup restores assets, schedules and history', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open demo workspace' }).click();
  await expect(page.getByText('DEMO', { exact: true })).toBeVisible();

  await navigateTo(page, 'Backup & Restore');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(backupPath);

  await page.getByRole('button', { name: 'Erase workspace…' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Demo workspace');
  await page.getByRole('dialog').getByRole('button', { name: 'Erase workspace' }).click();

  await page.getByLabel('Backup file').setInputFiles(backupPath);
  await expect(page.getByText('Backup checked: ready to restore')).toBeVisible();
  await expect(page.getByText(/3 assets/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore this workspace…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await navigateTo(page, 'Assets');
  for (const code of ['DEMO-001', 'DEMO-002', 'DEMO-003']) {
    await expect(page.getByRole('link', { name: code })).toBeVisible();
  }
  await page.getByRole('link', { name: 'DEMO-002' }).click();
  await expect(
    page.getByRole('table', { name: /Depreciation schedule for DEMO-002/ }).getByRole('row'),
  ).toHaveCount(73);
});
