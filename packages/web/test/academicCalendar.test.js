import test from "node:test";
import assert from "node:assert/strict";

const {
  parseLocalDate,
  formatLocalDateIso,
  isDateInRange,
  getDaysDifference,
  formatDisplayRange,
  getEventStatus,
  getHighlightsStatus,
  getActiveCalendar,
  getMonthCalendarCells,
  getNextUpcomingExam,
} = await import("../src/lib/academicCalendar.ts");

test("parseLocalDate and formatLocalDateIso round-trip local dates without UTC timezone shift", () => {
  const d = parseLocalDate("2026-10-12");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 12);
  assert.equal(formatLocalDateIso(d), "2026-10-12");
});

test("isDateInRange handles inclusive boundaries properly", () => {
  assert.equal(isDateInRange("2026-08-23", "2026-08-24", "2026-08-29"), false);
  assert.equal(isDateInRange("2026-08-24", "2026-08-24", "2026-08-29"), true);
  assert.equal(isDateInRange("2026-08-26", "2026-08-24", "2026-08-29"), true);
  assert.equal(isDateInRange("2026-08-29", "2026-08-24", "2026-08-29"), true);
  assert.equal(isDateInRange("2026-08-30", "2026-08-24", "2026-08-29"), false);
});

test("isDateInRange handles single-day and open-ended events", () => {
  assert.equal(isDateInRange("2026-07-14", "2026-07-14"), true);
  assert.equal(isDateInRange("2026-07-15", "2026-07-14"), false);

  assert.equal(isDateInRange("2026-07-27", "2026-07-28", undefined, true), false);
  assert.equal(isDateInRange("2026-07-28", "2026-07-28", undefined, true), true);
  assert.equal(isDateInRange("2026-08-15", "2026-07-28", undefined, true), true);
});

test("getDaysDifference calculates exact day distance", () => {
  assert.equal(getDaysDifference("2026-10-12", "2026-10-12"), 0);
  assert.equal(getDaysDifference("2026-10-12", "2026-10-13"), 1);
  assert.equal(getDaysDifference("2026-10-12", "2026-10-17"), 5);
  assert.equal(getDaysDifference("2026-10-17", "2026-10-12"), -5);
});

test("formatDisplayRange formats single day, same month range, cross month range, and open-ended", () => {
  assert.equal(formatDisplayRange("2026-07-14"), "14 Jul 2026");
  assert.equal(formatDisplayRange("2026-08-24", "2026-08-29"), "24 – 29 Aug 2026");
  assert.equal(formatDisplayRange("2026-11-30", "2026-12-05"), "30 Nov – 5 Dec 2026");
  assert.equal(formatDisplayRange("2026-07-28", undefined, true), "28 Jul 2026 onwards");
});

test("getEventStatus calculates ongoing, today, upcoming and concluded states", () => {
  const multiDayEvent = {
    id: "t2",
    title: "Test 2 (T-2)",
    start: "2026-10-12",
    end: "2026-10-17",
    type: "exam",
    audience: "student",
  };

  const before = getEventStatus(multiDayEvent, "2026-10-11");
  assert.equal(before.state, "upcoming");
  assert.equal(before.label, "Tomorrow");
  assert.equal(before.isPast, false);

  const start = getEventStatus(multiDayEvent, "2026-10-12");
  assert.equal(start.state, "ongoing");
  assert.equal(start.label, "Ends in 5 days");
  assert.equal(start.isPast, false);

  const lastDay = getEventStatus(multiDayEvent, "2026-10-17");
  assert.equal(lastDay.state, "ongoing");
  assert.equal(lastDay.label, "Ends today");
  assert.equal(lastDay.isPast, false);

  const after = getEventStatus(multiDayEvent, "2026-10-18");
  assert.equal(after.state, "past");
  assert.equal(after.label, "Done");
  assert.equal(after.isPast, true);

  const singleDay = {
    id: "gandhi",
    title: "Mahatma Gandhi Jayanti",
    start: "2026-10-02",
    type: "holiday",
    audience: "all",
  };
  const todayMatch = getEventStatus(singleDay, "2026-10-02");
  assert.equal(todayMatch.state, "today");
  assert.equal(todayMatch.label, "Today");

  const singleUpcoming = getEventStatus(singleDay, "2026-09-28");
  assert.equal(singleUpcoming.state, "upcoming");
  assert.equal(singleUpcoming.label, "In 4 days");
});

test("getHighlightsStatus computes contextual text for ongoing and upcoming events", () => {
  const events = [
    { id: "t2", title: "Test 2 (T-2)", start: "2026-10-12", end: "2026-10-17", type: "exam", audience: "student" },
    { id: "h-dussehra", title: "Dussehra", start: "2026-10-20", type: "holiday", audience: "all" },
  ];

  const duringExam = getHighlightsStatus(events, "2026-10-16");
  assert.equal(duringExam, "Test 2 (T-2) is ongoing (ends in 1 day)");

  const examLastDay = getHighlightsStatus(events, "2026-10-17");
  assert.equal(examLastDay, "Test 2 (T-2) is ongoing (ends today)");

  const betweenEvents = getHighlightsStatus(events, "2026-10-18");
  assert.equal(betweenEvents, "Next: Dussehra in 2 days");

  const holidayEve = getHighlightsStatus(events, "2026-10-19");
  assert.equal(holidayEve, "Next: Dussehra tomorrow");

  const holidayToday = getHighlightsStatus(events, "2026-10-20");
  assert.equal(holidayToday, "Today: Dussehra");

  const afterAll = getHighlightsStatus(events, "2026-10-25");
  assert.equal(afterAll, "Semester events concluded");
});

test("getActiveCalendar returns the registered academic term", () => {
  const term = getActiveCalendar("2026-10-16");
  assert.ok(term);
  assert.equal(term.term, "Odd Sem 2026");
  assert.equal(term.academicYear, "2026-27");
  assert.ok(term.events.length >= 40);
});

test("getMonthCalendarCells constructs a valid 7-column grid aligning Mondays and Sundays", () => {
  const term = getActiveCalendar("2026-10-16");
  const cells = getMonthCalendarCells(2026, 9, term.events, "2026-10-16");

  assert.equal(cells.length % 7, 0);

  const oct12 = cells.find((c) => c.dateIso === "2026-10-12");
  assert.ok(oct12);
  assert.equal(oct12.isCurrentMonth, true);
  assert.equal(oct12.dayNumber, 12);
  assert.ok(oct12.events.some((e) => e.id === "t2"));

  const oct16 = cells.find((c) => c.dateIso === "2026-10-16");
  assert.ok(oct16);
  assert.equal(oct16.isToday, true);

  const oct18 = cells.find((c) => c.dateIso === "2026-10-18");
  assert.ok(oct18);
  assert.equal(oct18.isSunday, true);
});

test("getNextUpcomingExam returns earliest exam on or after reference date", () => {
  const term = getActiveCalendar("2026-10-16");
  const nextExam = getNextUpcomingExam(term.events, "2026-10-16");
  assert.ok(nextExam);
  assert.equal(nextExam.id, "t2");

  const afterT2 = getNextUpcomingExam(term.events, "2026-10-18");
  assert.ok(afterT2);
  assert.equal(afterT2.id, "makeup");
});
