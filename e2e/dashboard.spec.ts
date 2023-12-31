import { expect, test } from "@playwright/test";
import { hasData, NEEDS_DATA, signIn } from "./session";

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  test.skip(!(await hasData(page)), NEEDS_DATA);
});

async function rankedNames(page: import("@playwright/test").Page, role: "pm" | "spm") {
  await page.goto(`/?role=${role}`);
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();
  return rows.locator("td:nth-child(2) a").allTextContents();
}

test("both tabs list every scored candidate, each in its own order", async ({ page }) => {
  const pm = await rankedNames(page, "pm");
  const spm = await rankedNames(page, "spm");
  expect(pm.length).toBe(50);
  expect(spm.length).toBe(50);
  expect([...pm].sort()).toEqual([...spm].sort());
  expect(pm).not.toEqual(spm);
});

test("filters narrow the list without changing ranks", async ({ page }) => {
  await page.goto("/?role=pm");
  const firstRank = await page.locator("table tbody tr").first().locator("td").first().textContent();
  await page.goto("/?role=pm&tier=Shortlist&applied=pm");
  const tiers = await page.locator("table tbody tr td:nth-child(8) span").allTextContents();
  expect(tiers.length).toBeGreaterThan(0);
  expect(new Set(tiers)).toEqual(new Set(["Shortlist"]));
  expect(await page.locator("table tbody tr").first().locator("td").first().textContent()).toBe(firstRank);
});

test("tapping Kill evidence shows the quote behind it", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  await page.locator("table").getByRole("button", { name: "Kill evidence", exact: true }).first().click();
  const popup = page.locator('[data-slot="popover-content"]');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Kill evidence");
  await expect(popup).toContainText("—");
});

test("the cohort panel links ties at the top to a filtered list", async ({ page }) => {
  await page.goto("/?role=pm");
  const tie = page.getByRole("link", { name: /tied at/ });
  if (await tie.count()) {
    await tie.click();
    await expect(page).toHaveURL(/top=1/);
    const totals = await page.locator("table tbody tr td:nth-child(8) [data-testid=total]").allTextContents();
    expect(new Set(totals).size).toBe(1);
  }
});

test("a P3 = 2 candidate shows the 100+-people anchor and its quote", async ({ page }) => {
  await page.goto("/?role=pm");
  // Column 5 is P3 (after #, candidate, P1, P2).
  const row = page.locator("table tbody tr").filter({ has: page.locator("td:nth-child(5)", { hasText: /^2$/ }) }).first();
  await row.locator("td:nth-child(2) a").click();
  await expect(page.getByRole("heading", { name: /^Why \d+ for PM$/ })).toBeVisible();
  const p3 = page.locator("ol > li").filter({ hasText: "P3 Operating without structure" });
  await expect(p3).toContainText("2/5");
  await expect(p3).toContainText("Product role at a company of 100+ people with a PM above");
  // The quotes are collapsed until asked for.
  const evidence = p3.locator("details");
  await expect(evidence).not.toHaveAttribute("open", "");
  await expect(p3.locator("ul li").first()).toBeHidden();
  await evidence.locator("summary").click();
  await expect(p3.locator("ul li").first()).toBeVisible();
});

