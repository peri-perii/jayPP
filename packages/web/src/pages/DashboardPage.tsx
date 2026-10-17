import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  RefreshCw,
  Wifi,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  WifiOff,
  Calculator,
  ChevronRight,
} from "lucide-react";
import { features } from "@juet/core";
import { client, getSessionStatus } from "../lib/portal";
import { formatLastSync, shouldThrottleRefresh, recordRefreshAttempt, SectionError } from "../components/DataViews";
import { useSemester } from "../hooks/useSemester";
import { useFeature, sessionCacheKey, getCacheGeneration, isCacheGenerationCurrent } from "../hooks/useFeature";
import {
  type AttRow,
  type AttData,
  combinedAttendance,
  getCachedSubjectDetail,
  getCachedSubjectDetailEntry,
  setCachedSubjectDetail,
  useAttendanceInitial,
} from "../sections/attendance";
import {
  calculateAttendanceStatus,
  computeOverallAttendance,
  extractSubjectCode,
  extractSubjectName,
  sortSubjectsByAttendance,
  type AttendanceGoalStatus,
} from "../lib/attendance.ts";
import {
  loadGoalsConfig,
  getSubjectGoal,
  subscribeGoals,
  type AttendanceGoalsConfig,
} from "../lib/attendanceGoals.ts";
import {
  doesSubjectNeedDeepFetch,
  subscribePortalDayRollover,
  FEATURE_TTL,
} from "../lib/portalSchedule";
import { SubjectDetailBottomSheet } from "../components/SubjectDetailBottomSheet";
import { AttendanceCalculatorSheet } from "../components/AttendanceCalculatorSheet";
import { AttendanceSettingsSheet } from "../components/AttendanceSettingsSheet";
import {
  detectStatusTransitions,
  saveLastStatusMap,
  dispatchAttendanceAlertIfNeeded,
  syncDailyReminder,
} from "../lib/notifications.ts";
import { useTabScroll, resetTabScroll } from "../lib/tabScroll";
import type { Session } from "../types";

function AnimatedPercentage({
  value,
  duration = 1000,
  shouldAnimate = true,
}: {
  value: number | null;
  duration?: number;
  shouldAnimate?: boolean;
}) {
  const [displayValue, setDisplayValue] = useState<number | null>(() => (shouldAnimate ? 0 : value));

  useEffect(() => {
    if (value === null) {
      setDisplayValue(null);
      return;
    }
    if (!shouldAnimate) {
      setDisplayValue(value);
      return;
    }
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    let start: number | null = null;
    let animId: number;
    const startVal = 0;
    const targetVal = value;

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetVal - startVal) * easeOut;
      setDisplayValue(current);
      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setDisplayValue(targetVal);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [value, duration, shouldAnimate]);

  if (displayValue == null) {
    return <span className="tabular-num">—</span>;
  }
  return <span className="tabular-num">{displayValue.toFixed(1)}%</span>;
}

interface InstituteOption {
  value?: string;
  label?: string;
}

