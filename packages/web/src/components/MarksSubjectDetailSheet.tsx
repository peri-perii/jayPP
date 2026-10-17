import { useState, useEffect, useRef, useCallback } from "react";
import { X, AlertCircle } from "lucide-react";
import { titleCase } from "./DataViews";
import {
  formatEventCode,
  formatEventDesc,
  parseMarks,
  isLowScore,
  LOW_SCORE_THRESHOLD,
} from "../lib/marks";

export interface SubjectMarksDetail {
  subjectcode: string;
  subjectdesc: string;
  credits?: string | number | null;
  components: Array<{
    eventcode: string;
    obtainedmarks?: unknown;
    fullmarks?: unknown;
  }>;
}

interface MarksSubjectDetailSheetProps {
  detail: SubjectMarksDetail;
  onClose: () => void;
  lowThreshold?: number;
}

export function MarksSubjectDetailSheet({
  detail,
  onClose,
  lowThreshold = LOW_SCORE_THRESHOLD,
}: MarksSubjectDetailSheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  useEffect(() => {
    window.history.pushState({ marksBottomSheet: true }, "");

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

  let totalObtained = 0;
  let totalFull = 0;
  let hasValidMarks = false;

  const componentStats = detail.components.map((c) => {
    const obt = parseMarks(c.obtainedmarks);
    const full = parseMarks(c.fullmarks);
    const hasNumbers = obt !== null && full !== null && full > 0;
    const pct = hasNumbers ? Math.round((obt / full) * 1000) / 10 : null;
    const isLow = isLowScore(pct, lowThreshold);

    if (hasNumbers) {
      totalObtained += obt;
      totalFull += full;
      hasValidMarks = true;
    }

    const shortCode = formatEventCode(c.eventcode);
    const desc = formatEventDesc(c.eventcode);

    return {
      eventcode: c.eventcode,
      shortCode,
      desc,
      obt,
      full,
      pct,
      isLow,
    };
  });

  const overallPct =
    hasValidMarks && totalFull > 0
      ? Math.round((totalObtained / totalFull) * 1000) / 10
      : null;
  const isOverallLow = isLowScore(overallPct, lowThreshold);

  return (
    <div
      className={`bottom-sheet-backdrop ${isClosing ? "is-closing" : ""}`}
      onClick={() => window.history.back()}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={`bottom-sheet-modal marks-detail-sheet ${isClosing ? "is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-marks-title"
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />

        <div className="bottom-sheet-header">
          <div className="bottom-sheet-titles">
            <h2 id="sheet-marks-title" className="bottom-sheet-title">
              {titleCase(detail.subjectdesc || detail.subjectcode)}
            </h2>
            <div className="sheet-sub-meta">
              {detail.subjectcode && (
                <span className="bottom-sheet-code">{detail.subjectcode}</span>
              )}
              {detail.credits != null && detail.credits !== "" && (
                <span className="sheet-credit-badge">{detail.credits} Credits</span>
              )}
            </div>
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

        <div className="bottom-sheet-content marks-sheet-content">
          {hasValidMarks && (
            <div className="marks-sheet-summary-box">
              <div className="sheet-summary-left">
                <span className="sheet-summary-label">Subject Total</span>
                <span className="sheet-summary-marks">
                  <strong>{totalObtained}</strong>
                  <span className="sheet-marks-slash"> / {totalFull}</span>
                </span>
              </div>
              <div className="sheet-summary-right">
                <span className={`sheet-summary-pct ${isOverallLow ? "is-low" : ""}`}>
                  {overallPct !== null ? `${overallPct.toFixed(1)}%` : "—"}
                </span>
                {isOverallLow && (
                  <span className="marks-low-badge" role="status">
                    <AlertCircle size={12} />
                    <span>Low score</span>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="marks-components-section">
            <h3 className="marks-components-title">Evaluation Breakdown</h3>
            <div className="marks-components-list">
              {componentStats.map((comp, idx) => (
                <div key={idx} className="marks-component-item">
                  <div className="marks-comp-top">
                    <div className="marks-comp-info">
                      <span className="marks-comp-desc">{comp.desc || comp.shortCode || "Evaluation"}</span>
                      {comp.shortCode && comp.shortCode !== comp.desc && (
                        <span className="marks-comp-code">{comp.shortCode}</span>
                      )}
                    </div>
                    <div className="marks-comp-score">
                      <span className={`marks-score-obtained ${comp.isLow ? "is-low" : ""}`}>
                        {comp.obt !== null ? String(comp.obt) : "—"}
                      </span>
                      <span className="marks-score-full">
                        {comp.full !== null ? ` / ${comp.full}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="marks-comp-bar-track">
                    <div
                      className={`marks-comp-bar-fill ${comp.isLow ? "is-low" : ""}`}
                      style={{ width: `${Math.min(100, Math.max(0, comp.pct ?? 0))}%` }}
                    />
                  </div>

                  <div className="marks-comp-bottom">
                    <span className="marks-comp-pct">
                      {comp.pct !== null ? `${comp.pct.toFixed(1)}%` : "Marks pending"}
                    </span>
                    {comp.isLow && (
                      <span className="marks-low-badge" role="status">
                        <AlertCircle size={12} />
                        <span>Low score</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
