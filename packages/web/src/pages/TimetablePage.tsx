import { useState, useEffect, useRef, useMemo } from "react";
import {
  RefreshCw,
  Wifi,
  Clock3,
  CalendarDays,
  MapPin,
  UserCheck,
  ChevronDown,
  ChevronRight,
  BookOpen,
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
  SectionError,
  titleCase,
  formatSemester,
  examTime,
  countdown,
} from "../components/DataViews";
import { ReconnectModal } from "../components/ReconnectModal";
import { useTabScroll, resetTabScroll } from "../lib/tabScroll";
import type { Session, Semester } from "../types";

interface ExamEvent {
  exameventid?: string;
  exameventdesc?: string;
}

interface ExamRow {
  datetime?: string;
  datetimefrom?: string;
  datetimeupto?: string;
  subjectdesc?: string;
  roomcode?: string;
  seatno?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type Weekday = typeof WEEKDAYS[number];

function getTodayWeekday(): Weekday {
  const day = new Date().getDay();
  switch (day) {
    case 1:
      return "Mon";
    case 2:
      return "Tue";
    case 3:
      return "Wed";
    case 4:
      return "Thu";
    case 5:
      return "Fri";
    case 6:
      return "Sat";
    default:
      return "Mon";
  }
}

function parseRowExamTime(r: ExamRow): number | null {
  return examTime(`${r.datetime ?? ""} ${r.datetimefrom ?? r.datetimeupto ?? ""}`.trim());
}

function formatExamDateTime(r: ExamRow): string {
  const date = r.datetime ?? "";
  let timeStr = "";
  if (r.datetimeupto && /to/i.test(r.datetimeupto)) {
    timeStr = r.datetimeupto;
  } else if (r.datetimefrom && r.datetimeupto) {
    timeStr = `${r.datetimefrom} to ${r.datetimeupto}`;
  } else {
    timeStr = r.datetimefrom ?? r.datetimeupto ?? "";
  }
  return [date, timeStr].filter(Boolean).join(" · ");
}

export function TimetablePage({
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
  const [activeTab, setActiveTab] = useState<"classes" | "exams">("classes");
  const [selectedDay, setSelectedDay] = useState<Weekday>(getTodayWeekday());
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPastExams, setShowPastExams] = useState(false);
  const isMounted = useRef(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleRefresh = () => {
    if (isRefreshing) return;
    if (shouldThrottleRefresh("timetable")) {
      spinBriefly();
      return;
    }
    setIsRefreshing(true);
    resetTabScroll("timetable");
    try {
      window.dispatchEvent(new CustomEvent("juet:refresh-dashboard"));
      if (getSessionStatus() !== "expired") {
        recordRefreshAttempt("timetable");
      }
    } finally {
      spinBriefly();
    }
  };

  const examSems = useFeature<Semester[]>({
    run: () => features.getExamSemesters(client, session),
    deps: [session],
    enabled: true,
    cacheKey: sessionCacheKey("exams.sems", session),
    staleTimeMs: FEATURE_TTL.exams,
  });

  const [examSemId, setExamSemId] = useSemester(
    sessionCacheKey("semester", session, "exams"),
    examSems.data
  );

  const examEvents = useFeature<ExamEvent[]>({
    run: () => features.getExamEvents(client, session, { registrationid: examSemId }),
    deps: [session, examSemId],
    enabled: examSemId !== null,
    cacheKey: examSemId ? sessionCacheKey("exams.events", session, examSemId) : undefined,
    staleTimeMs: FEATURE_TTL.exams,
  });

  const [examEventId, setExamEventId] = useState<string | null>(null);

  useEffect(() => {
    if (examSemId === null || !examEvents.data?.length) {
      if (examEventId !== null) setExamEventId(null);
      return;
    }
    const hasCurrent = examEvents.data.some((e) => String(e.exameventid) === examEventId);
    if (!hasCurrent) {
      const first = examEvents.data[0]?.exameventid;
      setExamEventId(first != null ? String(first) : null);
    }
  }, [examSemId, examEvents.data, examEventId]);

  const examRows = useFeature<ExamRow[]>({
    run: () =>
      features.getExamSchedule(client, session, {
        registrationid: examSemId,
        exameventid: examEventId,
      }),
    deps: [session, examSemId, examEventId],
    enabled: examSemId !== null && examEventId !== null,
    cacheKey:
      examSemId && examEventId
        ? sessionCacheKey("exams.rows", session, examSemId, examEventId)
        : undefined,
    staleTimeMs: FEATURE_TTL.exams,
  });

  const examsLoading = examSems.loading || examEvents.loading || examRows.loading;
  const examsError = examSems.error ?? examEvents.error ?? examRows.error;

  const { upcomingExams, pastExams } = useMemo(() => {
    const rows = examRows.data ?? [];
    const now = Date.now();
    const upcoming: (ExamRow & { timestamp: number | null })[] = [];
    const past: (ExamRow & { timestamp: number | null })[] = [];

    for (const r of rows) {
      const t = parseRowExamTime(r);
      if (t !== null && t < now) {
        past.push({ ...r, timestamp: t });
      } else {
        upcoming.push({ ...r, timestamp: t });
      }
    }

    upcoming.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    past.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    return { upcomingExams: upcoming, pastExams: past };
  }, [examRows.data]);

  const todayWeekday = getTodayWeekday();

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { handleScroll: handleTabScroll } = useTabScroll("timetable", scrollContainerRef);
  const [isCompact, setIsCompact] = useState(false);
  const scrollRaf = useRef<number | null>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    handleTabScroll(e);
    const top = e.currentTarget.scrollTop;
    if (scrollRaf.current !== null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      setIsCompact(top > 8);
      scrollRaf.current = null;
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

  return (
    <main className="dash dash-view-enter timetable-page-root">
      <header className={`dash-top-bar ${isCompact ? "is-compact" : ""}`}>
        <div className="dash-user-meta">
          <h1 className="dash-user-name">Timetable</h1>
          <div className="dash-user-sub">
            <span className="dash-sync-time">
              {isRefreshing ? (
                <>
                  <span className="sync-pulse-dot" aria-hidden="true" /> Refreshing…
                </>
              ) : lastSync ? (
                formatLastSync(lastSync)
              ) : (
                "Schedule & venues"
              )}
            </span>
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
            aria-label="Refresh timetable data"
            disabled={isRefreshing}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <div className="timetable-segmented-bar">
        <div className="timetable-segmented-control" role="tablist" aria-label="Schedule type">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "classes"}
            className={`timetable-segment-btn ${activeTab === "classes" ? "is-active" : ""}`}
            onClick={() => setActiveTab("classes")}
          >
            <Clock3 size={16} />
            <span>Classes</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "exams"}
            className={`timetable-segment-btn ${activeTab === "exams" ? "is-active" : ""}`}
            onClick={() => setActiveTab("exams")}
          >
            <CalendarDays size={16} />
            <span>Exams</span>
          </button>
        </div>
      </div>

      <div
        className="dash-content timetable-scroll-content"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {activeTab === "classes" && (
          <section className="timetable-classes-view" aria-label="Daily Classes">
            <div className="timetable-weekday-strip" role="tablist" aria-label="Day of week">
              {WEEKDAYS.map((day) => {
                const isSelected = selectedDay === day;
                const isToday = todayWeekday === day;
                return (
                  <button
                    key={day}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSelectedDay(day)}
                    className={`weekday-pill ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}`}
                  >
                    <span className="weekday-name">{day}</span>
                    {isToday && <span className="today-indicator" aria-hidden="true">•</span>}
                  </button>
                );
              })}
            </div>

            <div className="timetable-empty-card">
              <BookOpen size={28} className="timetable-empty-icon" />
              <p className="timetable-empty-title">
                {selectedDay === todayWeekday ? "No classes today" : `No classes on ${selectedDay}`}
              </p>
              <p className="timetable-empty-sub">
                Official daily class timetable is not published via the Webkiosk portal API. Check your batch schedule or departmental notice board for room allocations.
              </p>
            </div>
          </section>
        )}

        {activeTab === "exams" && (
          <section className="timetable-exams-view" aria-label="Exam Schedule">
            {(examSems.data && examSems.data.length > 1) || (examEvents.data && examEvents.data.length > 1) ? (
              <div className="timetable-filter-row">
                {examSems.data && examSems.data.length > 1 && (
                  <select
                    value={examSemId ?? ""}
                    onChange={(e) => {
                      setExamSemId(e.target.value);
                      setExamEventId(null);
                    }}
                    disabled={examsLoading}
                    className="timetable-select-picker"
                    aria-label="Select exam semester"
                  >
                    {examSems.data.map((s) => (
                      <option key={String(s.registrationid)} value={String(s.registrationid)}>
                        {formatSemester(s.registrationcode ?? s.registrationdesc)}
                      </option>
                    ))}
                  </select>
                )}

                {examEvents.data && examEvents.data.length > 1 && (
                  <select
                    value={examEventId ?? ""}
                    onChange={(e) => setExamEventId(e.target.value)}
                    disabled={examsLoading}
                    className="timetable-select-picker"
                    aria-label="Select exam event"
                  >
                    {examEvents.data.map((e) => (
                      <option key={String(e.exameventid)} value={String(e.exameventid)}>
                        {e.exameventdesc ?? String(e.exameventid)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : null}

            {examsLoading && (
              <div className="timetable-loading-card">
                <span className="sync-pulse-dot" aria-hidden="true" />
                <span>Loading exam schedules…</span>
              </div>
            )}

            {examsError && (
              <SectionError
                label="Exams"
                error={examsError}
                retry={() => {
                  examSems.retry();
                  examEvents.retry();
                  examRows.retry();
                }}
              />
            )}

            {!examsLoading && !examsError && upcomingExams.length === 0 && pastExams.length === 0 && (
              <div className="timetable-empty-card">
                <CalendarDays size={28} className="timetable-empty-icon" />
                <p className="timetable-empty-title">No exam schedule published</p>
                <p className="timetable-empty-sub">
                  No examination dates or seating plans have been published for this term yet.
                </p>
              </div>
            )}

            {upcomingExams.length > 0 && (
              <div className="timetable-exam-list" role="list" aria-label="Upcoming examinations">
                {upcomingExams.map((r, i) => {
                  const title = titleCase(r.subjectdesc ?? "");
                  const dtStr = formatExamDateTime(r);
                  const remaining = r.timestamp && r.timestamp > Date.now() ? countdown(r.timestamp - Date.now()) : null;

                  return (
                    <div key={i} className="exam-card-item is-upcoming" role="listitem">
                      <div className="exam-card-header">
                        <span className="exam-subject-title">{title}</span>
                        {remaining && <span className="exam-countdown-pill">{remaining}</span>}
                      </div>

                      <div className="exam-meta-line">
                        <CalendarDays size={14} className="exam-meta-icon" />
                        <span>{dtStr}</span>
                      </div>

                      <div className="exam-venue-row">
                        <div className="exam-venue-chip">
                          <MapPin size={13} />
                          <span>Room: <strong>{r.roomcode || "—"}</strong></span>
                        </div>
                        <div className="exam-venue-chip">
                          <UserCheck size={13} />
                          <span>Seat: <strong>{r.seatno || "—"}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {pastExams.length > 0 && (
              <div className="timetable-past-group">
                <button
                  type="button"
                  className="timetable-past-toggle"
                  onClick={() => setShowPastExams(!showPastExams)}
                  aria-expanded={showPastExams}
                >
                  <span className="past-toggle-label">
                    Past examinations ({pastExams.length})
                  </span>
                  {showPastExams ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                {showPastExams && (
                  <div className="timetable-exam-list past-list" role="list">
                    {pastExams.map((r, i) => {
                      const title = titleCase(r.subjectdesc ?? "");
                      const dtStr = formatExamDateTime(r);

                      return (
                        <div key={i} className="exam-card-item is-past" role="listitem">
                          <div className="exam-card-header">
                            <span className="exam-subject-title">{title}</span>
                            <span className="exam-past-badge">Completed</span>
                          </div>
                          <div className="exam-meta-line">
                            <CalendarDays size={14} className="exam-meta-icon" />
                            <span>{dtStr}</span>
                          </div>
                          <div className="exam-venue-row">
                            <div className="exam-venue-chip">
                              <MapPin size={13} />
                              <span>Room: <strong>{r.roomcode || "—"}</strong></span>
                            </div>
                            <div className="exam-venue-chip">
                              <UserCheck size={13} />
                              <span>Seat: <strong>{r.seatno || "—"}</strong></span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <footer className="dash-footer">
          <span className="peri-watermark">peri-peri</span>
        </footer>
      </div>

      {renewModal}
    </main>
  );
}