function getFirstName(fullName?: string | null): string {
  if (!fullName) return "Student";
  const trimmed = fullName.trim();
  if (!trimmed) return "Student";
  const first = trimmed.split(/\s+/)[0];
  if (!first) return "Student";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

interface ProcessedSubjectItem {
  id: string;
  name: string;
  code: string;
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
  row: AttRow & Record<string, unknown>;
}

export function DashboardPage({
  session,
  isExpired,
  isRecovering,
  onLogout: _onLogout,
  onSessionRenewed: _onSessionRenewed,
  onSelectInstitute,
}: {
  session: Session;
  isExpired?: boolean;
  isRecovering?: boolean;
  onLogout: () => void;
  onSessionRenewed?: (s: Session) => void;
  onSelectInstitute: (instituteid: string) => void;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMounted = useRef(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

  const [goalsConfig, setGoalsConfig] = useState<AttendanceGoalsConfig>(() => loadGoalsConfig());
  const [selectedSubject, setSelectedSubject] = useState<ProcessedSubjectItem | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showGoalSheet, setShowGoalSheet] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [hasPlayedChoreography, setHasPlayedChoreography] = useState(false);
  const [shouldAnimateChoreography, setShouldAnimateChoreography] = useState(false);

  const [lastSync, setLastSync] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem("juet.portal.last_sync");
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  });

  const spinBriefly = useCallback(() => {
    setIsRefreshing(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      if (isMounted.current) setIsRefreshing(false);
    }, 600);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    const updateSync = () => {
      try {
        const raw = localStorage.getItem("juet.portal.last_sync");
        if (raw) setLastSync(Number(raw));
      } catch {}
      if (isMounted.current) setIsRefreshing(false);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("storage", updateSync);
    window.addEventListener("juet:sync", updateSync);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsubRollover = subscribePortalDayRollover(() => {
      if (isMounted.current) {
        updateSync();
      }
    });

    const unsubGoals = subscribeGoals((cfg) => {
      if (isMounted.current) setGoalsConfig(cfg);
    });

    return () => {
      isMounted.current = false;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      window.removeEventListener("storage", updateSync);
      window.removeEventListener("juet:sync", updateSync);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubRollover();
      unsubGoals();
    };
  }, []);

  const att = useAttendanceInitial(session);
  const initial = att.data;
  const [semId] = useSemester(sessionCacheKey("semester", session, "attendance"), initial?.semesters);
  const isDefault = semId === String(initial?.semesters?.[0]?.registrationid);

  const detail = useFeature<{ rows: AttRow[] }>({
    run: () =>
      features.getAttendanceDetail(client, session, {
        stynumber: initial?.header?.stynumber,
        registrationid: initial?.semesters?.[0]?.registrationid,
        registrationcode: initial?.semesters?.[0]?.registrationcode,
      }),
    deps: [session, semId],
    enabled: isDefault,
    cacheKey: semId ? sessionCacheKey("att.detail", session, semId) : undefined,
    staleTimeMs: FEATURE_TTL.pastDetail,
  });

  const rows = initial?.rows ?? detail.data?.rows ?? [];
  const loading = (att.loading || detail.loading) && rows.length === 0;
  const error = att.error ?? detail.error;

  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonShownAt = useRef<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (loading) {
      timer = setTimeout(() => {
        setShowSkeleton(true);
        skeletonShownAt.current = Date.now();
      }, 150);
    } else {
      if (showSkeleton && skeletonShownAt.current) {
        const elapsed = Date.now() - skeletonShownAt.current;
        const remaining = Math.max(0, 300 - elapsed);
        timer = setTimeout(() => {
          setShowSkeleton(false);
          skeletonShownAt.current = null;
        }, remaining);
      } else {
        setShowSkeleton(false);
        skeletonShownAt.current = null;
      }
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loading, showSkeleton]);

  const [detailsMap, setDetailsMap] = useState<Record<string, Record<string, unknown>>>(() => {
    const map: Record<string, Record<string, unknown>> = {};
    for (const r of rows) {
      const cached = getCachedSubjectDetail(session.username, semId, r, session.instituteid);
      if (cached) {
        const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
        map[subId] = cached;
      }
    }
    return map;
  });

  useEffect(() => {
    if (!rows.length || isExpired || !isDefault) return;

    const generation = getCacheGeneration();
    let isLive = true;
    let isAborted = false;
    const currentMap: Record<string, Record<string, unknown>> = {};
    const toFetch: (AttRow & Record<string, unknown>)[] = [];

    for (const r of rows) {
      const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
      const entry = getCachedSubjectDetailEntry(session.username, semId, r, session.instituteid);
      if (entry.data) {
        currentMap[subId] = entry.data;
      }
      if (doesSubjectNeedDeepFetch(r as AttRow & Record<string, unknown>, entry.data, entry.updatedAt, entry.checksum)) {
        toFetch.push(r as AttRow & Record<string, unknown>);
      }
    }

    setDetailsMap((prev) => ({ ...prev, ...currentMap }));

    if (toFetch.length > 0 && getSessionStatus() !== "expired" && isCacheGenerationCurrent(generation)) {
      const base = {
        stynumber: initial?.header?.stynumber,
        registrationid: initial?.semesters?.[0]?.registrationid,
        registrationcode: initial?.semesters?.[0]?.registrationcode,
      };

      const queue = [...toFetch];
      const concurrency = 4;
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length > 0 && isLive && !isAborted && getSessionStatus() !== "expired" && isCacheGenerationCurrent(generation)) {
          const r = queue.shift();
          if (!r) break;
          const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
          try {
            const data = await features.getSubjectAttendanceAll(client, session, r, base, "current");
            if (isMounted.current && data && isCacheGenerationCurrent(generation) && getSessionStatus() !== "expired") {
              setCachedSubjectDetail(session, semId, r, data);
              setDetailsMap((prev) => ({ ...prev, [subId]: data }));
            }
          } catch (err: unknown) {
            const code = (err as { code?: string })?.code;
            const status = (err as { status?: number })?.status;
            if (code === "SESSION_EXPIRED" || status === 401 || getSessionStatus() === "expired") {
              isAborted = true;
              queue.length = 0;
              break;
            }
          }
        }
      });

      Promise.all(workers);
    }

    return () => {
      isLive = false;
      isAborted = true;
    };
  }, [rows, semId, isDefault, isExpired, initial, session]);

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    if (shouldThrottleRefresh("dashboard")) {
      spinBriefly();
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      spinBriefly();
      return;
    }

    setIsRefreshing(true);
    setJustSynced(false);
    resetTabScroll("home");
    try {
      window.dispatchEvent(new CustomEvent("juet:refresh-dashboard"));
      att.refetch();
      if (isDefault) {
        detail.refetch();
      }
      if (getSessionStatus() !== "expired") {
        recordRefreshAttempt("dashboard");
      }
      const now = Date.now();
      try {
        localStorage.setItem("juet.portal.last_sync", String(now));
      } catch {}
      setLastSync(now);
      setJustSynced(true);
      setTimeout(() => {
        if (isMounted.current) setJustSynced(false);
      }, 15000);

      // Replay attendance load choreography on explicit refresh
      setShouldAnimateChoreography(true);
      setBarsReady(false);
      requestAnimationFrame(() => {
        setBarsReady(true);
      });
    } finally {
      spinBriefly();
    }
  }, [isRefreshing, spinBriefly, att, detail, isDefault]);

  const processedSubjects = useMemo(() => {
    const list: ProcessedSubjectItem[] = [];

    for (const r of rows) {
      const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
      const code = extractSubjectCode(r.subjectcode || r.individualsubjectcode);
      const name = extractSubjectName(r.subjectcode);
      const goal = getSubjectGoal(code, goalsConfig);

      const detailData = detailsMap[subId];
      const combined = combinedAttendance(r, detailData);

      let attended = combined.totalPresent;
      let conducted = combined.totalClasses;

      if (conducted === 0 && combined.pctNum !== null && combined.hasHeldClasses) {
        conducted = 100;
        attended = Math.round(combined.pctNum);
      }

      const statusResult = calculateAttendanceStatus(attended, conducted, goal);

      list.push({
        id: subId,
        name: name || code || "Subject",
        code,
        attended: statusResult.attended,
        conducted: statusResult.conducted,
        percentage: statusResult.percentage,
        formattedPercentage: statusResult.formattedPercentage,
        goal,
        status: statusResult.status,
        statusLabel: statusResult.statusLabel,
        actionText: statusResult.actionText,
        classesNeeded: statusResult.classesNeeded,
        classesCanSkip: statusResult.classesCanSkip,
        row: r as AttRow & Record<string, unknown>,
      });
    }

    return sortSubjectsByAttendance(list);
  }, [rows, detailsMap, goalsConfig]);

  const overallSummary = useMemo(() => {
    return computeOverallAttendance(processedSubjects);
  }, [processedSubjects]);

  const institutes = (session.institutelist as InstituteOption[] | undefined) ?? [];
  const firstName = getFirstName(session.name ?? session.enrollmentno);
  const hasBelowGoal = overallSummary.belowGoalCount > 0;

  const ringStatus = useMemo(() => {
    if (overallSummary.totalConducted === 0 || overallSummary.percentage == null) return "safe";
    const target = goalsConfig.defaultGoal;
    const pct = overallSummary.percentage;
    if (pct >= target) return "safe";
    if (pct >= target - 3) return "warning";
    return "below";
  }, [overallSummary.totalConducted, overallSummary.percentage, goalsConfig.defaultGoal]);

  useEffect(() => {
    if (processedSubjects.length > 0 && !hasPlayedChoreography) {
      setHasPlayedChoreography(true);
      setShouldAnimateChoreography(true);
    }
  }, [processedSubjects.length, hasPlayedChoreography]);

  useEffect(() => {
    if (processedSubjects.length === 0) return;

    const { transitions, nextStatusMap, isFirstRun } = detectStatusTransitions(processedSubjects);
    saveLastStatusMap(nextStatusMap);

    if (!isFirstRun && transitions.length > 0) {
      dispatchAttendanceAlertIfNeeded(transitions);
    }

    const belowSubjects = processedSubjects
      .filter((s) => s.status === "below")
      .map((s) => ({
        name: s.name,
        percentage: s.percentage,
        goal: s.goal,
      }));
    syncDailyReminder(belowSubjects);
  }, [processedSubjects]);

  useEffect(() => {
    if (overallSummary.totalConducted > 0 || overallSummary.formattedPercentage !== "0.0%") {
      const widgetPayload = {
        percentage: overallSummary.formattedPercentage,
        attended: overallSummary.totalAttended,
        conducted: overallSummary.totalConducted,
        sentence: overallSummary.statusSentence,
        isSafe: !hasBelowGoal,
        updatedAt: Date.now(),
      };
      try {
        localStorage.setItem("juet.portal.live_widget_data", JSON.stringify(widgetPayload));
      } catch {}
      const nativeBridge = (
        window as unknown as {
          AndroidWidgetBridge?: {
            updateWidget: (pct: string, classes: string, status: string, isSafe: boolean) => void;
          };
        }
      ).AndroidWidgetBridge;
      if (nativeBridge && typeof nativeBridge.updateWidget === "function") {
        try {
          const classesStr = `${overallSummary.totalAttended} / ${overallSummary.totalConducted} classes`;
          nativeBridge.updateWidget(
            overallSummary.formattedPercentage,
            classesStr,
            overallSummary.statusSentence,
            !hasBelowGoal
          );
        } catch {}
      }
    }
  }, [overallSummary, hasBelowGoal]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { handleScroll: handleTabScroll } = useTabScroll("home", scrollContainerRef);
  const [isCompact, setIsCompact] = useState(false);
  const scrollRaf = useRef<number | null>(null);

  const handleContainerScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    handleTabScroll(e);
    const top = e.currentTarget.scrollTop;
    if (scrollRaf.current !== null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      setIsCompact(top > 8);
      scrollRaf.current = null;
    });
  }, [handleTabScroll]);

  // Pull-to-refresh
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const canPull = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const el = scrollContainerRef.current;
    if (el && el.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      canPull.current = true;
    } else {
      canPull.current = false;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!canPull.current || isRefreshing) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) {
      const damped = Math.min(64, diff * 0.42);
      setPullDistance(damped);
    } else {
      setPullDistance(0);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= 44 && !isRefreshing) {
      handleRefresh();
    }
    setPullDistance(0);
    canPull.current = false;
  }, [pullDistance, isRefreshing, handleRefresh]);

  return (
    <main className="dash dash-view-enter">
      <header className={`dash-top-bar ${isCompact ? "is-compact" : ""}`} aria-label="Dashboard header">
        <div className="dash-user-meta">
          <div className="dash-title-row">
            <h1 className="dash-user-name" data-home-heading="true" tabIndex={-1}>{firstName}</h1>
          </div>
          <div className="dash-user-sub">
            <span className="dash-sync-time">
              {isRefreshing ? (
                <>
                  <span className="sync-pulse-dot" aria-hidden="true" /> Syncing…
                </>
              ) : justSynced ? (
                "Synced just now"
              ) : lastSync ? (
                formatLastSync(lastSync)
              ) : (
                "Not synced yet"
              )}
            </span>
            {institutes.length > 1 && (
              <select
                value={String(session.instituteid ?? "")}
                onChange={(e) => onSelectInstitute(e.target.value)}
                className="dash-institute-select"
                aria-label="Select Institute"
              >
                {institutes.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {String(o.label ?? o.value)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="dash-top-actions">
          {isExpired && !isRecovering && (
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("juet:request-renew"));
              }}
              className="m3-reconnect-pill"
              title="Session expired — tap to reconnect"
            >
              <Wifi size={14} />
              <span>Reconnect</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            className={`dash-refresh-btn ${isRefreshing ? "is-spinning" : ""}`}
            aria-label="Refresh attendance data"
            disabled={isRefreshing}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <div
        className="dash-scroll-container"
        ref={scrollContainerRef}
        onScroll={handleContainerScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          className={`pull-to-refresh-indicator ${isRefreshing ? "is-refreshing" : ""}`}
          style={{
            height: isRefreshing ? "36px" : `${pullDistance}px`,
            opacity: isRefreshing ? 1 : Math.min(1, pullDistance / 32),
          }}
          aria-hidden="true"
        >
          <div
            className={`pull-refresh-spinner ${isRefreshing ? "is-spinning" : ""}`}
            style={{ transform: isRefreshing ? undefined : `rotate(${pullDistance * 6}deg)` }}
          >
            <RefreshCw size={16} />
          </div>
        </div>

        {!isOnline && (
          <div className="offline-status-banner" role="status">
            <WifiOff size={14} />
            <span>You are offline. Showing cached data {lastSync ? `from ${formatLastSync(lastSync).replace(/^Synced\s*/i, "")}` : ""}.</span>
            <button type="button" onClick={handleRefresh} className="offline-retry-btn">
              Retry
            </button>
          </div>
        )}

        <div className="attendance-home-content">
        {showSkeleton ? (
          <>
            <div className="summary-card-skeleton" aria-hidden="true">
              <div className="skeleton-ring-row">
                <div className="skeleton-circle skeleton-shimmer" style={{ width: "88px", height: "88px" }} />
                <div className="skeleton-meta-col">
                  <div className="skeleton-text-sm skeleton-shimmer" style={{ width: "90px" }} />
                  <div className="skeleton-text-lg skeleton-shimmer" style={{ width: "140px" }} />
                  <div className="skeleton-pill skeleton-shimmer" />
                </div>
              </div>
              <div className="skeleton-slim-row">
                <div className="skeleton-pill skeleton-shimmer" style={{ width: "100px", height: "28px" }} />
                <div className="skeleton-pill skeleton-shimmer" style={{ width: "110px", height: "28px" }} />
              </div>
            </div>

            <div className="attendance-skeleton-list" aria-label="Loading attendance records" role="status">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div key={idx} className="attendance-row-skeleton">
                  <div className="skeleton-row-top">
                    <div className="skeleton-line title skeleton-shimmer" />
                    <div className="skeleton-line pill skeleton-shimmer" />
                  </div>
                  <div className="skeleton-line bar skeleton-shimmer" />
                  <div className="skeleton-line subtitle skeleton-shimmer" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <section className="attendance-summary-ring-card" aria-label="Attendance Summary">
            <div className="summary-ring-main">
              <div className="summary-ring-graphic" aria-hidden="true">
                <svg className="summary-ring-svg" viewBox="0 0 88 88" width="88" height="88">
                  <circle
                    className="summary-ring-bg"
                    cx="44"
                    cy="44"
                    r={36}
                  />
                  <circle
                    className={`summary-ring-fill is-${ringStatus}`}
                    cx="44"
                    cy="44"
                    r={36}
                    strokeDasharray={226.19}
                    style={{
                      strokeDashoffset:
                        226.19 * (1 - Math.min(100, Math.max(0, overallSummary.percentage ?? 0)) / 100),
                    }}
                  />
                </svg>
                <div className="summary-ring-center">
                  <AnimatedPercentage
                    value={overallSummary.percentage}
                    shouldAnimate={shouldAnimateChoreography}
                  />
                </div>
              </div>

              <div className="summary-ring-meta">
                <span className="summary-overall-label">Overall attendance</span>
                <div className="summary-classes-count">
                  {overallSummary.totalConducted > 0
                    ? `${overallSummary.totalAttended} of ${overallSummary.totalConducted} classes`
                    : "No classes conducted"}
                </div>
                <div className="summary-badge-wrap">
                  {hasBelowGoal ? (
                    <span className="summary-status-pill status-below">
                      <AlertTriangle size={13} aria-hidden="true" />
                      <span>{overallSummary.belowGoalCount} {overallSummary.belowGoalCount === 1 ? "subject" : "subjects"} below goal</span>
                    </span>
                  ) : overallSummary.totalConducted > 0 ? (
                    <span className="summary-status-pill status-on_track">
                      <CheckCircle2 size={13} aria-hidden="true" />
                      <span>All subjects on track</span>
                    </span>
                  ) : (
                    <span className="summary-status-pill status-neutral">
                      <span>No classes held</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="summary-slim-footer">
              <button
                type="button"
                className="summary-goal-chip"
                onClick={() => setShowGoalSheet(true)}
                aria-label={`Target attendance ${goalsConfig.defaultGoal} percent. Tap to adjust goal.`}
              >
                <span>Target {goalsConfig.defaultGoal}%</span>
                <ChevronRight size={13} className="summary-goal-chevron" />
              </button>
              <button
                type="button"
                className="summary-bunk-calc-btn"
                onClick={() => setShowCalculator(true)}
                aria-label="Open Bunk Calculator"
              >
                <Calculator size={14} aria-hidden="true" />
                <span>Bunk calculator</span>
              </button>
            </div>
          </section>
        )}

        {error && rows.length === 0 && !showSkeleton && (
          <SectionError
            label="Attendance"
            error={error}
            retry={() => {
              att.retry();
              detail.retry();
            }}
          />
        )}

        {!showSkeleton && !loading && processedSubjects.length === 0 && !error && (
          <div className="empty-attendance-view">
            <p className="empty-attendance-title">No attendance records found</p>
            <p className="empty-attendance-sub">
              Your registered subjects or attendance logs may not be published for this term yet.
            </p>
          </div>
        )}

        {!showSkeleton && processedSubjects.length > 0 && (
          <section className="attendance-subject-group" aria-label="Course Attendance Breakdown">
            <div className="attendance-subject-list" role="list">
              {processedSubjects.map((sub, idx) => {
                const isBelow = sub.status === "below";
                const isClose = sub.status === "close";
                const barFillWidth = sub.percentage != null ? Math.min(100, Math.max(0, sub.percentage)) : 0;
                const tickLeft = Math.min(100, Math.max(0, sub.goal));

                return (
                  <button
                    key={sub.id}
                    type="button"
                    className={`attendance-subject-row ${shouldAnimateChoreography ? "is-choreographed" : ""}`}
                    style={{
                      animationDelay: shouldAnimateChoreography ? `${Math.min(idx, 7) * 70}ms` : undefined,
                    }}
                    onClick={() => setSelectedSubject(sub)}
                    aria-label={`${sub.name}, ${sub.formattedPercentage}, ${sub.statusLabel}`}
                  >
                    <div className="sub-row-line-1">
                      <div className="sub-name-block">
                        <span className="sub-name-text">{sub.name}</span>
                        {sub.code && <span className="sub-code-text">{sub.code}</span>}
                      </div>
                      <span className={`sub-percent-val status-${sub.status}`}>
                        {sub.formattedPercentage}
                      </span>
                    </div>

                    <div className="sub-progress-container" aria-hidden="true">
                      <div className="sub-progress-track">
                        <div
                          className={`sub-progress-bar status-${sub.status}`}
                          style={{
                            width: `${barFillWidth}%`,
                            transition: shouldAnimateChoreography
                              ? `width 800ms var(--ease-reveal) ${Math.min(idx, 7) * 50}ms`
                              : "width 250ms ease",
                          }}
                        />
                        <div
                          className="sub-goal-tick"
                          style={{ left: `${tickLeft}%` }}
                          title={`Goal: ${sub.goal}%`}
                        />
                      </div>
                    </div>

                    <div className="sub-row-line-3">
                      <div className="sub-counts-and-action">
                        <span className="sub-attended-count">
                          {sub.conducted > 0 ? `${sub.attended} / ${sub.conducted} attended` : "0 classes"}
                        </span>
                        {sub.actionText && (
                          <>
                            <span className="sub-action-bullet" aria-hidden="true">·</span>
                            <span className="sub-action-sentence">{sub.actionText}</span>
                          </>
                        )}
                      </div>
                      {(isBelow || isClose) && (
                        <div className={`sub-status-badge status-${sub.status}`}>
                          {isBelow && <AlertTriangle size={13} aria-hidden="true" />}
                          {isClose && <AlertCircle size={13} aria-hidden="true" />}
                          <span>{sub.statusLabel}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        </div>

        <footer className="dash-footer">
          <span className="peri-watermark">peri-peri</span>
        </footer>
      </div>

      {selectedSubject && (
        <SubjectDetailBottomSheet
          row={selectedSubject.row}
          registrationid={initial?.semesters?.[0]?.registrationid}
          registrationcode={initial?.semesters?.[0]?.registrationcode}
          session={session}
          attended={selectedSubject.attended}
          conducted={selectedSubject.conducted}
          onClose={() => setSelectedSubject(null)}
          onGoalChange={() => setGoalsConfig(loadGoalsConfig())}
        />
      )}

      {showCalculator && (
        <AttendanceCalculatorSheet
          session={session}
          initialGoal={goalsConfig.defaultGoal}
          onClose={() => setShowCalculator(false)}
          onGoalSaved={(g) => {
            setGoalsConfig((prev) => ({ ...prev, defaultGoal: g }));
          }}
        />
      )}

      {showGoalSheet && (
        <AttendanceSettingsSheet
          onClose={() => setShowGoalSheet(false)}
          onSaved={() => setGoalsConfig(loadGoalsConfig())}
        />
      )}
    </main>
  );
}
