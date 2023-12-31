import { expect, test } from "@playwright/test";
import { signIn } from "./session";

test("the theme toggle cycles light, dark and system, and remembers the choice", async ({ page, context }) => {
  await signIn(context);
  await context.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: /^Light theme\./ }).click();
  await expect(html).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: /^Dark theme\./ })).toBeVisible();

  await page.getByRole("button", { name: /^Dark theme\./ }).click();
  await expect(page.getByRole("button", { name: /^System theme\./ })).toBeVisible();
});
