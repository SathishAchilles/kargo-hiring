import { expect, test } from "@playwright/test";

test("dashboard redirects to sign-in without a session", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("heading", { name: "Kargo Hiring" })).toBeVisible();
});

test("candidate API rejects requests without a session", async ({ request }) => {
  const res = await request.get("/api/candidates/any/file");
  expect(res.status()).toBe(401);
});

test("wrong passcode is refused", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Passcode").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong passcode.")).toBeVisible();
});
