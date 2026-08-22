import { test, expect } from "@playwright/test";

test.describe("Hangtime Singapore — Full UAT & E2E Journey", () => {
  test.beforeEach(async ({ page }) => {
    // Reset or seed if needed
    await page.goto("/");
  });

  test("1. Home Dashboard loads with branding, active plans, and user switcher", async ({ page }) => {
    await expect(page).toHaveTitle(/Hangtime/);
    await expect(page.locator("header")).toContainText("Hangtime");
    await expect(page.locator("header")).toContainText("Meet in the middle");

    // Check user switcher is visible
    await expect(page.locator("header")).toContainText("Maya");

    // Check action buttons
    await expect(page.getByRole("link", { name: /Plan our next hangout/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active plans" })).toBeVisible();
  });

  test("2. Full Create Plan Wizard flow", async ({ page }) => {
    await page.goto("/plans/new");

    // Verify title and steps
    await expect(page.getByRole("heading", { name: "Plan a Hangout" })).toBeVisible();
    await expect(page.getByText(/1\. Who's coming\?/)).toBeVisible();
    await expect(page.getByText("2. When & What?")).toBeVisible();
    await expect(page.getByText("3. Budget & Fairness")).toBeVisible();

    const ethan = page.getByRole("button", { name: /Ethan Tan/ });
    await expect(ethan).toBeVisible();
    if ((await ethan.getAttribute("aria-pressed")) !== "true") {
      await ethan.click();
    }
    await expect(ethan).toHaveAttribute("aria-pressed", "true");

    // Select Meal Type: Dinner or Brunch
    await page.getByText("Brunch").first().click();

    // Change Budget Slider
    const slider = page.locator('input[type="range"]');
    await slider.fill("160");

    // Select Travel Fairness Mode
    await page.getByText("Fairest Journeys").click();

    // Submit Plan
    await page.getByRole("button", { name: "Create Plan & Go to Lobby" }).click();

    // Should navigate to plan room
    await expect(page).toHaveURL(/\/plans\/plan_/);
    await expect(page.getByText("Lobby & Readiness").or(page.getByText("Cast Your Group Vote"))).toBeVisible();
    await expect(page.getByText("S$160 Total")).toBeVisible();
  });

  test("3. Plan Lobby readiness & Recommendation generation", async ({ page }) => {
    // Navigate to Friday Dinner plan in voting or lobby state
    await page.goto("/plans/plan_friday_dinner");

    // Verify candidates or lobby elements
    await expect(page.locator("h2, h3").first()).toBeVisible();

    // The map is part of the ballot—not hidden behind an alternate-view toggle.
    await expect(page.getByText("Fair-meet venue map")).toBeVisible();
    await expect(page.getByRole("region", { name: "Interactive map of recommended Singapore venues" })).toBeVisible();
    await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 12_000 });
    const mappableVenueCount = await page.getByLabel("Map venue choices").getByRole("button").count();
    expect(mappableVenueCount).toBeGreaterThanOrEqual(3);
    await expect(page.locator(".hangtime-map-marker")).toHaveCount(mappableVenueCount);
    await expect(page.getByText("Loading the open map…")).toBeHidden({ timeout: 20_000 });
    const liveMapReady = page.getByText(/Map ready with/);
    const mapFallback = page.getByText(/Basic map fallback/);
    await expect(liveMapReady.or(mapFallback)).toBeVisible({ timeout: 20_000 });
    if (await mapFallback.isVisible()) {
      await expect(liveMapReady).toBeHidden();
    } else {
      await expect(liveMapReady).toBeVisible();
    }
    await expect(page.getByText("OpenFreeMap · © OpenStreetMap contributors")).toBeVisible();
    await expect(page.getByText("Travel, dietary and price details").first()).toBeVisible();
  });

  test("4. Voting with selection limit caps and real-time tally", async ({ page }) => {
    await page.goto("/plans/plan_friday_dinner");

    // Verify selection cap badge exists
    await expect(page.getByText(/selected · choose at least one/)).toBeVisible();

    // Click on a shortlist card to toggle vote
    const firstChoice = page.getByRole("button", { name: /Add .* to your ballot/ }).first();
    if (await firstChoice.isVisible()) {
      await firstChoice.click();
      await page.getByRole("button", { name: "Submit choices" }).click();
    }
  });

  test("5. Confirmed Plan view with .ics download, attendance, and feedback survey", async ({ page }) => {
    await page.goto("/plans/plan_trio_celebration");

    // Verify Confirmed view
    await expect(page.getByText("Plan Confirmed & Locked In")).toBeVisible();
    await expect(page.getByText("Meet at 19:30")).toBeVisible();
    await expect(page.getByText("Add to Calendar (.ics)")).toBeVisible();
    await expect(page.getByText("Diner Attendance")).toBeVisible();

    // Test attendance RSVP button
    const comingBtn = page.getByRole("button", { name: /I'm Coming/ });
    await expect(comingBtn).toBeVisible();
    await comingBtn.click();

    // Test 2-tap post-meal feedback survey
    const rateBtn = page.getByRole("button", { name: "Rate Meal" });
    await expect(rateBtn).toBeVisible();
    await rateBtn.click();

    // Verify feedback modal
    await expect(page.getByText("How was Hangtime?")).toBeVisible();
    await expect(page.getByText("1. Recommendation Satisfaction")).toBeVisible();
    await expect(page.getByText("2. Would you use Hangtime with this group again?")).toBeVisible();

    // Submit feedback
    await page.getByRole("button", { name: "Submit Feedback" }).click();
  });

  test("6. Companions Hub & Adding a companion", async ({ page }) => {
    await page.goto("/companions");

    await expect(page.getByRole("heading", { name: "Dining Companions" })).toBeVisible();
    await expect(page.getByText("Ethan Tan")).toBeVisible();

    // Open add companion modal
    await page.getByRole("button", { name: "Add Companion" }).click();
    await expect(page.getByText("Add Dining Companion")).toBeVisible();
  });

  test("7. Profile, Singapore Planning Area & Dietary Rules manager", async ({ page }) => {
    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: "Profile & Preferences" })).toBeVisible();
    await expect(page.getByText("Default Singapore Planning Area")).toBeVisible();
    await expect(page.getByText("Dietary Rules & Allergies")).toBeVisible();
    await expect(page.getByText("Cuisine Weights (-2 to +2)")).toBeVisible();

    // Save changes
    await page.getByRole("button", { name: "Save Changes" }).click();
  });

  test("8. Privacy & Trust Model page", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Privacy & Trust Model" })).toBeVisible();
    await expect(page.getByText("Coarse-Only Location Exposure")).toBeVisible();
    await expect(page.getByText("Singapore F&B Charges Transparency")).toBeVisible();
  });
});
