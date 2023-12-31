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
  // A production build: faster and closer to real use than the dev server, and it does not
  // compete with a running `npm run dev` for Next's directory lock.
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    reuseExistingServer: Boolean(process.env.PW_REUSE),
    timeout: 240_000,
  },
});
