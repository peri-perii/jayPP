import { DEFAULT_ATTENDANCE_GOAL } from "./attendance.ts";

export const GOALS_STORAGE_KEY = "juet.attendance.goals";
export const GOALS_CHANGED_EVENT = "juet:goals-changed";

export interface AttendanceGoalsConfig {
  defaultGoal: number;
  overrides: Record<string, number>;
}

export function sanitizeGoal(val: unknown, fallback: number = DEFAULT_ATTENDANCE_GOAL): number {
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(50, Math.round(n)));
}

export function loadGoalsConfig(): AttendanceGoalsConfig {
  try {
    const raw = localStorage.getItem(GOALS_STORAGE_KEY);
    if (!raw) {
      return { defaultGoal: DEFAULT_ATTENDANCE_GOAL, overrides: {} };
    }
    const parsed = JSON.parse(raw);
    const defaultGoal = sanitizeGoal(parsed?.defaultGoal, DEFAULT_ATTENDANCE_GOAL);
    const overrides: Record<string, number> = {};

    if (parsed?.overrides && typeof parsed.overrides === "object") {
      for (const [code, goal] of Object.entries(parsed.overrides)) {
        if (code && typeof code === "string") {
          overrides[code.trim()] = sanitizeGoal(goal, defaultGoal);
        }
      }
    }

    return { defaultGoal, overrides };
  } catch {
    return { defaultGoal: DEFAULT_ATTENDANCE_GOAL, overrides: {} };
  }
}

export function saveGoalsConfig(config: AttendanceGoalsConfig): void {
  try {
    const cleanConfig: AttendanceGoalsConfig = {
      defaultGoal: sanitizeGoal(config.defaultGoal, DEFAULT_ATTENDANCE_GOAL),
      overrides: {},
    };
    for (const [code, goal] of Object.entries(config.overrides || {})) {
      if (code) {
        cleanConfig.overrides[code.trim()] = sanitizeGoal(goal, cleanConfig.defaultGoal);
      }
    }
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(cleanConfig));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(GOALS_CHANGED_EVENT, { detail: cleanConfig }));
    }
  } catch {}
}

export function getSubjectGoal(
  subjectCode: string,
  config: AttendanceGoalsConfig = loadGoalsConfig()
): number {
  const trimmed = subjectCode.trim();
  if (trimmed && config.overrides[trimmed] !== undefined) {
    return config.overrides[trimmed];
  }
  return config.defaultGoal;
}

export function setDefaultGoal(goal: number): void {
  const config = loadGoalsConfig();
  config.defaultGoal = sanitizeGoal(goal);
  saveGoalsConfig(config);
}

export function setSubjectGoal(subjectCode: string, goal: number): void {
  const trimmed = subjectCode.trim();
  if (!trimmed) return;
  const config = loadGoalsConfig();
  config.overrides[trimmed] = sanitizeGoal(goal, config.defaultGoal);
  saveGoalsConfig(config);
}

export function resetSubjectGoal(subjectCode: string): void {
  const trimmed = subjectCode.trim();
  if (!trimmed) return;
  const config = loadGoalsConfig();
  if (config.overrides[trimmed] !== undefined) {
    delete config.overrides[trimmed];
    saveGoalsConfig(config);
  }
}

export function resetAllSubjectGoals(): void {
  const config = loadGoalsConfig();
  config.overrides = {};
  saveGoalsConfig(config);
}

export function subscribeGoals(callback: (config: AttendanceGoalsConfig) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustom = (e: Event) => {
    const detail = (e as CustomEvent<AttendanceGoalsConfig>).detail;
    callback(detail || loadGoalsConfig());
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === GOALS_STORAGE_KEY) {
      callback(loadGoalsConfig());
    }
  };

  window.addEventListener(GOALS_CHANGED_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(GOALS_CHANGED_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}
