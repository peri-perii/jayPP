import test from "node:test";
import assert from "node:assert/strict";

const {
  detectStatusTransitions,
  formatTransitionNotification,
  loadNotificationSettings,
  saveNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SETTINGS_KEY,
} = await import("../src/lib/notifications.ts");

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

test("detectStatusTransitions initializes baseline on first run without triggering spurious transitions", () => {
  const current = [
    { code: "18B11CI611", name: "Computer Networks", percentage: 65, status: "below", goal: 75 },
    { code: "18B11CI612", name: "Compiler Design", percentage: 80, status: "on_track", goal: 75 },
  ];

  const result = detectStatusTransitions(current, null);
  assert.equal(result.isFirstRun, true);
  assert.equal(result.transitions.length, 0);
  assert.equal(result.nextStatusMap["18B11CI611"], "below");
  assert.equal(result.nextStatusMap["18B11CI612"], "on_track");
});

test("detectStatusTransitions detects when a subject transitions from on_track to below", () => {
  const previousMap = {
    "18B11CI611": "on_track",
    "18B11CI612": "on_track",
  };

  const current = [
    { code: "18B11CI611", name: "Computer Networks", percentage: 72, status: "below", goal: 75 },
    { code: "18B11CI612", name: "Compiler Design", percentage: 85, status: "on_track", goal: 75 },
  ];

  const result = detectStatusTransitions(current, previousMap);
  assert.equal(result.isFirstRun, false);
  assert.equal(result.transitions.length, 1);
  assert.equal(result.transitions[0].code, "18B11CI611");
  assert.equal(result.transitions[0].name, "Computer Networks");
  assert.equal(result.transitions[0].percentage, 72);
  assert.equal(result.transitions[0].goal, 75);
  assert.equal(result.nextStatusMap["18B11CI611"], "below");
});

test("detectStatusTransitions does not notify if a subject stays below goal across syncs", () => {
  const previousMap = {
    "18B11CI611": "below",
    "18B11CI612": "on_track",
  };

  const current = [
    { code: "18B11CI611", name: "Computer Networks", percentage: 68, status: "below", goal: 75 },
    { code: "18B11CI612", name: "Compiler Design", percentage: 82, status: "on_track", goal: 75 },
  ];

  const result = detectStatusTransitions(current, previousMap);
  assert.equal(result.isFirstRun, false);
  assert.equal(result.transitions.length, 0);
});

test("detectStatusTransitions does not notify when attendance improves from below to on_track", () => {
  const previousMap = {
    "18B11CI611": "below",
  };

  const current = [
    { code: "18B11CI611", name: "Computer Networks", percentage: 76, status: "on_track", goal: 75 },
  ];

  const result = detectStatusTransitions(current, previousMap);
  assert.equal(result.isFirstRun, false);
  assert.equal(result.transitions.length, 0);
  assert.equal(result.nextStatusMap["18B11CI611"], "on_track");
});

test("detectStatusTransitions detects multiple subjects transitioning below goal", () => {
  const previousMap = {
    "18B11CI611": "on_track",
    "18B11CI612": "close",
    "18B11CI613": "on_track",
  };

  const current = [
    { code: "18B11CI611", name: "Computer Networks", percentage: 70, status: "below", goal: 75 },
    { code: "18B11CI612", name: "Compiler Design", percentage: 71, status: "below", goal: 75 },
    { code: "18B11CI613", name: "Software Engineering", percentage: 88, status: "on_track", goal: 75 },
  ];

  const result = detectStatusTransitions(current, previousMap);
  assert.equal(result.transitions.length, 2);
  const codes = result.transitions.map((t) => t.code);
  assert.ok(codes.includes("18B11CI611"));
  assert.ok(codes.includes("18B11CI612"));
});

test("formatTransitionNotification formats single subject alert correctly", () => {
  const single = [
    { code: "18B11CI611", name: "Computer Networks", percentage: 73.3, goal: 75 },
  ];

  const formatted = formatTransitionNotification(single);
  assert.equal(formatted.title, "Attendance Alert: Computer Networks");
  assert.ok(formatted.body.includes("73.3%"));
  assert.ok(formatted.body.includes("75%"));
});

test("formatTransitionNotification formats multi-subject batch alert correctly", () => {
  const multiple = [
    { code: "18B11CI611", name: "Computer Networks", percentage: 73.3, goal: 75 },
    { code: "18B11CI612", name: "Compiler Design", percentage: 69.5, goal: 75 },
  ];

  const formatted = formatTransitionNotification(multiple);
  assert.equal(formatted.title, "Attendance Alert: 2 subjects below goal");
  assert.ok(formatted.body.includes("Computer Networks (73.3%)"));
  assert.ok(formatted.body.includes("Compiler Design (69.5%)"));
});

test("notification settings load defaults and persist correctly", () => {
  const original = globalThis.localStorage;
  const mock = new MockStorage();
  globalThis.localStorage = mock;

  try {
    const initial = loadNotificationSettings();
    assert.deepEqual(initial, DEFAULT_NOTIFICATION_SETTINGS);

    const updated = {
      enabled: true,
      dailyReminderEnabled: true,
      dailyReminderTime: "21:30",
    };

    saveNotificationSettings(updated);
    const loaded = loadNotificationSettings();
    assert.deepEqual(loaded, updated);

    mock.setItem(NOTIFICATION_SETTINGS_KEY, "invalid-json{");
    const fallback = loadNotificationSettings();
    assert.deepEqual(fallback, DEFAULT_NOTIFICATION_SETTINGS);
  } finally {
    globalThis.localStorage = original;
  }
});
