/**
 * Normalizes student names from portal responses (often ALL CAPS) to clean Title Case.
 * Handles multiple words, hyphens, and apostrophes sensibly.
 * If the normalized name exceeds 28 characters, displays the first name only.
 * If the name is missing or empty, returns greeting "Welcome" with no comma and null displayName.
 */

export const WELCOME_HOLD_MS = 1600;
export const WELCOME_REDUCED_HOLD_MS = 900;
export const WELCOME_TRANSITION_MS = 450;
export const WELCOME_STAGGER_MS = 120;

function capitalizeSubtoken(sub: string): string {
  if (!sub) return "";
  if (sub.includes("'")) {
    return sub
      .split("'")
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
      .join("'");
  }
  if (sub.includes("’")) {
    return sub
      .split("’")
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
      .join("’");
  }
  return sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase();
}

function toTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.includes("-")) {
        return word.split("-").map(capitalizeSubtoken).join("-");
      }
      return capitalizeSubtoken(word);
    })
    .join(" ");
}

export interface FormattedStudentName {
  greeting: string;
  displayName: string | null;
  fullName: string | null;
}

export function formatStudentName(rawName?: string | null): FormattedStudentName {
  if (!rawName) {
    return {
      greeting: "Welcome",
      displayName: null,
      fullName: null,
    };
  }

  const trimmed = rawName.trim();
  if (!trimmed) {
    return {
      greeting: "Welcome",
      displayName: null,
      fullName: null,
    };
  }

  const titleCased = toTitleCase(trimmed);
  if (!titleCased) {
    return {
      greeting: "Welcome",
      displayName: null,
      fullName: null,
    };
  }

  // Max 28 characters threshold: show first name only if very long
  let displayName = titleCased;
  if (titleCased.length > 28) {
    const firstWord = titleCased.split(/[\s\-]+/)[0];
    displayName = firstWord || titleCased;
  }

  return {
    greeting: "Welcome,",
    displayName,
    fullName: titleCased,
  };
}
