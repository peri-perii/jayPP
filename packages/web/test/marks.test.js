import test from "node:test";
import assert from "node:assert/strict";

const {
  formatEventCode,
  formatEventDesc,
  calculateMarksSummary,
  isLowScore,
  LOW_SCORE_THRESHOLD,
} = await import("../src/lib/marks.ts");

test("formatEventCode converts test events to compact T/P format", () => {
  assert.equal(formatEventCode("TEST-1"), "T1");
  assert.equal(formatEventCode("TEST-2"), "T2");
  assert.equal(formatEventCode("TEST-3"), "T3");
  assert.equal(formatEventCode("TEST 1"), "T1");
  assert.equal(formatEventCode("test1"), "T1");
  assert.equal(formatEventCode("P-1"), "P1");
  assert.equal(formatEventCode("P-2"), "P2");
  assert.equal(formatEventCode("p-3"), "P3");
  assert.equal(formatEventCode("P 1"), "P1");
  assert.equal(formatEventCode("T-1"), "T1");
  assert.equal(formatEventCode("T 1"), "T1");
  assert.equal(formatEventCode("PRAC-1"), "P1");
  assert.equal(formatEventCode(1), "1");
  assert.equal(formatEventCode(null), "");
  assert.equal(formatEventCode(""), "");
  assert.equal(formatEventCode(undefined), "");
  assert.equal(formatEventCode("MID-SEM"), "MID-SEM");
});

test("formatEventDesc formats event codes into descriptive names", () => {
  assert.equal(formatEventDesc("TEST-1"), "Test 1");
  assert.equal(formatEventDesc("T2"), "Test 2");
  assert.equal(formatEventDesc("P-1"), "Practical 1");
  assert.equal(formatEventDesc("PRAC-2"), "Practical 2");
  assert.equal(formatEventDesc("MID-SEM"), "MID-SEM");
  assert.equal(formatEventDesc(""), "");
});

test("calculateMarksSummary computes obtained, full, percentage, and subject count correctly", () => {
  const rows = [
    { subjectcode: "CS101", subjectdesc: "Computer Science", fullmarks: 15, obtainedmarks: 9 },
    { subjectcode: "CS102", subjectdesc: "Data Structures", fullmarks: 15, obtainedmarks: 12 },
    { subjectcode: "CS101", subjectdesc: "Computer Science", fullmarks: 25, obtainedmarks: 20 },
  ];
  const summary = calculateMarksSummary(rows);
  assert.equal(summary.totalObtained, 41);
  assert.equal(summary.totalFull, 55);
  assert.equal(summary.percentage, 74.5);
  assert.equal(summary.formattedPercentage, "74.5%");
  assert.equal(summary.subjectsCount, 2);
  assert.equal(summary.validRowsCount, 3);
});

test("calculateMarksSummary handles empty and invalid values gracefully", () => {
  const summary = calculateMarksSummary([]);
  assert.equal(summary.totalObtained, 0);
  assert.equal(summary.totalFull, 0);
  assert.equal(summary.percentage, null);
  assert.equal(summary.formattedPercentage, "—%");
  assert.equal(summary.subjectsCount, 0);
});

test("isLowScore identifies scores below configurable threshold (default 35%)", () => {
  assert.equal(isLowScore(34.9), true);
  assert.equal(isLowScore(35), false);
  assert.equal(isLowScore(75), false);
  assert.equal(isLowScore(null), false);
  assert.equal(isLowScore(30, 40), true);
  assert.equal(LOW_SCORE_THRESHOLD, 35);
});

