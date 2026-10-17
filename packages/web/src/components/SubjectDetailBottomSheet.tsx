import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, Minus, Plus, AlertTriangle, AlertCircle, CheckCircle2, RotateCcw, Calculator } from "lucide-react";
import { features } from "@juet/core";
import { client } from "../lib/portal";
import { useFeature } from "../hooks/useFeature";
import { SectionError } from "./DataViews";
import type { Session } from "../types";
import {
  type AttRow,
  subjectName,
  CombinedClassLog,
  isSubjectDetailComplete,
  getSubjectCacheKey,
  getCachedSubjectDetailEntry,
} from "../sections/attendance";
import {
  calculateAttendanceStatus,
  extractSubjectCode,
  extractSubjectName,
  classesAllowedToSkip,
  classesNeededToReachGoal,
} from "../lib/attendance.ts";
import {
  getSubjectGoal,
  setSubjectGoal,
  resetSubjectGoal,
  loadGoalsConfig,
  type AttendanceGoalsConfig,
} from "../lib/attendanceGoals.ts";
import {
  computeSubjectRowChecksum,
  doesSubjectNeedDeepFetch,
  FEATURE_TTL,
  isCurrentPortalDay,
} from "../lib/portalSchedule";

interface SubjectDetailBottomSheetProps {
  row: AttRow & Record<string, unknown>;
  registrationid?: string;
  registrationcode?: string;
  session: Session;
  attended: number;
  conducted: number;
  onClose: () => void;
  onGoalChange?: () => void;
}

