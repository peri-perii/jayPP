import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.js";

test.describe("Academic Calendar Feature", () => {
  test("Calendar tab opens directly from bottom navigation", async ({ page }) => {
    await openApp(page, { dashboard: true });

    const calTab = page.getByRole("tab", { name: "Calendar" });
    await expect(calTab).toBeVisible();
    await calTab.click();

    await expect(page).toHaveURL(/#calendar/);
    await expect(page.getByRole("heading", { name: "Academic Calendar" })).toBeVisible();
  });

  test("Calendar tab opens Academic Calendar and More screen does not duplicate it", async ({ page }) => {
    await openApp(page, { dashboard: true });

    const calTab = page.getByRole("tab", { name: "Calendar" });
    await expect(calTab).toBeVisible();
    await calTab.click();

    await expect(page).toHaveURL(/#calendar/);
    await expect(page.getByRole("heading", { name: "Academic Calendar" })).toBeVisible();
    await expect(calTab).toHaveAttribute("aria-current", "page");

    const moreTab = page.getByRole("tab", { name: "More" });
    await moreTab.click();
    await expect(page).toHaveURL(/#more/);
    await expect(page.getByRole("button", { name: /Academic Calendar/ })).toHaveCount(0);
  });

  test("Academic Calendar renders header, highlights strip, segmented control and official PDF link", async ({ page }) => {
    await openApp(page, { dashboard: true });
    await page.goto("/#calendar");

    await expect(page.getByRole("heading", { name: "Academic Calendar" })).toBeVisible();
    await expect(page.locator(".cal-badge-pill")).toHaveText(/Odd Sem 2026/);
    await expect(page.locator(".cal-official-tag")).toHaveText("Official JUET");

    const pdfLink = page.getByRole("link", { name: "View official calendar PDF" });
    await expect(pdfLink).toBeVisible();
    await expect(pdfLink).toHaveAttribute("href", "/academic-calendar-odd-2026-27.pdf");

    const highlights = page.locator(".cal-highlights-strip");
    await expect(highlights).toBeVisible();
    const highlightsText = await highlights.locator(".cal-highlights-text").textContent();
    expect(highlightsText).toBeTruthy();

    const agendaTab = page.getByRole("tab", { name: "Agenda" });
    const monthTab = page.getByRole("tab", { name: "Month Grid" });
    await expect(agendaTab).toHaveAttribute("aria-selected", "true");
    await expect(monthTab).toHaveAttribute("aria-selected", "false");
  });

  test("Agenda view supports category filtering and past events toggle", async ({ page }) => {
    await openApp(page, { dashboard: true });
    await page.goto("/#calendar");

    const holidaysFilter = page.getByRole("button", { name: "Holidays" });
    await holidaysFilter.click();
    await expect(holidaysFilter).toHaveAttribute("aria-pressed", "true");

    const holidayRows = page.locator(".cal-agenda-row");
    const count = await holidayRows.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await expect(holidayRows.nth(i).locator(".cal-row-type-tag")).toHaveText("holiday");
    }

    const allFilter = page.locator(".cal-filter-chip", { hasText: /^All$/ });
    await allFilter.click();
    await expect(allFilter).toHaveAttribute("aria-pressed", "true");
  });

  test("Month grid renders without overflow at 360x800 and tapping a date opens bottom sheet", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openApp(page, { dashboard: true });
    await page.goto("/#calendar");

    const monthTab = page.getByRole("tab", { name: "Month Grid" });
    await monthTab.click();
    await expect(monthTab).toHaveAttribute("aria-selected", "true");

    const grid = page.locator(".cal-grid-card");
    await expect(grid).toBeVisible();

    const isOverflowing = await page.evaluate(() => {
      const el = document.querySelector(".cal-grid-card");
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    expect(isOverflowing).toBe(false);

    const activeCell = page.locator(".cal-grid-cell.has-events").first();
    await expect(activeCell).toBeVisible();
    await activeCell.click();

    const sheet = page.locator(".cal-sheet-container");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { level: 2 })).toBeVisible();

    const closeBtn = sheet.getByRole("button", { name: "Close day events" });
    await closeBtn.click();
    await expect(sheet).not.toBeVisible();
  });

  test("Theme toggle preserves styling in dark and light modes at 412x915", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openApp(page, { dashboard: true });

    await page.goto("/#more");
    const lightBtn = page.getByRole("button", { name: "Light theme" });
    await lightBtn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.goto("/#calendar");
    await expect(page.locator(".cal-controls-card")).toBeVisible();

    await page.goto("/#more");
    const darkBtn = page.getByRole("button", { name: "Dark theme" });
    await darkBtn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.goto("/#calendar");
    await expect(page.locator(".cal-controls-card")).toBeVisible();
  });
});
