import { expect, test } from '@playwright/test';
import { createWorkspace, navigateTo } from './helpers';

test('full backup → erase → restore preserves the workspace identity and history', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await createWorkspace(page, 'Round Trip Transport');
  const workspaceId = await page.locator('dd code').first().textContent();

  await navigateTo(page, 'Backup & Restore');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^fms-round-trip-transport-.*\.fmsbackup\.json$/);
  const backupPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(backupPath);
  await expect(page.getByText('Backup file created')).toBeVisible();

  // Erase needs the exact workspace name.
  await page.getByRole('button', { name: 'Erase workspace…' }).click();
  const eraseDialog = page.getByRole('dialog');
  await eraseDialog.getByRole('textbox').fill('Round Trip Transport');
  await eraseDialog.getByRole('button', { name: 'Erase workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Set up this device' })).toBeVisible();

  // Restore with preview and confirmation.
  await page.getByLabel('Backup file').setInputFiles(backupPath);
  await expect(page.getByText('Backup checked: ready to restore')).toBeVisible();
  await page.getByRole('button', { name: 'Restore this workspace…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore workspace' }).click();

  await expect(page.getByTestId('workspace-name')).toHaveText('Round Trip Transport');
  await expect(page.locator('dd code').first()).toHaveText(workspaceId ?? '');

  await navigateTo(page, 'Audit log');
  await expect(page.getByText('Workspace created')).toBeVisible();
  await expect(page.getByText(/Workspace restored from backup/)).toBeVisible();
});

test('a damaged backup file is rejected without changing anything', async ({ page }, testInfo) => {
  await page.goto('/');
  const badPath = testInfo.outputPath('damaged.fmsbackup.json');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(badPath, '{"format":"fms.workspace-backup","formatVersion":1');
  await page.getByLabel('Backup file').setInputFiles(badPath);
  await expect(page.getByText('This file cannot be restored')).toBeVisible();
  await expect(page.getByText('Nothing on this device was changed.')).toBeVisible();
});
