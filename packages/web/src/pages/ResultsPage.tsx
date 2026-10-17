import { useState, useEffect, useRef, useMemo } from "react";
import {
  RefreshCw,
  Wifi,
  WifiOff,
  AlertCircle,
  ArrowUpDown,
  BookOpen,
  Award,
  ChevronDown,
} from "lucide-react";
import { features } from "@juet/core";
import { client, getSessionStatus } from "../lib/portal";
import { useFeature, sessionCacheKey } from "../hooks/useFeature";
import { useSemester } from "../hooks/useSemester";
import { FEATURE_TTL } from "../lib/portalSchedule";
import {
  formatLastSync,
  shouldThrottleRefresh,
  recordRefreshAttempt,
  titleCase,
  formatSemester,
} from "../components/DataViews";
import { ReconnectModal } from "../components/ReconnectModal";
import { useTabScroll, resetTabScroll } from "../lib/tabScroll";
import {
  formatEventCode,
  formatEventDesc,
  parseMarks,
  calculateMarksSummary,
  isLowScore,
  LOW_SCORE_THRESHOLD,
} from "../lib/marks";
import {
  MarksSubjectDetailSheet,
  type SubjectMarksDetail,
} from "../components/MarksSubjectDetailSheet";
import type { Session, Semester } from "../types";

export interface MarkRow {
  subjectcode?: string;
  subjectdesc?: string;
  eventcode?: string;
  fullmarks?: string | number;
  obtainedmarks?: string | number;
  [key: string]: unknown;
}

interface MarksDetail {
  rows: MarkRow[];
}

interface MarksLatest extends MarksDetail {
  semesters: Semester[];
  registrationcode?: string | null;
}

interface SgpaItem {
  stynumber?: string | number;
  sgpa?: string | number;
  cgpa?: string | number;
  earnedcredit?: string | number;
  points?: string | number;
}

interface GradeRow {
  subjectcode?: string;
  subjectdesc?: string;
  grade?: string;
  earnedcredit?: string | number;
  gradepoint?: string | number;
  minorsubject?: string;
}

interface GradeInfo {
  branchid?: string;
  programid?: string;
}

