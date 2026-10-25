import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectWorkspaceNameReadable } from './helpers';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: Page, name: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map(
    (v) =>
      `${name}: ${v.id} (${v.impact ?? 'n/a'}) ${v.help} → ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
}

/** Pages reached by route, waiting for a heading that only appears once data has loaded. */
const PAGES: [path: string, ready: RegExp | string][] = [
  ['/', 'Dashboard'],
  ['/assets', 'Assets'],
  ['/assets/new', 'Add asset'],
  ['/revenue', 'Revenue'],
  ['/revenue/new', 'Record revenue'],
  ['/expenses', 'Expenses'],
  ['/expenses/new', 'Record expense'],
  ['/depreciation', 'Depreciation'],
  ['/reports', 'Reports'],
  ['/exceptions', 'Exceptions'],
  ['/tasks', 'Tasks'],
  ['/backup', 'Backup & Restore'],
  ['/settings', 'Settings'],
  ['/audit', 'Audit log'],
];

test('the setup screen and every main page pass automated WCAG 2.1 AA checks', async ({ page }) => {
  test.setTimeout(120_000);
  const violations: string[] = [];
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open demo workspace' })).toBeVisible();
  violations.push(...(await scan(page, 'onboarding')));

  await page.getByRole('button', { name: 'Open demo workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expectWorkspaceNameReadable(page);

  for (const [path, heading] of PAGES) {
    await page.goto(`/#${path}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await page.waitForLoadState('networkidle');
    violations.push(...(await scan(page, path)));
  }

  // Detail pages, reached through their lists.
  for (const [list, link] of [
    ['/assets', 'DEMO-001'],
    ['/revenue', 'TRIP-0101'],
  ] as const) {
    await page.goto(`/#${list}`);
    await page.getByRole('link', { name: link, exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(link) })).toBeVisible();
    violations.push(...(await scan(page, `${list}/${link}`)));
  }

  expect(violations, violations.join('\n')).toEqual([]);
});
