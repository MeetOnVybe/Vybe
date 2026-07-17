import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 3104);

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    permissions: ['microphone', 'camera'],
    browserName: 'chromium',
    launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--renderer-process-limit=2', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  reporter: [['list']],
  workers: 1,
  retries: 1,
  webServer: {
    command: `npm start -- -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
