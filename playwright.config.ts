import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Tests mint a founder session with the local SESSION_SECRET.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 3107;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
