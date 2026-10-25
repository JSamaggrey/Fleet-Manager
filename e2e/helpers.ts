import { expect, type Page } from '@playwright/test';

/** Waits until the service worker has precached the app and controls the page. */
export async function waitForOfflineReady(page: Page): Promise<void> {
  // Poll via evaluate: waitForFunction treats an async predicate's Promise as truthy.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return registration?.active?.state === 'activated';
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

export async function createWorkspace(page: Page, name: string): Promise<void> {
  await page.getByLabel('Workspace name').fill(name);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('workspace-name')).toHaveText(name);
}

/** Uses the sidebar on wide screens and the menu button on tablets/phones. */
export async function navigateTo(page: Page, label: string): Promise<void> {
  // Wait for the app shell so the menu check below is not racing a screen transition.
  await page.getByRole('banner').waitFor();
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) {
    await menu.click();
  }
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: label })
    .locator('visible=true')
    .click();
}