test("clicking a column header sorts by it, flips on a second click, and keeps rank numbers", async ({ page }) => {
  await page.goto("/?role=pm");
  const header = page.locator("table thead th").filter({ hasText: "P1" });
  await header.getByRole("link").click();
  await expect(page).toHaveURL(/sort=c1&dir=desc/);
  await expect(page.locator("table thead th").filter({ hasText: "P1" })).toHaveAttribute("aria-sort", "descending");
  const best = page.locator("table tbody tr").first().locator("td:nth-child(3) [role=img]");
  await expect(best).toHaveAttribute("aria-label", "P1: 5 of 5");
  const ranks = (await page.locator("table tbody tr td:first-child").allTextContents()).map(Number);
  expect([...ranks].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

  await page.locator("table thead th").filter({ hasText: "P1" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=c1&dir=asc/);
  await expect(page.locator("table tbody tr").first().locator("td:nth-child(3) [role=img]")).toHaveAttribute("aria-label", /P1: [12] of 5/);
});

test("sorting keeps the active filters", async ({ page }) => {
  await page.goto("/?role=pm&tier=Shortlist");
  await page.getByRole("columnheader", { name: /^Total/ }).getByRole("link").click();
  await expect(page).toHaveURL(/tier=Shortlist/);
  await expect(page).toHaveURL(/sort=total/);
});

test("the table header stays visible while the rows scroll", async ({ page }) => {
  await page.goto("/?role=pm");
  const container = page.locator('[data-slot="table-container"]');
  await container.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const totalHead = page.getByRole("columnheader", { name: /^Total/ });
  const [head, box] = await Promise.all([totalHead.boundingBox(), container.boundingBox()]);
  expect(Math.abs((head?.y ?? -999) - (box?.y ?? 0))).toBeLessThan(3);
  await expect(totalHead).toBeInViewport();
});

test("rows show at most three insights inline, with the rest behind +N", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  const rows = page.locator("table tbody tr");
  for (let i = 0; i < 5; i += 1) {
    const inline = await rows.nth(i).locator("td:nth-child(10) button").count();
    expect(inline).toBeLessThanOrEqual(4); // three chips plus the +N button
  }
  const more = page.locator("table tbody tr td:nth-child(10)").getByRole("button", { name: /^\d+ more insights/ }).first();
  await more.click();
  await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
});

test("years are their own column, as product / total", async ({ page }) => {
  await page.goto("/?role=pm");
  await expect(page.locator("table tbody tr").first().locator("td:nth-child(9)")).toHaveText(/^\d+\.\d \/ \d+\.\d$/);
});

test("tier badges are not white-on-amber", async ({ page }) => {
  await page.goto("/?role=pm&tier=Hold");
  const badge = page.locator("table tbody tr td:nth-child(8) span").first();
  const color = await badge.evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe("rgb(255, 255, 255)");
});

test("tier quick filters sit above the list and toggle on and off", async ({ page }) => {
  await page.goto("/?role=pm", { waitUntil: "networkidle" });
  const shortlist = page.getByRole("link", { name: /^Shortlist \d+$/ });
  await shortlist.click();
  await expect(page).toHaveURL(/tier=Shortlist/);
  await expect(page.getByRole("link", { name: /^Shortlist \d+$/ })).toHaveAttribute("aria-current", "true");
  await page.getByRole("link", { name: /^Shortlist \d+$/ }).click();
  await expect(page).not.toHaveURL(/tier=/);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the ranking comes before the cohort panel, inside the first screen", async ({ page }) => {
    await page.goto("/?role=pm");
    const first = page.locator("ul li a[href^='/candidates/']").first();
    const cohort = page.getByRole("region", { name: "Cohort insights" });
    const [list, panel] = await Promise.all([first.boundingBox(), cohort.boundingBox()]);
    expect(list!.y).toBeLessThan(panel!.y);
    expect(list!.y).toBeLessThan(844);
  });

  test("no horizontal scroll, and a candidate shows sub-scores", async ({ page }) => {
    await page.goto("/?role=spm");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByLabel("Sub-scores").first()).toBeVisible();
    await expect(page.getByLabel("Sub-scores").first().locator("[role=img]")).toHaveCount(5);
    await page.locator("ul li a[href^='/candidates/']").first().click();
    await expect(page.locator("ol > li")).toHaveCount(5);
    const detailOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(detailOverflow).toBeLessThanOrEqual(0);
  });
});

test("totals are shown as rings and the cohort panel charts the score distribution", async ({ page }) => {
  await page.goto("/?role=pm");
  await expect(page.locator("table tbody tr td:nth-child(8) [data-testid=total]")).toHaveCount(50);
  await expect(page.getByRole("img", { name: /^Score distribution: 20 to 29: \d+/ })).toBeVisible();
});

test("the top three ranks get a medal and the rest do not", async ({ page }) => {
  await page.goto("/?role=pm");
  const ranks = page.locator("table tbody tr td:first-child > span");
  await expect(ranks.nth(0)).toHaveClass(/ring-1/);
  await expect(ranks.nth(2)).toHaveClass(/ring-1/);
  await expect(ranks.nth(3)).not.toHaveClass(/ring-1/);
});
