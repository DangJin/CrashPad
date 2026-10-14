import { defineConfig, devices } from '@playwright/test';
// Ensure local tests bypass an optional machine-wide HTTP proxy.
process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  reporter: 'list',
  use: { storageState: { cookies: [], origins: [{ origin: 'http://127.0.0.1:5173', localStorage: [{ name: 'crashpad:welcome:v1', value: 'seen' }] }] }, baseURL: 'http://127.0.0.1:5173', screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: process.env.CRASH_PAD_BROWSER ? { executablePath: process.env.CRASH_PAD_BROWSER } : {} },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: process.env.CRASH_PAD_REUSE_SERVER === '1', gracefulShutdown: { signal: 'SIGTERM', timeout: 500 } },
});