export function SubjectDetailBottomSheet({
  row,
  registrationid,
  registrationcode,
  session,
  attended: initialAttended,
  conducted: initialConducted,
  onClose,
  onGoalChange,
}: SubjectDetailBottomSheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const subjectCode = extractSubjectCode(row.subjectcode || row.individualsubjectcode);
  const displayName = extractSubjectName(row.subjectcode) || subjectName(row.subjectcode).name;

  const [goalsConfig, setGoalsConfig] = useState<AttendanceGoalsConfig>(() => loadGoalsConfig());
  const currentGoal = getSubjectGoal(subjectCode, goalsConfig);
  const isCustomGoal = goalsConfig.overrides[subjectCode] !== undefined;

  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const base = useMemo(() => ({ registrationid, registrationcode }), [registrationid, registrationcode]);
  const cacheKey = getSubjectCacheKey(session.username, registrationid, row, session.instituteid);

  const detail = useFeature<Record<string, Record<string, unknown>>>({
    run: () => features.getSubjectAttendanceAll(client, session, row, base, "current"),
    deps: [session, registrationid, String(row.subjectid)],
    cacheKey,
    staleTimeMs: FEATURE_TTL.subjects,
    isFresh: (updatedAt) => {
      if (!isCurrentPortalDay(updatedAt)) return false;
      const fresh = getCachedSubjectDetailEntry(session.username, registrationid, row, session.instituteid);
      return !doesSubjectNeedDeepFetch(row, fresh.data, updatedAt, fresh.checksum);
    },
    writeExtra: (d) => (isSubjectDetailComplete(row, d) ? { checksum: computeSubjectRowChecksum(row) } : {}),
  });

  const attended = initialAttended;
  const conducted = initialConducted;
  const statusResult = calculateAttendanceStatus(attended, conducted, currentGoal);

  const [simulateAttend, setSimulateAttend] = useState<number>(0);
  const [simulateMiss, setSimulateMiss] = useState<number>(0);

  const goalFraction = currentGoal / 100;
  const currentSkippable = useMemo(
    () => classesAllowedToSkip(attended, conducted, goalFraction),
    [attended, conducted, goalFraction]
  );
  const currentNeeded = useMemo(
    () => classesNeededToReachGoal(attended, conducted, goalFraction) ?? 0,
    [attended, conducted, goalFraction]
  );

  const simAttended = attended + simulateAttend;
  const simConducted = conducted + simulateAttend + simulateMiss;
  const simPct = simConducted > 0 ? Number(((simAttended / simConducted) * 100).toFixed(1)) : 0;
  const simSkippable = useMemo(
    () => classesAllowedToSkip(simAttended, simConducted, goalFraction),
    [simAttended, simConducted, goalFraction]
  );
  const simNeeded = useMemo(
    () => classesNeededToReachGoal(simAttended, simConducted, goalFraction) ?? 0,
    [simAttended, simConducted, goalFraction]
  );
  const isSimulating = simulateAttend > 0 || simulateMiss > 0;

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, 200);
  }, [isClosing, onClose]);

  const handleGoalStep = (delta: number) => {
    const next = Math.min(100, Math.max(50, currentGoal + delta));
    setSubjectGoal(subjectCode, next);
    setGoalsConfig(loadGoalsConfig());
    if (onGoalChange) onGoalChange();
  };

  const handleGoalSlider = (val: number) => {
    const next = Math.min(100, Math.max(50, val));
    setSubjectGoal(subjectCode, next);
    setGoalsConfig(loadGoalsConfig());
    if (onGoalChange) onGoalChange();
  };

  const handleResetGoal = () => {
    resetSubjectGoal(subjectCode);
    setGoalsConfig(loadGoalsConfig());
    if (onGoalChange) onGoalChange();
  };

  useEffect(() => {
    window.history.pushState({ bottomSheet: true }, "");

    const handlePopState = () => {
      handleClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.history.back();
      }
      if (e.key === "Tab" && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    if (closeBtnRef.current) {
      closeBtnRef.current.focus();
    }

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose]);

  const missed = Math.max(0, conducted - attended);

  return (
    <div
      className={`bottom-sheet-backdrop ${isClosing ? "is-closing" : ""}`}
      onClick={() => window.history.back()}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={`bottom-sheet-modal ${isClosing ? "is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-subject-title"
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />

        <div className="bottom-sheet-header">
          <div className="bottom-sheet-titles">
            <h2 id="sheet-subject-title" className="bottom-sheet-title">
              {displayName}
            </h2>
            {subjectCode && <span className="bottom-sheet-code">{subjectCode}</span>}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="bottom-sheet-close-btn"
            onClick={() => window.history.back()}
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bottom-sheet-content">
          <div className="bottom-sheet-kpi-block">
            <div className="bottom-sheet-kpi-row">
              <div className="bottom-sheet-kpi-left">
                <span className={`bottom-sheet-percent ${statusResult.status}`}>
                  {statusResult.formattedPercentage}
                </span>
                <span className="bottom-sheet-kpi-sub">
                  {conducted > 0
                    ? `${attended} of ${conducted} attended · ${missed} missed`
                    : "No classes conducted yet"}
                </span>
              </div>
              <div className={`bottom-sheet-status-pill status-${statusResult.status}`}>
                {statusResult.status === "below" && <AlertTriangle size={14} />}
                {statusResult.status === "close" && <AlertCircle size={14} />}
                {statusResult.status === "on_track" && <CheckCircle2 size={14} />}
                <span>{statusResult.statusLabel}</span>
              </div>
            </div>

            <div className="bottom-sheet-action-banner">
              <span className="bottom-sheet-action-text">{statusResult.actionText}</span>
            </div>
          </div>

          <div className="bottom-sheet-section">
            <div className="bottom-sheet-section-header">
              <span className="bottom-sheet-section-title">Attendance Goal</span>
              <div className="bottom-sheet-goal-meta">
                <span className="bottom-sheet-goal-num">{currentGoal}%</span>
                {isCustomGoal && (
                  <button
                    type="button"
                    onClick={handleResetGoal}
                    className="bottom-sheet-reset-goal"
                    title={`Reset to default (${goalsConfig.defaultGoal}%)`}
                  >
                    <RotateCcw size={12} />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            <div className="bottom-sheet-goal-stepper">
              <button
                type="button"
                onClick={() => handleGoalStep(-1)}
                disabled={currentGoal <= 50}
                className="goal-stepper-btn"
                aria-label="Decrease goal"
              >
                <Minus size={16} />
              </button>

              <div className="goal-slider-wrapper">
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={1}
                  value={currentGoal}
                  onChange={(e) => handleGoalSlider(Number(e.target.value))}
                  className="goal-slider-input"
                  aria-label={`Attendance goal for ${displayName}`}
                />
              </div>

              <button
                type="button"
                onClick={() => handleGoalStep(1)}
                disabled={currentGoal >= 100}
                className="goal-stepper-btn"
                aria-label="Increase goal"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="bottom-sheet-section">
            <div className="bottom-sheet-section-header">
              <div className="sub-calc-heading-group">
                <Calculator size={15} className="sub-calc-icon" />
                <span className="bottom-sheet-section-title">Attendance &amp; Bunk Calculator</span>
              </div>
              {isSimulating && (
                <button
                  type="button"
                  onClick={() => {
                    setSimulateAttend(0);
                    setSimulateMiss(0);
                  }}
                  className="bottom-sheet-reset-goal"
                  title="Reset simulation"
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <div className={`sub-calc-status-card ${isSimulating ? (simPct >= currentGoal ? "sim-pass" : "sim-fail") : (statusResult.status === "below" ? "sim-fail" : "sim-pass")}`}>
              <div className="sub-calc-metric-row">
                <div className="sub-calc-col">
                  <span className="sub-calc-metric-label">Current</span>
                  <span className="sub-calc-metric-val">{statusResult.formattedPercentage}</span>
                  <span className="sub-calc-metric-sub">{attended}/{conducted} classes</span>
                </div>
                {isSimulating && (
                  <div className="sub-calc-col projected">
                    <span className="sub-calc-metric-label">Projected</span>
                    <span className={`sub-calc-metric-val ${simPct >= currentGoal ? "pass" : "fail"}`}>{simPct}%</span>
                    <span className="sub-calc-metric-sub">{simAttended}/{simConducted} classes</span>
                  </div>
                )}
              </div>

              <div className="sub-calc-verdict">
                {!isSimulating ? (
                  currentSkippable > 0 ? (
                    <span className="verdict-text pass">
                      You can safely bunk <strong>{currentSkippable}</strong> more class{currentSkippable === 1 ? "" : "es"} without dropping below {currentGoal}%.
                    </span>
                  ) : currentNeeded > 0 ? (
                    <span className="verdict-text fail">
                      You must attend next <strong>{currentNeeded}</strong> class{currentNeeded === 1 ? "" : "es"} in a row to reach {currentGoal}%.
                    </span>
                  ) : (
                    <span className="verdict-text pass">
                      You are exactly on track at {currentGoal}%. Attend upcoming classes to build a bunk buffer.
                    </span>
                  )
                ) : (
                  simPct >= currentGoal ? (
                    <span className="verdict-text pass">
                      With this plan: {simPct}% attendance. You can still bunk <strong>{simSkippable}</strong> additional class{simSkippable === 1 ? "" : "es"}.
                    </span>
                  ) : (
                    <span className="verdict-text fail">
                      With this plan: {simPct}% attendance. You will need to attend next <strong>{simNeeded}</strong> consecutive class{simNeeded === 1 ? "" : "es"} to recover.
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="sub-calc-steppers-grid">
              <div className="sub-calc-stepper-box">
                <span className="stepper-label">Attend next (+classes)</span>
                <div className="stepper-controls">
                  <button
                    type="button"
                    onClick={() => setSimulateAttend((v) => Math.max(0, v - 1))}
                    disabled={simulateAttend <= 0}
                    className="stepper-btn"
                    aria-label="Decrease attended simulation"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="stepper-value">+{simulateAttend}</span>
                  <button
                    type="button"
                    onClick={() => setSimulateAttend((v) => Math.min(50, v + 1))}
                    className="stepper-btn"
                    aria-label="Increase attended simulation"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div className="sub-calc-stepper-box">
                <span className="stepper-label">Bunk / miss (+classes)</span>
                <div className="stepper-controls">
                  <button
                    type="button"
                    onClick={() => setSimulateMiss((v) => Math.max(0, v - 1))}
                    disabled={simulateMiss <= 0}
                    className="stepper-btn"
                    aria-label="Decrease missed simulation"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="stepper-value">+{simulateMiss}</span>
                  <button
                    type="button"
                    onClick={() => setSimulateMiss((v) => Math.min(50, v + 1))}
                    className="stepper-btn"
                    aria-label="Increase missed simulation"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bottom-sheet-section">
            <div className="bottom-sheet-section-header">
              <span className="bottom-sheet-section-title">Class History</span>
            </div>

            {detail.loading && !detail.data && (
              <div className="sheet-loading-logs">
                <span className="sync-pulse-dot" aria-hidden="true" />
                <span>Loading class records…</span>
              </div>
            )}

            {detail.error && !detail.data && (
              <SectionError label="Class history" error={detail.error} retry={detail.retry} />
            )}

            {detail.data && Object.keys(detail.data).length > 0 && (
              <CombinedClassLog data={detail.data} />
            )}

            {detail.data && Object.keys(detail.data).length === 0 && !detail.loading && (
              <p className="bottom-sheet-muted">No class-by-class log recorded for this subject.</p>
            )}

            {!detail.loading && !detail.data && !detail.error && conducted === 0 && (
              <p className="bottom-sheet-muted">No classes held yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
