import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 30_000,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /mobile\.spec\.ts/ },
    // The iOS Safari unlock path: touch input (touchend) on a mobile WebKit profile.
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      testMatch: /(unlock|mobile)\.spec\.ts/,
    },
    // Same touch path in a browser that has Web Audio everywhere: pointerdown (touch) creates
    // the context without activation, touchend resumes it.
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /(unlock|mobile)\.spec\.ts/,
    },
  ],
});
