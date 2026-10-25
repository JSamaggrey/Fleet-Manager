import { expect, test } from '@playwright/test';
import { createWorkspace, navigateTo, waitForOfflineReady } from './helpers';

test('record revenue and a shared expense offline, then void the revenue', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();

  await createWorkspace(page, 'Trip Fleet');
  await navigateTo(page, 'Revenue');
  await page.getByRole('link', { name: 'Record revenue' }).click();
  await page.getByLabel('Trip / job / contract reference').fill('TRIP-500');
  await page.getByLabel('Asset').selectOption({ label: 'Unassigned — assign later' });
  await page.getByLabel('Amount (GHS)').fill('1,250.00');
  await page.getByRole('button', { name: 'Record revenue' }).click();
  await expect(page.getByRole('heading', { name: /TRIP-500/ })).toBeVisible();
  await expect(page.getByText('No asset assigned')).toBeVisible();

  await navigateTo(page, 'Expenses');
  await page.getByRole('link', { name: 'Record expense' }).click();
  await page.getByLabel(/Shared \/ fleet/).check();
  await page.getByLabel('Category').selectOption({ label: 'Rent and utilities' });
  await page.getByLabel('Amount (GHS)').fill('2500');
  await page.getByRole('button', { name: 'Record expense' }).click();
  await expect(page.getByText(/deducted only in fleet profit/)).toBeVisible();

  // Survives a reload offline; then void the revenue.
  await page.reload();
  await navigateTo(page, 'Revenue');
  await expect(page.getByTestId('revenue-total')).toContainText('1,250.00');
  await page.getByRole('link', { name: 'TRIP-500' }).click();
  await page.getByRole('button', { name: 'Void' }).click();
  await page.getByRole('dialog').getByLabel('Reason (required)').fill('Customer cancelled');
  await page.getByRole('dialog').getByRole('button', { name: 'Void revenue entry' }).click();
  await expect(page.getByText('Voided — excluded from all totals')).toBeVisible();

  await navigateTo(page, 'Revenue');
  await page.getByLabel('Status', { exact: true }).selectOption('all');
  await expect(page.getByRole('link', { name: 'TRIP-500' })).toBeVisible();
  await expect(page.getByTestId('revenue-total')).toContainText('0.00');
  await expect(page.getByText('(excludes 1 voided)')).toBeVisible();
});

test('a demo backup restores revenue, expenses and voids', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open demo workspace' }).click();
  await expect(page.getByText('DEMO', { exact: true })).toBeVisible();

  await navigateTo(page, 'Revenue');
  await page.getByRole('link', { name: 'TRIP-0101' }).click();
  await page.getByRole('button', { name: 'Void' }).click();
  await page.getByRole('dialog').getByLabel('Reason (required)').fill('Duplicate entry');
  await page.getByRole('dialog').getByRole('button', { name: 'Void revenue entry' }).click();
  await expect(page.getByText('Voided — excluded from all totals')).toBeVisible();

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
  await expect(page.getByText(/6 revenue entries, 6 expenses/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore this workspace…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await navigateTo(page, 'Revenue');
  await page.getByLabel('Status', { exact: true }).selectOption('voided');
  await page.getByRole('link', { name: 'TRIP-0101' }).click();
  await expect(page.getByText(/Reason: Duplicate entry/).first()).toBeVisible();

  await navigateTo(page, 'Expenses');
  await expect(page.getByLabel('Totals for the expenses shown')).toContainText('2,500.00');
});
