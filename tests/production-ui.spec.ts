import { expect, test } from "@playwright/test";

test("public authentication UI is production-only", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("");
  await expect(page.getByLabel("Password")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText(/demo|preview account|sample account/i);
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your VYBE" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText(/demo|fake|simulated/i);
  expect(errors).toEqual([]);
});

test("logged-out private routes are protected", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login\?next=%2Fhome|\/login\?next=\/home/);
  await page.goto("/solo");
  await expect(page).toHaveURL(/\/login\?next=%2Fsolo|\/login\?next=\/solo/);
  await page.goto("/group");
  await expect(page).toHaveURL(/\/login\?next=%2Fgroup|\/login\?next=\/group/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin|\/login\?next=\/admin/);
});

test("theme boot is flash-free and uses the production palette", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vybe-theme", "light"));
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const colorScheme = await page.locator("html").evaluate((node) => getComputedStyle(node).colorScheme);
  expect(colorScheme).toContain("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("390x844 public routes have no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/login", "/signup", "/forgot-password"]) {
    await page.goto(route);
    const sizes = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(sizes.body, `${route} overflow`).toBeLessThanOrEqual(sizes.viewport + 1);
  }
});
