import test from "node:test";
import assert from "node:assert/strict";

const {
  formatStudentName,
  WELCOME_HOLD_MS,
  WELCOME_REDUCED_HOLD_MS,
  WELCOME_TRANSITION_MS,
  WELCOME_STAGGER_MS,
} = await import("../src/lib/nameFormat.ts");

test("WelcomeScreen constants match iOS motion specification", () => {
  // Spec: Hold until about 1600ms total from t = 0, clamped between 1000 and 2000
  assert.equal(WELCOME_HOLD_MS, 1600, "WELCOME_HOLD_MS must be 1600ms");
  assert.ok(WELCOME_HOLD_MS >= 1000 && WELCOME_HOLD_MS <= 2000, "Hold must be clamped between 1000 and 2000");

  // Spec: Exit duration 450ms
  assert.equal(WELCOME_TRANSITION_MS, 450, "Exit transition duration must be 450ms");

  // Spec: Stagger about 120ms
  assert.equal(WELCOME_STAGGER_MS, 120, "Stagger must be 120ms");

  // Spec: Reduced motion hold about 900ms
  assert.equal(WELCOME_REDUCED_HOLD_MS, 900, "Reduced motion hold must be 900ms");
});

test("formatStudentName integration: full name, long name, and missing name", () => {
  // 1. Standard ALL CAPS name
  const student1 = formatStudentName("PRIYAM JAIN");
  assert.equal(student1.greeting, "Welcome,");
  assert.equal(student1.displayName, "Priyam Jain");

  // 2. Extra long student name (> 28 chars)
  const studentLong = formatStudentName("CHRISTOPHER ALEXANDER MONTGOMERY");
  assert.ok(studentLong.fullName.length > 28);
  assert.equal(studentLong.greeting, "Welcome,");
  assert.equal(studentLong.displayName, "Christopher");

  // 3. Missing or empty student name
  const studentMissing = formatStudentName(null);
  assert.equal(studentMissing.greeting, "Welcome");
  assert.equal(studentMissing.displayName, null);

  const studentEmpty = formatStudentName("   ");
  assert.equal(studentEmpty.greeting, "Welcome");
  assert.equal(studentEmpty.displayName, null);
});
