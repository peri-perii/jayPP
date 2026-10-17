import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X,
  Calculator,
  Minus,
  Plus,
  Check,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  classesAllowedToSkip,
  classesNeededToReachGoal,
  DEFAULT_ATTENDANCE_GOAL,
} from "../lib/attendance";
import {
  loadGoalsConfig,
  setDefaultGoal,
  type AttendanceGoalsConfig,
} from "../lib/attendanceGoals";
import { getCached, sessionCacheKey } from "../hooks/useFeature";
import type { Session, AttData } from "../types";

interface AttendanceCalculatorSheetProps {
  session?: Session;
  initialGoal?: number;
  onClose: () => void;
  onGoalSaved?: (goal: number) => void;
}

export function AttendanceCalculatorSheet({
  session,
  initialGoal,
  onClose,
  onGoalSaved,
}: AttendanceCalculatorSheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [goalsConfig, setGoalsConfig] = useState<AttendanceGoalsConfig>(() => loadGoalsConfig());
  const [targetGoal, setTargetGoal] = useState<number>(() => {
    if (initialGoal && initialGoal >= 50 && initialGoal <= 100) return initialGoal;
    return goalsConfig.defaultGoal || DEFAULT_ATTENDANCE_GOAL;
  });

  const [attendedInput, setAttendedInput] = useState<number>(() => {
    if (session) {
      try {
        const cached = getCached<AttData>(sessionCacheKey("att.initial", session));
        if (cached.data?.header?.attended) {
          const num = Number(cached.data.header.attended);
          if (!Number.isNaN(num) && num >= 0) return num;
        }
      } catch {}
    }
    return 20;
  });

  const [conductedInput, setConductedInput] = useState<number>(() => {
    if (session) {
      try {
        const cached = getCached<AttData>(sessionCacheKey("att.initial", session));
        if (cached.data?.header?.conducted) {
          const num = Number(cached.data.header.conducted);
          if (!Number.isNaN(num) && num > 0) return num;
        }
      } catch {}
    }
    return 24;
  });

  const [simulateMiss, setSimulateMiss] = useState<number>(0);
  const [simulateAttend, setSimulateAttend] = useState<number>(0);
  const [goalSavedNotice, setGoalSavedNotice] = useState(false);

  const cachedAtt = useMemo(() => {
    if (!session) return null;
    try {
      return getCached<AttData>(sessionCacheKey("att.initial", session)).data;
    } catch {
      return null;
    }
  }, [session]);

  const subjectOptions = useMemo(() => {
    const rows = cachedAtt?.semesters?.[0]?.rows || [];
    return rows.map((r) => {
      const code = String(r.individualsubjectcode || r.subjectcode || "").trim();
      const name = String(r.subjectdesc || r.subjectcode || "Subject").trim();
      const present = Number(r.totalpresent ?? r.attended ?? 0);
      const total = Number(r.totalclasses ?? r.conducted ?? 0);
      return { code, name, present, total };
    });
  }, [cachedAtt]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("overall");

  const handleSelectSubject = (id: string) => {
    setSelectedSubjectId(id);
    setSimulateMiss(0);
    setSimulateAttend(0);
    if (id === "overall") {
      const att = Number(cachedAtt?.header?.attended ?? 20);
      const cond = Number(cachedAtt?.header?.conducted ?? 24);
      setAttendedInput(att);
      setConductedInput(cond);
      setTargetGoal(goalsConfig.defaultGoal || DEFAULT_ATTENDANCE_GOAL);
    } else {
      const match = subjectOptions.find((s) => s.code === id);
      if (match) {
        setAttendedInput(match.present);
        setConductedInput(match.total);
        const subGoal = goalsConfig.overrides[match.code] ?? goalsConfig.defaultGoal ?? DEFAULT_ATTENDANCE_GOAL;
        setTargetGoal(subGoal);
      }
    }
  };

  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, 200);
  }, [isClosing, onClose]);

  useEffect(() => {
    window.history.pushState({ attendanceCalculator: true }, "");

    const handlePopState = () => {
      handleClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.history.back();
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

  const safeAttended = Math.max(0, attendedInput);
  const safeConducted = Math.max(safeAttended, conductedInput);
  const currentRatio = safeConducted > 0 ? safeAttended / safeConducted : 0;
  const currentPct = Number((currentRatio * 100).toFixed(1));
  const goalFraction = targetGoal / 100;

  const skippable = useMemo(() => {
    return classesAllowedToSkip(safeAttended, safeConducted, goalFraction);
  }, [safeAttended, safeConducted, goalFraction]);

  const needed = useMemo(() => {
    return classesNeededToReachGoal(safeAttended, safeConducted, goalFraction) ?? 0;
  }, [safeAttended, safeConducted, goalFraction]);

  const isAboveGoal = currentPct >= targetGoal;
  const isExactlyGoal = Math.abs(currentPct - targetGoal) < 0.05;

  const pctAfterSkippingAll = useMemo(() => {
    if (skippable <= 0) return currentPct;
    const nextConducted = safeConducted + skippable;
    return Number(((safeAttended / nextConducted) * 100).toFixed(1));
  }, [safeAttended, safeConducted, skippable, currentPct]);

  const simAttended = safeAttended + simulateAttend;
  const simConducted = safeConducted + simulateAttend + simulateMiss;
  const simPct = simConducted > 0 ? Number(((simAttended / simConducted) * 100).toFixed(1)) : 0;

  const handleSaveDefaultGoal = () => {
    setDefaultGoal(targetGoal);
    setGoalsConfig(loadGoalsConfig());
    setGoalSavedNotice(true);
    if (onGoalSaved) onGoalSaved(targetGoal);
    setTimeout(() => setGoalSavedNotice(false), 2400);
  };

  const handlePreset = (att: number, cond: number) => {
    setAttendedInput(att);
    setConductedInput(cond);
    setSimulateMiss(0);
    setSimulateAttend(0);
  };

  return (
    <div
      className={`bottom-sheet-backdrop ${isClosing ? "is-closing" : ""}`}
      onClick={() => window.history.back()}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={`bottom-sheet-modal notif-settings-modal ${isClosing ? "is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="att-calc-title"
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />

        <div className="bottom-sheet-header">
          <div className="bottom-sheet-titles">
            <h2 id="att-calc-title" className="bottom-sheet-title">
              Attendance Calculator
            </h2>
            <span className="bottom-sheet-code">Bunk &amp; attendance margin simulator</span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="bottom-sheet-close-btn"
            onClick={() => window.history.back()}
            aria-label="Close calculator"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bottom-sheet-content">
          {subjectOptions.length > 0 && (
            <div className="calc-subject-selector-block" aria-label="Calculate attendance by subject">
              <span className="calc-subject-label">Calculate for:</span>
              <div className="calc-subject-scroll-row" role="radiogroup" aria-label="Subjects">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedSubjectId === "overall"}
                  onClick={() => handleSelectSubject("overall")}
                  className={`calc-subject-chip ${selectedSubjectId === "overall" ? "active" : ""}`}
                >
                  <span>Overall ({cachedAtt?.header?.attended ?? safeAttended}/{cachedAtt?.header?.conducted ?? safeConducted})</span>
                </button>
                {subjectOptions.map((sub) => (
                  <button
                    key={sub.code}
                    type="button"
                    role="radio"
                    aria-checked={selectedSubjectId === sub.code}
                    onClick={() => handleSelectSubject(sub.code)}
                    className={`calc-subject-chip ${selectedSubjectId === sub.code ? "active" : ""}`}
                    title={sub.name}
                  >
                    <span className="chip-code">{sub.code || sub.name}</span>
                    <span className="chip-ratio">{sub.present}/{sub.total}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <section className="att-calc-hero-card" aria-label="Bunk Calculation Result">
            <div className="att-calc-hero-top">
              <div className="att-calc-stat-block">
                <span className="att-calc-stat-label">Current Attendance</span>
                <div className="att-calc-pct-row">
                  <span className={`att-calc-pct-val ${isAboveGoal ? "status-on_track" : "status-below"}`}>
                    {safeConducted > 0 ? `${currentPct.toFixed(1)}%` : "0%"}
                  </span>
                  <span className="att-calc-counts-pill">
                    {safeAttended} / {safeConducted} classes
                  </span>
                </div>
              </div>

              <div className={`att-calc-badge ${isAboveGoal ? "badge-safe" : "badge-short"}`}>
                {isAboveGoal ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                <span>{isAboveGoal ? "Safe to Bunk" : "Attendance Short"}</span>
              </div>
            </div>

            <div className="sub-progress-container" aria-hidden="true">
              <div className="sub-progress-track">
                <div
                  className={`sub-progress-bar ${isAboveGoal ? "status-on_track" : "status-below"}`}
                  style={{ width: `${Math.min(100, currentPct)}%` }}
                />
                <div
                  className="sub-goal-tick"
                  style={{ left: `${targetGoal}%` }}
                  title={`Goal: ${targetGoal}%`}
                />
              </div>
            </div>

            <div className="att-calc-verdict-box">
              {isAboveGoal ? (
                <>
                  <div className="att-calc-bunk-headline">
                    <span>You can bunk </span>
                    <strong className="att-calc-bunk-number">{skippable}</strong>
                    <span> {skippable === 1 ? "class" : "classes"}</span>
                  </div>
                  <p className="att-calc-verdict-sub">
                    {skippable > 0
                      ? `If you miss the next ${skippable} ${skippable === 1 ? "class" : "classes"}, your attendance will stay at ${pctAfterSkippingAll.toFixed(1)}% (at or above your ${targetGoal}% goal).`
                      : `You are exactly at your ${targetGoal}% goal. Bunking even 1 more class will drop you below your goal.`}
                  </p>
                </>
              ) : (
                <>
                  <div className="att-calc-bunk-headline is-short">
                    <span>You need to attend </span>
                    <strong className="att-calc-bunk-number is-short">{needed}</strong>
                    <span> more {needed === 1 ? "class" : "classes"}</span>
                  </div>
                  <p className="att-calc-verdict-sub">
                    You cannot bunk any classes right now. Attend the next {needed} consecutive {needed === 1 ? "class" : "classes"} without missing to reach {targetGoal}%.
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="settings-card-group" aria-label="Target Goal Selection">
            <div className="settings-card-header">
              <span className="settings-group-label">Attendance Target Goal</span>
              <span className="settings-goal-value">{targetGoal}%</span>
            </div>

            <div className="bottom-sheet-goal-stepper">
              <button
                type="button"
                onClick={() => setTargetGoal((g) => Math.max(50, g - 1))}
                disabled={targetGoal <= 50}
                className="goal-stepper-btn"
                aria-label="Decrease target by 1%"
              >
                <Minus size={18} />
              </button>

              <div className="goal-stepper-display">
                <span className="goal-stepper-num">{targetGoal}%</span>
              </div>

              <button
                type="button"
                onClick={() => setTargetGoal((g) => Math.min(100, g + 1))}
                disabled={targetGoal >= 100}
                className="goal-stepper-btn"
                aria-label="Increase target by 1%"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="goal-slider-wrapper">
              <input
                type="range"
                min={50}
                max={100}
                step={1}
                value={targetGoal}
                onChange={(e) => setTargetGoal(Number(e.target.value))}
                className="goal-slider"
                aria-label="Attendance target slider"
              />
              <div className="goal-slider-ticks">
                <span className="slider-tick">50%</span>
                <span className="slider-tick">75%</span>
                <span className="slider-tick">80%</span>
                <span className="slider-tick">85%</span>
                <span className="slider-tick">100%</span>
              </div>
            </div>

            <div className="att-calc-presets-row" role="group" aria-label="Goal quick presets">
              {[75, 80, 85, 90].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`att-calc-preset-chip ${targetGoal === preset ? "is-active" : ""}`}
                  onClick={() => setTargetGoal(preset)}
                >
                  {preset}%
                </button>
              ))}
            </div>

            <button
              type="button"
              className="att-calc-save-goal-btn"
              onClick={handleSaveDefaultGoal}
            >
              <Check size={14} />
              <span>{goalSavedNotice ? "Saved as Default Goal!" : `Set ${targetGoal}% as My Default Portal Goal`}</span>
            </button>
          </section>

          <section className="settings-card-group" aria-label="Attendance Numbers">
            <div className="settings-card-header">
              <span className="settings-group-label">Class Attendance Numbers</span>
            </div>

            <div className="att-calc-inputs-grid">
              <div className="att-calc-input-block">
                <label htmlFor="att-calc-attended-input" className="att-calc-input-label">
                  Classes Attended (P)
                </label>
                <div className="att-calc-stepper-row">
                  <button
                    type="button"
                    onClick={() => setAttendedInput((a) => Math.max(0, a - 1))}
                    disabled={attendedInput <= 0}
                    className="goal-stepper-btn mini"
                    aria-label="Decrease attended classes"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    id="att-calc-attended-input"
                    type="number"
                    min={0}
                    max={conductedInput}
                    value={attendedInput}
                    onChange={(e) => setAttendedInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="att-calc-number-field"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAttendedInput((a) => a + 1);
                      if (attendedInput >= conductedInput) {
                        setConductedInput((c) => c + 1);
                      }
                    }}
                    className="goal-stepper-btn mini"
                    aria-label="Increase attended classes"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <div className="att-calc-input-block">
                <label htmlFor="att-calc-conducted-input" className="att-calc-input-label">
                  Total Conducted (T)
                </label>
                <div className="att-calc-stepper-row">
                  <button
                    type="button"
                    onClick={() => setConductedInput((c) => Math.max(safeAttended, c - 1))}
                    disabled={conductedInput <= safeAttended}
                    className="goal-stepper-btn mini"
                    aria-label="Decrease conducted classes"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    id="att-calc-conducted-input"
                    type="number"
                    min={safeAttended}
                    value={conductedInput}
                    onChange={(e) => setConductedInput(Math.max(safeAttended, parseInt(e.target.value, 10) || 0))}
                    className="att-calc-number-field"
                  />
                  <button
                    type="button"
                    onClick={() => setConductedInput((c) => c + 1)}
                    className="goal-stepper-btn mini"
                    aria-label="Increase conducted classes"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="att-calc-sample-chips">
              <span className="att-calc-sample-label">Quick samples:</span>
              <button
                type="button"
                className="att-calc-sample-pill"
                onClick={() => handlePreset(20, 25)}
              >
                20/25 (80%)
              </button>
              <button
                type="button"
                className="att-calc-sample-pill"
                onClick={() => handlePreset(32, 38)}
              >
                32/38 (84%)
              </button>
              <button
                type="button"
                className="att-calc-sample-pill"
                onClick={() => handlePreset(15, 24)}
              >
                15/24 (62.5%)
              </button>
              <button
                type="button"
                className="att-calc-sample-pill"
                onClick={() => handlePreset(45, 50)}
              >
                45/50 (90%)
              </button>
            </div>
          </section>

          <section className="settings-card-group" aria-label="Interactive Simulator">
            <div className="settings-card-header">
              <span className="settings-group-label">Simulate Future Classes</span>
              <span className="att-calc-sim-outcome">
                Outcome: <strong>{simPct.toFixed(1)}%</strong> ({simAttended}/{simConducted})
              </span>
            </div>

            <div className="att-calc-sim-grid">
              <div className="att-calc-sim-cell">
                <span className="att-calc-sim-label">Bunk upcoming classes</span>
                <div className="att-calc-stepper-row">
                  <button
                    type="button"
                    onClick={() => setSimulateMiss((m) => Math.max(0, m - 1))}
                    disabled={simulateMiss <= 0}
                    className="goal-stepper-btn mini"
                    aria-label="Decrease missed classes simulation"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="att-calc-sim-val">+{simulateMiss} missed</span>
                  <button
                    type="button"
                    onClick={() => setSimulateMiss((m) => m + 1)}
                    className="goal-stepper-btn mini"
                    aria-label="Increase missed classes simulation"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <div className="att-calc-sim-cell">
                <span className="att-calc-sim-label">Attend upcoming classes</span>
                <div className="att-calc-stepper-row">
                  <button
                    type="button"
                    onClick={() => setSimulateAttend((a) => Math.max(0, a - 1))}
                    disabled={simulateAttend <= 0}
                    className="goal-stepper-btn mini"
                    aria-label="Decrease attended classes simulation"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="att-calc-sim-val">+{simulateAttend} attended</span>
                  <button
                    type="button"
                    onClick={() => setSimulateAttend((a) => a + 1)}
                    className="goal-stepper-btn mini"
                    aria-label="Increase attended classes simulation"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            </div>

            {(simulateMiss > 0 || simulateAttend > 0) && (
              <button
                type="button"
                className="att-calc-reset-sim-btn"
                onClick={() => {
                  setSimulateMiss(0);
                  setSimulateAttend(0);
                }}
              >
                Reset Future Simulation
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
