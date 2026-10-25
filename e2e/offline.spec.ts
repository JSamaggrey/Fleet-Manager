import { expect, test } from '@playwright/test';
import { createWorkspace, navigateTo, waitForOfflineReady } from './helpers';

test('after the first load, the app starts and works with the network disabled', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await waitForOfflineReady(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Set up this device' })).toBeVisible();

  // Core workflow fully offline: create a workspace, change settings, reload.
  await createWorkspace(page, 'Offline Fleet');
  await expect(page.getByText('Offline — working locally')).toBeVisible();
  await expect(page.getByText('Available offline')).toBeVisible();

  await navigateTo(page, 'Settings');
  await page.getByLabel('Workspace name').fill('Offline Fleet Ltd');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('workspace-name')).toHaveText('Offline Fleet Ltd');

  await navigateTo(page, 'Audit log');
  await expect(page.getByText('Workspace settings updated')).toBeVisible();
});
