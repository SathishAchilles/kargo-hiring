import type { BrowserContext } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/lib/auth/session";

export async function signIn(context: BrowserContext, baseURL = "http://localhost:3107") {
  const token = await createSessionToken();
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}
