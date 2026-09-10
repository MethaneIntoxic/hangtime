import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [
  { name: "320px", width: 320, height: 844 },
  { name: "390px", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

test.describe("production sign-in accessibility", () => {
  for (const viewport of viewports) {
    test(`fits the card and controls at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/sign-in");
      await expect(page.getByRole("heading", { name: "Make time for your people." })).toBeVisible();

      const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
      expect(viewportMeta).toContain("width=device-width");
      expect(viewportMeta).toContain("initial-scale=1");
      expect(viewportMeta).not.toMatch(/maximum-scale\s*=\s*1/i);
      expect(viewportMeta).not.toMatch(/user-scalable\s*=\s*no/i);

      const layout = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.scrollWidth, `horizontal overflow at ${viewport.name}`).toBeLessThanOrEqual(layout.viewportWidth);

      const boundedElements = [
        page.locator("main").first(),
        page.locator("main > section").first(),
        page.getByLabel("Email address"),
        page.getByRole("button", { name: "Email me a sign-in link" }),
      ];
      for (const element of boundedElements) {
        const box = await element.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x, `left edge outside viewport at ${viewport.name}`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `right edge outside viewport at ${viewport.name}`).toBeLessThanOrEqual(viewport.width);
      }

      const results = await new AxeBuilder({ page }).analyze();
      const seriousOrCritical = results.violations.filter((violation) =>
        violation.impact === "serious" || violation.impact === "critical",
      );
      expect(seriousOrCritical, `serious/critical accessibility violations at ${viewport.name}`).toEqual([]);
    });
  }

  test("does not send a request for an invalid email", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/v1/auth/magic-link", async (route) => {
      requests += 1;
      await route.fulfill({ status: 418, contentType: "application/json", body: "{}" });
    });
    await page.goto("/sign-in");

    const email = page.getByLabel("Email address");
    await email.fill("not-an-email");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();

    const validity = await email.evaluate((element) => {
      const input = element as HTMLInputElement;
      return { valid: input.validity.valid, validationMessage: input.validationMessage };
    });
    expect(validity.valid).toBe(false);
    expect(validity.validationMessage).toBeTruthy();
    expect(requests).toBe(0);
  });
});
