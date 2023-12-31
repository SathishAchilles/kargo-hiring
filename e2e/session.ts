import type { BrowserContext } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/lib/auth/session";

export async function signIn(context: BrowserContext, baseURL = "http://localhost:3107") {
  const token = await createSessionToken();
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}

import type { Page } from "@playwright/test";

// True when the database has ranked candidates. Data-dependent specs skip without them.
export async function hasData(page: Page): Promise<boolean> {
  await page.goto("/?role=pm");
  return (await page.locator("table tbody tr").count()) > 0;
}

export const NEEDS_DATA = "needs the demo data: npm run data:restore -- demo --yes";
