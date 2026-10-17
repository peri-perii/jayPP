export const CLOSE_THRESHOLD_PERCENT = 3;
export const DEFAULT_ATTENDANCE_GOAL = 75;

export type AttendanceGoalStatus = "below" | "close" | "on_track" | "no_classes";

export interface AttendanceStatusResult {
  attended: number;
  conducted: number;
  percentage: number | null;
  formattedPercentage: string;
  goal: number;
  status: AttendanceGoalStatus;
  statusLabel: string;
  actionText: string;
  classesNeeded: number | null;
  classesCanSkip: number | null;
}

export interface SubjectAttendanceItem {
  id: string;
  name: string;
  code: string;
  attended: number;
  conducted: number;
  goal: number;
  raw?: Record<string, unknown>;
}

export interface OverallAttendanceSummary {
  totalAttended: number;
  totalConducted: number;
  percentage: number | null;
  formattedPercentage: string;
  subjectsCount: number;
  belowGoalCount: number;
  closeCount: number;
  onTrackCount: number;
  noClassesCount: number;
  statusSentence: string;
}

export function extractSubjectCode(raw?: string | null): string {
  if (!raw) return "";
  const match = String(raw).match(/\(([^)]+)\)$/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return String(raw).trim();
}

export function extractSubjectName(raw?: string | null): string {
  if (!raw) return "";
  const str = String(raw).trim();
  const match = str.match(/^(.+?)\s*\([^)]+\)$/);
  const base = match && match[1] ? match[1].trim() : str;
  return base
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function classesNeededToReachGoal(
  attended: number,
  conducted: number,
  goalFraction: number
): number | null {
  if (conducted <= 0) return null;
  if (goalFraction >= 1) return null;
  if (attended / conducted >= goalFraction) return 0;
  const needed = Math.ceil((goalFraction * conducted - attended) / (1 - goalFraction));
  return Math.max(1, needed);
}

export function classesAllowedToSkip(
  attended: number,
  conducted: number,
  goalFraction: number
): number {
  if (conducted <= 0 || goalFraction <= 0) return 0;
  if (attended / conducted < goalFraction) return 0;
  const skippable = Math.floor(attended / goalFraction - conducted);
  return Math.max(0, skippable);
}

export function calculateAttendanceStatus(
  attended: number,
  conducted: number,
  goalPercentage: number = DEFAULT_ATTENDANCE_GOAL
): AttendanceStatusResult {
  const safeGoal = Math.min(100, Math.max(50, goalPercentage));
  const goalFraction = safeGoal / 100;

  if (conducted <= 0) {
    return {
      attended: 0,
      conducted: 0,
      percentage: null,
      formattedPercentage: "—",
      goal: safeGoal,
      status: "no_classes",
      statusLabel: "No classes",
      actionText: "No classes yet",
      classesNeeded: null,
      classesCanSkip: null,
    };
  }

  const rawRatio = attended / conducted;
  const pct = Number((rawRatio * 100).toFixed(1));
  const formattedPercentage = `${pct.toFixed(1)}%`;

  if (pct < safeGoal) {
    if (safeGoal >= 100) {
      return {
        attended,
        conducted,
        percentage: pct,
        formattedPercentage,
        goal: safeGoal,
        status: "below",
        statusLabel: "Below goal",
        actionText: "Goal not reachable if any class is missed",
        classesNeeded: null,
        classesCanSkip: 0,
      };
    }

    const needed = classesNeededToReachGoal(attended, conducted, goalFraction) ?? 1;
    const actionText = `Attend next ${needed} ${needed === 1 ? "class" : "classes"} to reach ${safeGoal}%`;

    return {
      attended,
      conducted,
      percentage: pct,
      formattedPercentage,
      goal: safeGoal,
      status: "below",
      statusLabel: "Below goal",
      actionText,
      classesNeeded: needed,
      classesCanSkip: 0,
    };
  }

  const skippable = classesAllowedToSkip(attended, conducted, goalFraction);
  const isClose = pct <= safeGoal + CLOSE_THRESHOLD_PERCENT;
  const status: AttendanceGoalStatus = isClose ? "close" : "on_track";
  const statusLabel = isClose ? "Close" : "On track";

  let actionText: string;
  if (skippable > 0) {
    actionText = `Can skip ${skippable} ${skippable === 1 ? "class" : "classes"}`;
  } else {
    actionText = "On track";
  }

  return {
    attended,
    conducted,
    percentage: pct,
    formattedPercentage,
    goal: safeGoal,
    status,
    statusLabel,
    actionText,
    classesNeeded: 0,
    classesCanSkip: skippable,
  };
}

export function sortSubjectsByAttendance<T extends { attended: number; conducted: number; name: string }>(
  items: readonly T[]
): T[] {
  return [...items].sort((a, b) => {
    const aValid = a.conducted > 0;
    const bValid = b.conducted > 0;

    if (!aValid && !bValid) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    if (!aValid) return 1;
    if (!bValid) return -1;

    const aPct = (a.attended / a.conducted) * 100;
    const bPct = (b.attended / b.conducted) * 100;

    if (Math.abs(aPct - bPct) > 0.0001) {
      return aPct - bPct;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function computeOverallAttendance(
  subjects: readonly { attended: number; conducted: number; goal: number }[]
): OverallAttendanceSummary {
  let totalAttended = 0;
  let totalConducted = 0;
  let belowGoalCount = 0;
  let closeCount = 0;
  let onTrackCount = 0;
  let noClassesCount = 0;

  for (const sub of subjects) {
    if (sub.conducted <= 0) {
      noClassesCount++;
      continue;
    }
    totalAttended += sub.attended;
    totalConducted += sub.conducted;

    const res = calculateAttendanceStatus(sub.attended, sub.conducted, sub.goal);
    if (res.status === "below") belowGoalCount++;
    else if (res.status === "close") closeCount++;
    else if (res.status === "on_track") onTrackCount++;
  }

  const validSubjectsCount = subjects.length - noClassesCount;
  let percentage: number | null = null;
  let formattedPercentage = "—";

  if (totalConducted > 0) {
    percentage = Number(((totalAttended / totalConducted) * 100).toFixed(1));
    formattedPercentage = `${percentage.toFixed(1)}%`;
  }

  let statusSentence: string;
  if (validSubjectsCount === 0) {
    statusSentence = "No classes conducted yet";
  } else if (belowGoalCount > 0) {
    statusSentence = `${belowGoalCount} ${belowGoalCount === 1 ? "subject" : "subjects"} below goal`;
  } else {
    statusSentence = "All subjects on track";
  }

  return {
    totalAttended,
    totalConducted,
    percentage,
    formattedPercentage,
    subjectsCount: subjects.length,
    belowGoalCount,
    closeCount,
    onTrackCount,
    noClassesCount,
    statusSentence,
  };
}
