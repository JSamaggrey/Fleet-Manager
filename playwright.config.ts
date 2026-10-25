import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build (vite preview) so tests exercise what users install.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet-webkit', use: { ...devices['iPad (gen 7)'] } },
    // Android tablet: Chromium with an Android user agent, touch and a mobile viewport (portrait).
    { name: 'tablet-android', use: { ...devices['Galaxy Tab S9'] } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