export function ResultsPage({
  session,
  isExpired,
  isRecovering,
  onLogout: _onLogout,
  onSessionRenewed,
}: {
  session: Session;
  isExpired?: boolean;
  isRecovering?: boolean;
  onLogout: () => void;
  onSessionRenewed?: (s: Session) => void;
}) {
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [sortOrder, setSortOrder] = useState<"lowest" | "highest">("lowest");
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState<SubjectMarksDetail | null>(null);

  const isMounted = useRef(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useTabScroll("results", scrollContainerRef);

  // Online / Offline tracking
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const spinBriefly = () => {
    setIsRefreshing(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      if (isMounted.current) setIsRefreshing(false);
    }, 600);
  };

  useEffect(() => {
    if (isRecovering || !isExpired) setShowRenewModal(false);
  }, [isExpired, isRecovering]);

  const [lastSync, setLastSync] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem("juet.portal.last_sync");
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    isMounted.current = true;
    const update = () => {
      try {
        const raw = localStorage.getItem("juet.portal.last_sync");
        if (raw) setLastSync(Number(raw));
      } catch {}
      if (isMounted.current) setIsRefreshing(false);
    };
    window.addEventListener("storage", update);
    window.addEventListener("juet:sync", update);
    return () => {
      isMounted.current = false;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      window.removeEventListener("storage", update);
      window.removeEventListener("juet:sync", update);
    };
  }, []);

  // 1. Marks data fetching
  const marksLov = useFeature<MarksLatest>({
    run: () => features.getMarksLatest(client, session),
    deps: [session],
    cacheKey: sessionCacheKey("marks.latest", session),
    staleTimeMs: FEATURE_TTL.marks,
  });

  const [semId, setSemId, sem] = useSemester(
    sessionCacheKey("semester", session, "marks"),
    marksLov.data?.semesters
  );
  const isDefault = semId === String(marksLov.data?.semesters?.[0]?.registrationid);

  const marksDetail = useFeature<MarksDetail>({
    run: () => features.getMarks(client, session, { registrationid: sem?.registrationid }),
    deps: [session, semId],
    enabled: sem !== null && !isDefault,
    cacheKey: semId ? sessionCacheKey("marks.detail", session, semId) : undefined,
    staleTimeMs: FEATURE_TTL.marks,
  });

  // 2. SGPA / CGPA data fetching
  const sgpaFeature = useFeature<{ student: unknown; currentsem?: string | null; semesters: SgpaItem[] }>({
    run: () => features.getSgpaLatest(client, session),
    deps: [session],
    cacheKey: sessionCacheKey("cgpa.latest", session),
    staleTimeMs: FEATURE_TTL.marks,
  });

  // 3. Grades data fetching (displayed below list when data exists)
  const gradesLov = useFeature<{
    info: GradeInfo | null;
    semesters: Semester[];
    registrationcode?: string | null;
    rows: GradeRow[];
  }>({
    run: () => features.getGradesLatest(client, session),
    deps: [session],
    cacheKey: sessionCacheKey("grades.lov", session),
    staleTimeMs: FEATURE_TTL.marks,
  });

  const marksLoading = marksLov.loading || marksDetail.loading;
  const marksError = marksLov.error ?? marksDetail.error;
  const retryMarks = marksLov.error ? marksLov.retry : marksDetail.retry;

  // Exact shape skeleton logic: 150ms delay, min 300ms display
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonShownAt = useRef<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (marksLoading) {
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
  }, [marksLoading, showSkeleton]);

  // Handle compact header on scroll
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const compact = el.scrollTop > 8;
    setIsCompact((prev) => (prev !== compact ? compact : prev));
  };

  const handleRefresh = () => {
    if (isRefreshing) return;
    if (shouldThrottleRefresh("results")) {
      spinBriefly();
      return;
    }
    setIsRefreshing(true);
    resetTabScroll("results");
    try {
      window.dispatchEvent(new CustomEvent("juet:refresh-dashboard"));
      marksLov.refetch();
      if (!isDefault) marksDetail.refetch();
      sgpaFeature.refetch();
      gradesLov.refetch();

      if (getSessionStatus() !== "expired") {
        recordRefreshAttempt("results");
      }
      const now = Date.now();
      try {
        localStorage.setItem("juet.portal.last_sync", String(now));
      } catch {}
      setLastSync(now);
    } finally {
      spinBriefly();
    }
  };

  const rawRows = isDefault ? (marksLov.data?.rows ?? []) : (marksDetail.data?.rows ?? []);
  const semestersList = marksLov.data?.semesters ?? [];

  // SGPA and CGPA computations
  const sgpaSemesters = sgpaFeature.data?.semesters ?? [];
  const latestSem = sgpaSemesters.length > 0 ? sgpaSemesters[sgpaSemesters.length - 1] : null;
  const currentCgpa = latestSem?.cgpa != null ? Number(latestSem.cgpa) : null;
  const latestSgpa = latestSem?.sgpa != null ? Number(latestSem.sgpa) : null;
  const totalEarnedCredits = useMemo(() => {
    return sgpaSemesters.reduce((sum, s) => sum + (Number(s.earnedcredit) || 0), 0);
  }, [sgpaSemesters]);

  // Extract dynamic event components from raw marks
  const availableEvents = useMemo(() => {
    const set = new Set<string>();
    for (const r of rawRows) {
      const code = formatEventCode(r.eventcode);
      if (code) set.add(code);
    }
    const list = Array.from(set);
    list.sort((a, b) => {
      const aT = a.startsWith("T");
      const bT = b.startsWith("T");
      if (aT && !bT) return -1;
      if (!aT && bT) return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    return list;
  }, [rawRows]);

  // Keep activeFilter valid
  const effectiveFilter = availableEvents.includes(activeFilter) ? activeFilter : "All";

  // Filter rows by component
  const filteredRows = useMemo(() => {
    if (effectiveFilter === "All") return rawRows;
    return rawRows.filter((r) => formatEventCode(r.eventcode) === effectiveFilter);
  }, [rawRows, effectiveFilter]);

  // Summary computed from the current filtered data
  const summary = useMemo(() => {
    return calculateMarksSummary(filteredRows);
  }, [filteredRows]);

  // Process rows with percentages, low score flags, and sorting
  const processedRows = useMemo(() => {
    const list = filteredRows.map((r, index) => {
      const obt = parseMarks(r.obtainedmarks);
      const full = parseMarks(r.fullmarks);
      const hasMarks = obt !== null && full !== null && full > 0;
      const percentage = hasMarks ? Math.round((obt / full) * 1000) / 10 : null;
      const isLow = isLowScore(percentage, LOW_SCORE_THRESHOLD);
      const eventCode = formatEventCode(r.eventcode);
      const eventDesc = formatEventDesc(r.eventcode);
      const subjectDesc = titleCase(r.subjectdesc ?? r.subjectcode ?? "Subject");

      return {
        id: `${r.subjectcode ?? ""}-${r.eventcode ?? ""}-${index}`,
        row: r,
        subjectCode: r.subjectcode ?? "",
        subjectDesc,
        eventCode,
        eventDesc,
        obt,
        full,
        percentage,
        isLow,
      };
    });

    list.sort((a, b) => {
      const pctA = a.percentage !== null ? a.percentage : 9999;
      const pctB = b.percentage !== null ? b.percentage : 9999;
      if (sortOrder === "lowest") {
        if (pctA !== pctB) return pctA - pctB;
      } else {
        if (pctA !== pctB) return pctB - pctA;
      }
      return a.subjectDesc.localeCompare(b.subjectDesc);
    });

    return list;
  }, [filteredRows, sortOrder]);

  // Grades rows
  const gradesRows = gradesLov.data?.rows ?? [];

  // Tapping a row opens detail bottom sheet
  const handleRowClick = (item: (typeof processedRows)[0]) => {
    const code = item.subjectCode;
    const desc = item.row.subjectdesc ?? item.subjectCode;
    const matchingRows = rawRows.filter(
      (r) =>
        (code && r.subjectcode === code) ||
        (desc && r.subjectdesc === desc)
    );
    const gradeMatch = gradesRows.find(
      (g) =>
        (code && g.subjectcode === code) ||
        (desc && g.subjectdesc === desc)
    );

    setSelectedSubjectDetail({
      subjectcode: code,
      subjectdesc: desc,
      credits: gradeMatch?.earnedcredit,
      components: matchingRows.map((r) => ({
        eventcode: r.eventcode ?? "",
        obtainedmarks: r.obtainedmarks,
        fullmarks: r.fullmarks,
      })),
    });
  };

  const renewModal =
    showRenewModal && onSessionRenewed ? (
      <ReconnectModal
        session={session}
        onRenewed={(s) => {
          setShowRenewModal(false);
          onSessionRenewed(s);
        }}
        onClose={() => setShowRenewModal(false)}
      />
    ) : null;

  // Ring drawing math (radius 35, circumference ~ 219.91)
  const ringRadius = 35;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringPct = summary.percentage !== null ? Math.min(100, Math.max(0, summary.percentage)) : 0;
  const ringDashOffset = ringCircumference - (ringPct / 100) * ringCircumference;
  const isRingLow = summary.percentage !== null && summary.percentage < LOW_SCORE_THRESHOLD;

  // Format header subtitle (prevent "Synced Synced today")
  const syncLabel = lastSync
    ? formatLastSync(lastSync).replace(/^Synced\s*/i, "Synced ")
    : "Marks & evaluations";

  return (
    <main className="dash dash-view-enter">
      <header className={`dash-top-bar ${isCompact ? "is-compact" : ""}`}>
        <div className="dash-user-meta">
          <h1 className="dash-user-name">Results</h1>
          <div className="dash-user-sub">
            <span className="dash-sync-time">
              {isRefreshing ? (
                <>
                  <span className="sync-pulse-dot" aria-hidden="true" /> Refreshing…
                </>
              ) : (
                syncLabel
              )}
            </span>
            {semestersList.length > 1 && (
              <select
                value={semId ?? ""}
                onChange={(e) => setSemId(e.target.value)}
                disabled={marksLoading}
                className="results-header-sem-select"
                aria-label="Select Semester"
              >
                {semestersList.map((s) => (
                  <option key={String(s.registrationid)} value={String(s.registrationid)}>
                    {formatSemester(s.registrationcode ?? s.registrationdesc)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="dash-top-actions">
          {isExpired && !isRecovering && (
            <button
              onClick={() => setShowRenewModal(true)}
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
            aria-label="Refresh results data"
            disabled={isRefreshing}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <div
        className="dash-scroll-container"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {!isOnline && (
          <div className="offline-status-banner" role="status">
            <WifiOff size={14} />
            <span>
              You are offline. Showing cached results {lastSync ? `from ${formatLastSync(lastSync).replace(/^Synced\s*/i, "")}` : ""}.
            </span>
            <button type="button" onClick={handleRefresh} className="offline-retry-btn">
              Retry
            </button>
          </div>
        )}

        {marksError && !rawRows.length && (
          <div className="results-error-banner" role="alert">
            <AlertCircle size={16} />
            <div className="error-banner-text">
              <span className="error-banner-title">Could not load marks</span>
              <span className="error-banner-sub">{marksError.message || "Network issue"}</span>
            </div>
            <button type="button" onClick={retryMarks} className="error-retry-btn">
              Retry
            </button>
          </div>
        )}

        {showSkeleton ? (
          <div className="results-skeleton-layout" aria-label="Loading results" role="status">
            <div className="results-summary-skeleton skeleton-shimmer">
              <div className="skel-ring-part" />
              <div className="skel-meta-part">
                <div className="skel-line w-60" />
                <div className="skel-line w-80" />
              </div>
            </div>
            <div className="results-segmented-skeleton skeleton-shimmer" />
            <div className="results-rows-skeleton">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="results-row-skel skeleton-shimmer" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 2. Summary Card */}
            <section className="results-summary-card" aria-label="Evaluation Marks Summary">
              <div className="results-summary-main">
                <div className="results-ring-wrapper" aria-hidden="true">
                  <svg
                    className="results-ring-svg"
                    viewBox="0 0 88 88"
                    width="88"
                    height="88"
                    role="img"
                    aria-label={`Overall marks: ${summary.percentage !== null ? `${summary.percentage}%` : "Not published"}`}
                  >
                    <circle
                      className="results-ring-bg"
                      cx="44"
                      cy="44"
                      r={ringRadius}
                      strokeWidth="8"
                    />
                    <circle
                      className={`results-ring-fill ${isRingLow ? "is-low" : ""}`}
                      cx="44"
                      cy="44"
                      r={ringRadius}
                      strokeWidth="8"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringDashOffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="results-ring-center">
                    <span className="results-ring-pct">
                      {summary.percentage !== null ? Math.round(summary.percentage) : "—"}
                    </span>
                    <span className="results-ring-unit">%</span>
                  </div>
                </div>

                <div className="results-summary-meta">
                  <span className="results-meta-label">Marks so far</span>
                  <div className="results-meta-sub">
                    {summary.totalFull > 0 ? (
                      <>
                        <strong>{summary.totalObtained}</strong> of <strong>{summary.totalFull}</strong> marks
                        <span className="results-meta-sep">·</span>
                        <span>{summary.subjectsCount} subjects</span>
                      </>
                    ) : (
                      <span>No marks published yet</span>
                    )}
                  </div>
                  {currentCgpa !== null && (
                    <div className="results-cgpa-pill">
                      <Award size={12} />
                      <span>CGPA: {currentCgpa.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="results-stats-divider" />

              <div className="results-stats-grid">
                <div className="results-stat-col">
                  <span className="results-stat-label">Latest SGPA</span>
                  {latestSgpa !== null ? (
                    <span className="results-stat-val large">{latestSgpa.toFixed(2)}</span>
                  ) : (
                    <div className="results-stat-empty">
                      <span className="results-stat-val muted">—</span>
                      <span className="results-stat-sub">Not published yet</span>
                    </div>
                  )}
                </div>

                <div className="results-stat-col">
                  <span className="results-stat-label">Earned credits</span>
                  {totalEarnedCredits > 0 ? (
                    <span className="results-stat-val large">{totalEarnedCredits}</span>
                  ) : (
                    <div className="results-stat-empty">
                      <span className="results-stat-val muted">—</span>
                      <span className="results-stat-sub">Not published yet</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 4. Segmented Control */}
            {availableEvents.length > 0 && (
              <div className="results-segmented-wrap" role="tablist" aria-label="Filter evaluations">
                <div className="results-segmented-control">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveFilter === "All"}
                    className={`results-segment-btn ${effectiveFilter === "All" ? "is-active" : ""}`}
                    onClick={() => setActiveFilter("All")}
                  >
                    All
                  </button>
                  {availableEvents.map((ev) => (
                    <button
                      key={ev}
                      type="button"
                      role="tab"
                      aria-selected={effectiveFilter === ev}
                      className={`results-segment-btn ${effectiveFilter === ev ? "is-active" : ""}`}
                      onClick={() => setActiveFilter(ev)}
                    >
                      {formatEventDesc(ev) || ev}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 5. List Header with 48px Sort Toggle */}
            <div className="results-list-header">
              <span className="results-list-title">Subjects</span>
              <button
                type="button"
                className="results-sort-toggle-btn"
                onClick={() => setSortOrder((prev) => (prev === "lowest" ? "highest" : "lowest"))}
                aria-label={`Sort subjects by score, currently ${sortOrder === "lowest" ? "lowest first" : "highest first"}`}
              >
                <ArrowUpDown size={14} />
                <span>{sortOrder === "lowest" ? "Lowest first" : "Highest first"}</span>
              </button>
            </div>

            {/* 6. Subject Rows in Grouped List Card */}
            {processedRows.length > 0 ? (
              <div className="results-grouped-card" role="list" aria-label="Subject evaluation marks">
                {processedRows.map((item, idx) => (
                  <div
                    key={item.id}
                    role="listitem"
                    className="results-subject-row"
                    onClick={() => handleRowClick(item)}
                    style={{ "--row-idx": Math.min(idx, 8) } as React.CSSProperties}
                  >
                    <div className="results-row-main">
                      <div className="results-row-left">
                        <span className="results-sub-title">{item.subjectDesc}</span>
                        <span className="results-sub-code-comp">
                          {item.subjectCode ? `${item.subjectCode} · ` : ""}
                          {item.eventDesc || item.eventCode || "Evaluation"}
                        </span>
                      </div>

                      <div className="results-row-right">
                        <span className={`results-marks-obtained ${item.isLow ? "is-low" : ""}`}>
                          {item.obt !== null ? String(item.obt) : "—"}
                        </span>
                        <span className="results-marks-full">
                          {item.full !== null ? ` / ${item.full}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="results-bar-track" aria-hidden="true">
                      <div
                        className={`results-bar-fill ${item.isLow ? "is-low" : ""}`}
                        style={{ width: `${Math.min(100, Math.max(0, item.percentage ?? 0))}%` }}
                      />
                    </div>

                    <div className="results-row-bottom">
                      <span className="results-row-pct">
                        {item.percentage !== null ? `${item.percentage.toFixed(1)}%` : "Not evaluated"}
                      </span>
                      {item.isLow && (
                        <span className="results-low-badge" role="status">
                          <AlertCircle size={12} />
                          <span>Low score</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="results-empty-card">
                <BookOpen size={28} className="results-empty-icon" />
                <p className="results-empty-title">No marks published yet</p>
                <p className="results-empty-sub">
                  Marks for this semester have not been released by the university evaluation office.
                </p>
              </div>
            )}

            {/* 7. Grades section below list when data exists */}
            {gradesRows.length > 0 && (
              <section className="results-grades-section" aria-label="Official Grades">
                <div className="results-section-header">
                  <span className="results-section-title">Grades</span>
                  {gradesLov.data?.registrationcode && (
                    <span className="results-section-badge">
                      {formatSemester(gradesLov.data.registrationcode)}
                    </span>
                  )}
                </div>

                <div className="results-grouped-card" role="list">
                  {gradesRows.map((g, idx) => (
                    <div key={idx} className="results-grade-row" role="listitem">
                      <div className="grade-row-left">
                        <span className="grade-row-title">{titleCase(g.subjectdesc ?? g.subjectcode ?? "")}</span>
                        {g.subjectcode && <span className="grade-row-code">{g.subjectcode}</span>}
                      </div>

                      <div className="grade-row-right">
                        {g.earnedcredit != null && (
                          <span className="grade-row-credits">{g.earnedcredit} cr</span>
                        )}
                        <span className="grade-badge-tag">{g.grade ?? "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* SGPA & CGPA Trend section if multiple semesters exist */}
            {sgpaSemesters.length > 1 && (
              <section className="results-history-section" aria-label="Academic History">
                <div className="results-section-header">
                  <span className="results-section-title">Academic History</span>
                </div>

                <div className="results-grouped-card">
                  <div className="results-history-grid">
                    {sgpaSemesters.map((s, idx) => {
                      const semNum = String(s.stynumber ?? idx + 1);
                      const isLatest = idx === sgpaSemesters.length - 1;
                      return (
                        <div key={semNum} className={`history-stat-cell ${isLatest ? "is-latest" : ""}`}>
                          <span className="history-sem-name">Sem {semNum}</span>
                          <span className="history-sgpa-val">
                            {s.sgpa != null ? Number(s.sgpa).toFixed(2) : "—"}
                          </span>
                          <span className="history-sub-label">
                            {s.earnedcredit ? `${s.earnedcredit} cr` : "SGPA"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            <footer className="dash-footer">
              <span className="peri-watermark">peri-peri</span>
            </footer>
          </>
        )}
      </div>

      {selectedSubjectDetail && (
        <MarksSubjectDetailSheet
          detail={selectedSubjectDetail}
          onClose={() => setSelectedSubjectDetail(null)}
          lowThreshold={LOW_SCORE_THRESHOLD}
        />
      )}

      {renewModal}
    </main>
  );
}
