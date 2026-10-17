import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.js";

test.describe("Floating glass bottom navigation & 5 tabs", () => {
  test("renders 5 floating tabs and highlights Home on dashboard entry", async ({ page }) => {
    await openApp(page, { dashboard: true });

    const nav = page.getByRole("tablist", { name: "Main navigation" });
    await expect(nav).toBeVisible();

    const homeTab = page.getByRole("tab", { name: "Home" });
    const timetableTab = page.getByRole("tab", { name: "Timetable" });
    const calendarTab = page.getByRole("tab", { name: "Calendar" });
    const resultsTab = page.getByRole("tab", { name: "Results" });
    const moreTab = page.getByRole("tab", { name: "More" });

    await expect(homeTab).toBeVisible();
    await expect(timetableTab).toBeVisible();
    await expect(calendarTab).toBeVisible();
    await expect(resultsTab).toBeVisible();
    await expect(moreTab).toBeVisible();

    await expect(homeTab).toHaveAttribute("aria-current", "page");
    await expect(homeTab).toHaveClass(/active/);
    await expect(homeTab.locator(".btm-nav-label")).toHaveText("Home");
  });

  test("switches between all 5 tabs and updates active indicator and URL hash", async ({ page }) => {
    await openApp(page, { dashboard: true });

    const timetableTab = page.getByRole("tab", { name: "Timetable" });
    await timetableTab.click();
    await expect(page).toHaveURL(/#timetable/);
    await expect(timetableTab).toHaveAttribute("aria-current", "page");
    await expect(timetableTab.locator(".btm-nav-label")).toHaveText("Timetable");

    const calendarTab = page.getByRole("tab", { name: "Calendar" });
    await calendarTab.click();
    await expect(page).toHaveURL(/#calendar/);
    await expect(calendarTab).toHaveAttribute("aria-current", "page");
    await expect(calendarTab.locator(".btm-nav-label")).toHaveText("Calendar");

    const resultsTab = page.getByRole("tab", { name: "Results" });
    await resultsTab.click();
    await expect(page).toHaveURL(/#results/);
    await expect(resultsTab).toHaveAttribute("aria-current", "page");
    await expect(resultsTab.locator(".btm-nav-label")).toHaveText("Results");

    const moreTab = page.getByRole("tab", { name: "More" });
    await moreTab.click();
    await expect(page).toHaveURL(/#more/);
    await expect(moreTab).toHaveAttribute("aria-current", "page");
    await expect(moreTab.locator(".btm-nav-label")).toHaveText("More");

    const homeTab = page.getByRole("tab", { name: "Home" });
    await homeTab.click();
    await expect(page).toHaveURL(/#home/);
    await expect(homeTab).toHaveAttribute("aria-current", "page");
  });

  test("all 5 tabs fit at 360px without crowding or horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openApp(page, { dashboard: true });

    const nav = page.getByRole("tablist", { name: "Main navigation" });
    await expect(nav).toBeVisible();

    const tabs = nav.getByRole("tab");
    await expect(tabs).toHaveCount(5);

    for (let i = 0; i < 5; i++) {
      const box = await tabs.nth(i).boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(48);
      }
    }

    const hasOverflow = await page.evaluate(() => {
      const navEl = document.querySelector(".btm-nav");
      return navEl ? navEl.scrollWidth > navEl.clientWidth : false;
    });
    expect(hasOverflow).toBe(false);
  });

  test("Home is attendance-first and tapping a subject opens bottom sheet which closes on back", async ({ page }) => {
    await openApp(page, { dashboard: true });

    const summaryBlock = page.locator(".attendance-summary-block");
    await expect(summaryBlock).toBeVisible();

    const subjectRows = page.locator(".attendance-subject-row");
    const count = await subjectRows.count();
    if (count > 0) {
      const firstRow = subjectRows.first();
      await firstRow.click();

      const sheet = page.locator(".bottom-sheet-modal");
      await expect(sheet).toBeVisible();

      await page.goBack();
      await expect(sheet).not.toBeVisible();
    }
  });

  test("desktop layout switches to compact sidebar on screens >= 1024px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page, { dashboard: true });

    const nav = page.getByRole("tablist", { name: "Main navigation" });
    await expect(nav).toBeVisible();

    const boundingBox = await nav.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      expect(boundingBox.x).toBeLessThanOrEqual(5);
      expect(boundingBox.width).toBeLessThanOrEqual(80);
    }
  });
});
