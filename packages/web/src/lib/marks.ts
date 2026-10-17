/**
 * Pure helper logic for marks section.
 * Kept zero-dependency and isolated from React/JSX so it can be tested directly in Node.
 */

/** Format exam/test event codes into concise student-friendly labels (e.g. TEST-1 -> T1, P-1 -> P1). */
export function formatEventCode(code?: unknown): string {
  if (code == null) return "";
  const s = String(code).trim().toUpperCase();
  if (!s) return "";
  const tMatch = s.match(/^(?:TEST|T)[-_\s]*([0-9]+)$/);
  if (tMatch) return `T${tMatch[1]}`;
  const pMatch = s.match(/^(?:PRACTICAL|PRAC|PR|P)[-_\s]*([0-9]+)$/);
  if (pMatch) return `P${pMatch[1]}`;
  return s;
}

/** Format exam/test event codes into descriptive names (e.g. T1 -> Test 1, P1 -> Practical 1). */
export function formatEventDesc(code?: unknown): string {
  const short = formatEventCode(code);
  if (!short) return "";
  const tMatch = short.match(/^T([0-9]+)$/i);
  if (tMatch) return `Test ${tMatch[1]}`;
  const pMatch = short.match(/^P([0-9]+)$/i);
  if (pMatch) return `Practical ${pMatch[1]}`;
  return short;
}

export const LOW_SCORE_THRESHOLD = 35; // default 35%

export function parseMarks(val: unknown): number | null {
  if (val == null || val === "") return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

export interface MarksSummary {
  totalObtained: number;
  totalFull: number;
  percentage: number | null;
  formattedPercentage: string;
  subjectsCount: number;
  validRowsCount: number;
}

export function calculateMarksSummary(rows: Array<{
  subjectcode?: string;
  subjectdesc?: string;
  fullmarks?: unknown;
  obtainedmarks?: unknown;
}>): MarksSummary {
  let totalObtained = 0;
  let totalFull = 0;
  let validRowsCount = 0;
  const subjectSet = new Set<string>();

  for (const r of rows) {
    const key = String(r.subjectcode ?? r.subjectdesc ?? "").trim();
    if (key) subjectSet.add(key);

    const obt = parseMarks(r.obtainedmarks);
    const full = parseMarks(r.fullmarks);
    if (obt !== null && full !== null && full > 0) {
      totalObtained += obt;
      totalFull += full;
      validRowsCount++;
    }
  }

  const percentage = totalFull > 0 ? Math.round((totalObtained / totalFull) * 1000) / 10 : null;
  const formattedPercentage = percentage !== null ? `${percentage.toFixed(1)}%` : "—%";

  return {
    totalObtained: Math.round(totalObtained * 10) / 10,
    totalFull: Math.round(totalFull * 10) / 10,
    percentage,
    formattedPercentage,
    subjectsCount: subjectSet.size,
    validRowsCount,
  };
}

export function isLowScore(percentage: number | null, threshold: number = LOW_SCORE_THRESHOLD): boolean {
  if (percentage === null) return false;
  return percentage < threshold;
}

