import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 3104);

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    permissions: ["microphone", "camera"],
    browserName: "chromium",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : {}),
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  webServer: {
    command: `npm start -- -H 127.0.0.1 -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
