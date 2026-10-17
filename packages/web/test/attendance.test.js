import test from "node:test";
import assert from "node:assert/strict";

const {
  extractSubjectCode,
  extractSubjectName,
  classesNeededToReachGoal,
  classesAllowedToSkip,
  calculateAttendanceStatus,
  sortSubjectsByAttendance,
  computeOverallAttendance,
  DEFAULT_ATTENDANCE_GOAL,
  CLOSE_THRESHOLD_PERCENT,
} = await import("../src/lib/attendance.ts");

const {
  loadGoalsConfig,
  saveGoalsConfig,
  getSubjectGoal,
  setDefaultGoal,
  setSubjectGoal,
  resetSubjectGoal,
  resetAllSubjectGoals,
  sanitizeGoal,
  GOALS_STORAGE_KEY,
} = await import("../src/lib/attendanceGoals.ts");

class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) ?? null;
  }
  setItem(key, val) {
    this.store.set(key, String(val));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

test("extractSubjectCode extracts stable course code from diverse inputs", () => {
  assert.equal(extractSubjectCode("COMPUTER NETWORKS(18B11CI611)"), "18B11CI611");
  assert.equal(extractSubjectCode("OPERATING SYSTEMS LAB (18B17CI572)"), "18B17CI572");
  assert.equal(extractSubjectCode("18B11CI611"), "18B11CI611");
  assert.equal(extractSubjectCode(""), "");
  assert.equal(extractSubjectCode(null), "");
  assert.equal(extractSubjectCode(undefined), "");
});

test("extractSubjectName extracts human readable title", () => {
  assert.equal(extractSubjectName("COMPUTER NETWORKS(18B11CI611)"), "Computer Networks");
  assert.equal(extractSubjectName("DATA STRUCTURES LAB (18B17CI171)"), "Data Structures Lab");
  assert.equal(extractSubjectName(""), "");
  assert.equal(extractSubjectName(null), "");
});

test("guard when conducted classes c = 0", () => {
  const res = calculateAttendanceStatus(0, 0, 75);
  assert.equal(res.percentage, null);
  assert.equal(res.formattedPercentage, "—");
  assert.equal(res.status, "no_classes");
  assert.equal(res.statusLabel, "No classes");
  assert.equal(res.actionText, "No classes yet");
  assert.equal(res.classesNeeded, null);
  assert.equal(res.classesCanSkip, null);

  assert.equal(classesNeededToReachGoal(0, 0, 0.75), null);
  assert.equal(classesAllowedToSkip(0, 0, 0.75), 0);
});

test("when attended equals conducted (a = c, 100% attendance)", () => {
  const res = calculateAttendanceStatus(20, 20, 75);
  assert.equal(res.percentage, 100.0);
  assert.equal(res.formattedPercentage, "100.0%");
  assert.equal(res.status, "on_track");
  assert.equal(res.statusLabel, "On track");
  assert.equal(res.classesNeeded, 0);
  assert.equal(res.classesCanSkip, 6);
  assert.equal(res.actionText, "Can skip 6 classes");

  const skipExact = classesAllowedToSkip(20, 20, 0.75);
  assert.equal(skipExact, 6);
});

test("when goal is 100% (g = 1.0)", () => {
  const perfect = calculateAttendanceStatus(10, 10, 100);
  assert.equal(perfect.percentage, 100.0);
  assert.equal(perfect.status, "close");
  assert.equal(perfect.classesCanSkip, 0);
  assert.equal(perfect.actionText, "On track");

  const missedOne = calculateAttendanceStatus(9, 10, 100);
  assert.equal(missedOne.percentage, 90.0);
  assert.equal(missedOne.status, "below");
  assert.equal(missedOne.statusLabel, "Below goal");
  assert.equal(missedOne.actionText, "Goal not reachable if any class is missed");
  assert.equal(missedOne.classesNeeded, null);
  assert.equal(missedOne.classesCanSkip, 0);

  assert.equal(classesNeededToReachGoal(9, 10, 1.0), null);
});

test("exact boundary condition a/c = g", () => {
  const boundary = calculateAttendanceStatus(15, 20, 75);
  assert.equal(boundary.percentage, 75.0);
  assert.equal(boundary.status, "close");
  assert.equal(boundary.statusLabel, "Close");
  assert.equal(boundary.classesNeeded, 0);
  assert.equal(boundary.classesCanSkip, 0);
  assert.equal(boundary.actionText, "On track");
  assert.equal(classesAllowedToSkip(15, 20, 0.75), 0);
  assert.equal(classesNeededToReachGoal(15, 20, 0.75), 0);
});

test("close threshold evaluation within 3 percentage points above goal", () => {
  const rightOnThreshold = calculateAttendanceStatus(78, 100, 75);
  assert.equal(rightOnThreshold.percentage, 78.0);
  assert.equal(rightOnThreshold.status, "close");
  assert.equal(rightOnThreshold.statusLabel, "Close");

  const justAboveThreshold = calculateAttendanceStatus(79, 100, 75);
  assert.equal(justAboveThreshold.percentage, 79.0);
  assert.equal(justAboveThreshold.status, "on_track");
  assert.equal(justAboveThreshold.statusLabel, "On track");

  const justBelowGoal = calculateAttendanceStatus(74, 100, 75);
  assert.equal(justBelowGoal.percentage, 74.0);
  assert.equal(justBelowGoal.status, "below");
  assert.equal(justBelowGoal.statusLabel, "Below goal");
});

test("classes needed ceiling formula and rounding verification", () => {
  const n = classesNeededToReachGoal(17, 25, 0.75);
  assert.equal(n, 7);

  const res = calculateAttendanceStatus(17, 25, 75);
  assert.equal(res.status, "below");
  assert.equal(res.classesNeeded, 7);
  assert.equal(res.actionText, "Attend next 7 classes to reach 75%");

  const singleClass = calculateAttendanceStatus(14, 19, 75);
  assert.equal(singleClass.classesNeeded, 1);
  assert.equal(singleClass.actionText, "Attend next 1 class to reach 75%");

  const singleSkip = calculateAttendanceStatus(16, 20, 75);
  assert.equal(singleSkip.classesCanSkip, 1);
  assert.equal(singleSkip.actionText, "Can skip 1 class");
});

test("stable sorting lowest attendance first with tie breaking by name", () => {
  const list = [
    { attended: 18, conducted: 20, name: "Physics" },
    { attended: 10, conducted: 20, name: "Chemistry" },
    { attended: 14, conducted: 20, name: "Mathematics" },
    { attended: 0, conducted: 0, name: "Zero Course B" },
    { attended: 10, conducted: 20, name: "Biology" },
    { attended: 0, conducted: 0, name: "Zero Course A" },
  ];

  const sorted = sortSubjectsByAttendance(list);

  assert.equal(sorted[0].name, "Biology");
  assert.equal(sorted[1].name, "Chemistry");
  assert.equal(sorted[2].name, "Mathematics");
  assert.equal(sorted[3].name, "Physics");
  assert.equal(sorted[4].name, "Zero Course A");
  assert.equal(sorted[5].name, "Zero Course B");
});

test("overall attendance summary calculation and status sentence", () => {
  const subjects = [
    { attended: 12, conducted: 20, goal: 75 },
    { attended: 15, conducted: 20, goal: 75 },
    { attended: 19, conducted: 20, goal: 75 },
    { attended: 0, conducted: 0, goal: 75 },
  ];

  const summary = computeOverallAttendance(subjects);
  assert.equal(summary.totalAttended, 46);
  assert.equal(summary.totalConducted, 60);
  assert.equal(summary.percentage, 76.7);
  assert.equal(summary.formattedPercentage, "76.7%");
  assert.equal(summary.belowGoalCount, 1);
  assert.equal(summary.closeCount, 1);
  assert.equal(summary.onTrackCount, 1);
  assert.equal(summary.noClassesCount, 1);
  assert.equal(summary.statusSentence, "1 subject below goal");

  const allGood = [
    { attended: 18, conducted: 20, goal: 75 },
    { attended: 19, conducted: 20, goal: 75 },
  ];
  const goodSummary = computeOverallAttendance(allGood);
  assert.equal(goodSummary.belowGoalCount, 0);
  assert.equal(goodSummary.statusSentence, "All subjects on track");

  const emptySummary = computeOverallAttendance([{ attended: 0, conducted: 0, goal: 75 }]);
  assert.equal(emptySummary.percentage, null);
  assert.equal(emptySummary.formattedPercentage, "—");
  assert.equal(emptySummary.statusSentence, "No classes conducted yet");
});

test("attendance goals storage and override management", () => {
  const origStorage = globalThis.localStorage;
  const mock = new MockStorage();
  globalThis.localStorage = mock;

  try {
    assert.equal(sanitizeGoal(75), 75);
    assert.equal(sanitizeGoal(120), 100);
    assert.equal(sanitizeGoal(40), 50);
    assert.equal(sanitizeGoal("invalid", 75), 75);

    const initial = loadGoalsConfig();
    assert.equal(initial.defaultGoal, DEFAULT_ATTENDANCE_GOAL);
    assert.deepEqual(initial.overrides, {});

    setDefaultGoal(80);
    assert.equal(loadGoalsConfig().defaultGoal, 80);

    setSubjectGoal("18B11CI611", 85);
    setSubjectGoal("18B17CI572", 70);

    const updated = loadGoalsConfig();
    assert.equal(updated.overrides["18B11CI611"], 85);
    assert.equal(updated.overrides["18B17CI572"], 70);

    assert.equal(getSubjectGoal("18B11CI611"), 85);
    assert.equal(getSubjectGoal("OTHER123"), 80);

    resetSubjectGoal("18B11CI611");
    assert.equal(getSubjectGoal("18B11CI611"), 80);

    resetAllSubjectGoals();
    assert.deepEqual(loadGoalsConfig().overrides, {});
  } finally {
    globalThis.localStorage = origStorage;
  }
});
