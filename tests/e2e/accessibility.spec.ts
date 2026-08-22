import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoSeriousA11yViolations(page: Page, routeName: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );

  expect(
    seriousOrCritical,
    `${routeName} has serious/critical accessibility violations:\n${seriousOrCritical
      .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`)
      .join("\n")}`,
  ).toEqual([]);
}

async function openAndAudit(page: Page, path: string, routeName: string, readyText?: string | RegExp) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  if (readyText) await expect(page.getByText(readyText).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page, routeName);
}

test.describe("Accessibility contract", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("audits home, create, lobby, voting, confirmation, profile, and join routes", async ({ page }) => {
    await openAndAudit(page, "/", "home", "Active plans");
    await openAndAudit(page, "/plans/new", "create", "Plan a Hangout");

    const lobbyResponse = await page.request.post("/api/v1/plans", {
      data: {
        mealType: "brunch",
        date: "2026-09-15",
        windowStart: "11:30",
        windowEnd: "13:30",
        groupBudgetCents: 16000,
        alcoholMode: "excluded",
        fairnessMode: "equal_journeys",
        companionIds: ["user_ethan"],
      },
    });
    expect(lobbyResponse.status(), "The accessibility journey must create a collecting lobby fixture").toBe(201);
    const lobbyPlanId = ((await lobbyResponse.json()).data as { planId: string }).planId;
    await openAndAudit(page, `/plans/${lobbyPlanId}`, "lobby", "Lobby & Readiness");

    await page.goto("/plans/plan_friday_dinner");
    await expect(page.locator("main")).toBeVisible();
    const votingHeading = page.getByRole("heading", { name: "Pick the places you'd enjoy" });
    await expect(votingHeading, "The accessibility journey must use the seeded voting fixture").toBeVisible();
    await expectNoSeriousA11yViolations(page, "voting");
    const confirmTrigger = page.getByRole("button", { name: "Confirm venue and time" });
    await expect(confirmTrigger, "The seeded voting fixture must expose organizer confirmation").toBeVisible();
    await confirmTrigger.click();
    await expect(page.getByRole("dialog", { name: "Confirm Final Dining Choice" })).toBeVisible();
    await expectNoSeriousA11yViolations(page, "confirm dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(confirmTrigger).toBeFocused();

    await openAndAudit(page, "/plans/plan_trio_celebration", "confirmed");
    const feedbackTrigger = page.getByRole("button", { name: "Rate Meal" });
    await feedbackTrigger.click();
    await expect(page.getByRole("dialog", { name: "How was Hangtime?" })).toBeVisible();
    await expectNoSeriousA11yViolations(page, "feedback dialog");

    await openAndAudit(page, "/profile", "profile", "Profile & Preferences");
    await openAndAudit(page, "/join/accessibility-invalid-token", "join", "Invitation unavailable");
  });

  test("keeps primary controls keyboard-complete", async ({ page }) => {
    await page.goto("/plans/new");
    const companion = page.getByRole("button", { name: /Ethan Tan/ });
    await companion.focus();
    await page.keyboard.press("Space");
    await expect(companion).toHaveAttribute("aria-pressed", "true");

    const fairness = page.getByRole("radio", { name: /Fastest Group Trip/ });
    await fairness.focus();
    await page.keyboard.press("Space");
    await expect(fairness).toBeChecked();

    await page.goto("/plans/plan_friday_dinner");
    await expect(page.getByRole("heading", { name: "Pick the places you'd enjoy" })).toBeVisible();
    const ballotChoice = page.getByRole("button", { name: /Add .* to your ballot/ }).first();
    const ballotChoiceLabel = await ballotChoice.getAttribute("aria-label");
    expect(ballotChoiceLabel).toMatch(/^Add .+ to your ballot$/);
    await ballotChoice.focus();
    await ballotChoice.press("Space");
    const selectedBallotChoiceLabel = ballotChoiceLabel!.replace(/^Add (.+) to your ballot$/, "Remove $1 from your ballot");
    await expect(page.getByRole("button", { name: selectedBallotChoiceLabel })).toHaveAttribute("aria-pressed", "true");

    const confirmTrigger = page.getByRole("button", { name: "Confirm venue and time" });
    await confirmTrigger.focus();
    await page.keyboard.press("Enter");
    const venueRadio = page.getByRole("radio").first();
    const secondVenueRadio = page.getByRole("radio").nth(1);
    await venueRadio.focus();
    await page.keyboard.press("ArrowDown");
    await expect(secondVenueRadio).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(confirmTrigger).toBeFocused();
  });

  test("keeps the ballot action above mobile navigation at narrow widths", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile collision assertion");

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/plans/plan_friday_dinner");
      await expect(page.getByRole("heading", { name: "Pick the places you'd enjoy" })).toBeVisible();

      const layout = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(layout.viewportWidth);
      await expectNoSeriousA11yViolations(page, `voting at ${width}px`);

      const action = await page.getByRole("region", { name: "Ballot submission" }).boundingBox();
      const navigation = await page.getByRole("navigation", { name: "Mobile navigation" }).boundingBox();
      expect(action).not.toBeNull();
      expect(navigation).not.toBeNull();
      expect(action!.y + action!.height, `ballot action overlaps navigation at ${width}px`).toBeLessThanOrEqual(navigation!.y + 1);
    }
  });
});
