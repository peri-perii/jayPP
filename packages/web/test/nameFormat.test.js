import test from "node:test";
import assert from "node:assert/strict";

const { formatStudentName } = await import("../src/lib/nameFormat.ts");

test("formatStudentName: handles empty or missing name correctly", () => {
  assert.deepEqual(formatStudentName(null), {
    greeting: "Welcome",
    displayName: null,
    fullName: null,
  });

  assert.deepEqual(formatStudentName(undefined), {
    greeting: "Welcome",
    displayName: null,
    fullName: null,
  });

  assert.deepEqual(formatStudentName(""), {
    greeting: "Welcome",
    displayName: null,
    fullName: null,
  });

  assert.deepEqual(formatStudentName("    "), {
    greeting: "Welcome",
    displayName: null,
    fullName: null,
  });
});

test("formatStudentName: normalizes ALL CAPS to Title Case", () => {
  const result = formatStudentName("PRIYAM JAIN");
  assert.equal(result.greeting, "Welcome,");
  assert.equal(result.displayName, "Priyam Jain");
  assert.equal(result.fullName, "Priyam Jain");
});

test("formatStudentName: handles single-word name", () => {
  const result = formatStudentName("PRIYAM");
  assert.equal(result.greeting, "Welcome,");
  assert.equal(result.displayName, "Priyam");
});

test("formatStudentName: handles mixed case and whitespace", () => {
  const result = formatStudentName("   pRiYaM   jAiN   ");
  assert.equal(result.greeting, "Welcome,");
  assert.equal(result.displayName, "Priyam Jain");
});

test("formatStudentName: handles hyphens and apostrophes sensibly", () => {
  const hyphen = formatStudentName("MARY-JANE WATSON");
  assert.equal(hyphen.displayName, "Mary-Jane Watson");

  const apostrophe = formatStudentName("LIAM O'CONNOR");
  assert.equal(apostrophe.displayName, "Liam O'Connor");

  const curlyApostrophe = formatStudentName("NEIL D’SOUZA");
  assert.equal(curlyApostrophe.displayName, "Neil D’Souza");
});

test("formatStudentName: keeps full name when <= 28 characters", () => {
  // Exactly 28 chars: "Alexander Christopher Smith1"
  const name28 = "Alexander Christopher Smith1";
  assert.equal(name28.length, 28);
  const result = formatStudentName(name28);
  assert.equal(result.displayName, "Alexander Christopher Smith1");
});

test("formatStudentName: shows first name only when exceeding 28 characters", () => {
  const longName = "MUHAMMAD ABDULLAH BIN ABDULAZIZ AL-SAUD";
  assert.ok(longName.length > 28);
  const result = formatStudentName(longName);
  assert.equal(result.greeting, "Welcome,");
  assert.equal(result.displayName, "Muhammad");
  assert.equal(result.fullName, "Muhammad Abdullah Bin Abdulaziz Al-Saud");
});
