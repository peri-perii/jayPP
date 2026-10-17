import { useState, useMemo, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  FlaskConical,
  Sparkles,
  Sun,
  ClipboardList,
  BookOpen,
  CalendarRange,
  FileText,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react";
import {
  type AcademicEvent,
  type EventType,
  getActiveCalendar,
  getHighlightsStatus,
  getEventStatus,
  formatDisplayRange,
  getMonthCalendarCells,
  parseLocalDate,
  getTodayIso,
} from "../lib/academicCalendar";
import { CalendarDaySheet } from "../components/CalendarDaySheet";

type ViewMode = "agenda" | "month";
type FilterCategory = "all" | "exam" | "practical" | "holiday" | "vacation" | "registration";

function getEventIcon(type: EventType): LucideIcon {
  switch (type) {
    case "exam":
      return GraduationCap;
    case "practical":
      return FlaskConical;
    case "holiday":
      return Sparkles;
    case "vacation":
      return Sun;
    case "registration":
      return ClipboardList;
    case "academic":
      return BookOpen;
    case "event":
    default:
      return CalendarRange;
  }
}

export function AcademicCalendarPage({ onBack }: { onBack: () => void }) {
  const [viewMode, setViewMode] = useState<ViewMode>("agenda");
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>("all");
  const [showFaculty, setShowFaculty] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [selectedDateIso, setSelectedDateIso] = useState<string | null>(null);

  const term = useMemo(() => getActiveCalendar(), []);
  const todayIso = useMemo(() => getTodayIso(), []);

  const [gridDate, setGridDate] = useState(() => {
    const today = parseLocalDate(todayIso);
    return { year: today.getFullYear(), monthIndex: today.getMonth() };
  });

  const nextUpcomingRowRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolled = useRef(false);

  const filteredEvents = useMemo(() => {
    if (!term) return [];
    return term.events.filter((e) => {
      if (!showFaculty && e.audience === "faculty") return false;
      if (selectedFilter === "all") return true;
      return e.type === selectedFilter;
    });
  }, [term, showFaculty, selectedFilter]);

  const highlights = useMemo(() => {
    if (!term) return "";
    return getHighlightsStatus(term.events, todayIso, showFaculty);
  }, [term, todayIso, showFaculty]);

  const groupedByMonth = useMemo(() => {
    const map = new Map<string, { label: string; yearMonth: string; events: AcademicEvent[] }>();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const sorted = [...filteredEvents].sort((a, b) => a.start.localeCompare(b.start));

    for (const ev of sorted) {
      const d = parseLocalDate(ev.start);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      if (!map.has(key)) {
        map.set(key, { label, yearMonth: key, events: [] });
      }
      map.get(key)!.events.push(ev);
    }

    return Array.from(map.values());
  }, [filteredEvents]);

  const { pastCount, upcomingEventsExist } = useMemo(() => {
    let past = 0;
    let upcoming = 0;
    for (const ev of filteredEvents) {
      const status = getEventStatus(ev, todayIso);
      if (status.isPast) {
        past++;
      } else {
        upcoming++;
      }
    }
    return { pastCount: past, upcomingEventsExist: upcoming > 0 };
  }, [filteredEvents, todayIso]);

  useEffect(() => {
    if (viewMode === "agenda" && !hasAutoScrolled.current && nextUpcomingRowRef.current) {
      nextUpcomingRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      hasAutoScrolled.current = true;
    }
  }, [viewMode, filteredEvents]);

  const monthCells = useMemo(() => {
    if (!term) return [];
    return getMonthCalendarCells(
      gridDate.year,
      gridDate.monthIndex,
      term.events,
      todayIso,
      showFaculty
    );
  }, [term, gridDate, todayIso, showFaculty]);

  const monthTitle = useMemo(() => {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return `${monthNames[gridDate.monthIndex]} ${gridDate.year}`;
  }, [gridDate]);

  const prevMonth = () => {
    setGridDate((prev) => {
      if (prev.monthIndex === 0) {
        return { year: prev.year - 1, monthIndex: 11 };
      }
      return { year: prev.year, monthIndex: prev.monthIndex - 1 };
    });
  };

  const nextMonth = () => {
    setGridDate((prev) => {
      if (prev.monthIndex === 11) {
        return { year: prev.year + 1, monthIndex: 0 };
      }
      return { year: prev.year, monthIndex: prev.monthIndex + 1 };
    });
  };

  const jumpToToday = () => {
    const t = parseLocalDate(todayIso);
    setGridDate({ year: t.getFullYear(), monthIndex: t.getMonth() });
  };

  if (!term) {
    return (
      <main className="dash dash-view-enter">
        <header className="dash-top-bar">
          <div className="att-top-left">
            <button
              type="button"
              onClick={onBack}
              className="dash-refresh-btn"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="att-header-title">Academic Calendar</h1>
          </div>
        </header>

        <div className="dash-scroll-container">
          <div className="cal-fallback-card">
            <CalendarIcon size={36} className="cal-fallback-icon" />
            <h2>Calendar Unavailable</h2>
            <p>Calendar for this term isn't available yet.</p>
          </div>
        </div>
      </main>
    );
  }

  const selectedDayEvents = selectedDateIso
    ? term.events.filter((e) => {
        if (!showFaculty && e.audience === "faculty") return false;
        const end = e.end || e.start;
        if (e.openEnded) return selectedDateIso >= e.start;
        return selectedDateIso >= e.start && selectedDateIso <= end;
      })
    : [];

  let nextAssigned = false;

  return (
    <main className="dash dash-view-enter">
      <header className="dash-top-bar">
        <div className="att-top-left">
          <button
            type="button"
            onClick={onBack}
            className="dash-refresh-btn"
            aria-label="Back to previous screen"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="att-header-titles">
            <h1 className="att-header-title">Academic Calendar</h1>
            <div className="cal-header-sub">
              <span className="cal-badge-pill">{term.term} ({term.academicYear})</span>
              <span className="cal-official-tag">Official JUET</span>
            </div>
          </div>
        </div>

        <div className="dash-top-actions">
          <a
            href="/academic-calendar-odd-2026-27.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="cal-pdf-btn"
            aria-label="View official calendar PDF"
            title="View official JUET calendar PDF"
          >
            <FileText size={16} />
            <span>Official PDF</span>
          </a>
        </div>
      </header>

      <div className="dash-scroll-container">
        <div className="cal-highlights-strip" role="status" aria-live="polite">
          <span className="cal-highlights-pulse" aria-hidden="true" />
          <span className="cal-highlights-text">{highlights}</span>
        </div>

        <div className="cal-controls-card">
          <div className="cal-segmented-control" role="tablist" aria-label="Calendar view selector">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "agenda"}
              className={`cal-segment-btn ${viewMode === "agenda" ? "active" : ""}`}
              onClick={() => setViewMode("agenda")}
            >
              Agenda
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "month"}
              className={`cal-segment-btn ${viewMode === "month" ? "active" : ""}`}
              onClick={() => setViewMode("month")}
            >
              Month Grid
            </button>
          </div>

          <div className="cal-filters-scroll" role="toolbar" aria-label="Event category filters">
            {(
              [
                { id: "all", label: "All" },
                { id: "exam", label: "Exams" },
                { id: "practical", label: "Practicals" },
                { id: "holiday", label: "Holidays" },
                { id: "vacation", label: "Vacations" },
                { id: "registration", label: "Registration" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`cal-filter-chip ${selectedFilter === id ? "active" : ""}`}
                onClick={() => setSelectedFilter(id)}
                aria-pressed={selectedFilter === id}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="cal-subfilter-row">
            <label className="cal-faculty-toggle" htmlFor="faculty-toggle">
              <input
                id="faculty-toggle"
                type="checkbox"
                checked={showFaculty}
                onChange={(e) => setShowFaculty(e.target.checked)}
                className="cal-toggle-input"
              />
              <span className="cal-toggle-slider" aria-hidden="true" />
              <span className="cal-toggle-label">Show faculty items</span>
            </label>

            {viewMode === "agenda" && pastCount > 0 && (
              <button
                type="button"
                className="cal-past-toggle-btn"
                onClick={() => setShowPastEvents((v) => !v)}
                aria-expanded={showPastEvents}
              >
                {showPastEvents ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{showPastEvents ? "Hide past events" : `Show past (${pastCount})`}</span>
              </button>
            )}
          </div>
        </div>

        {viewMode === "agenda" ? (
          <div className="cal-agenda-container">
            {groupedByMonth.length === 0 ? (
              <div className="cal-empty-card">
                <CalendarIcon size={32} />
                <p>No events match this filter</p>
              </div>
            ) : (
              groupedByMonth.map(({ label, yearMonth, events }) => {
                const visibleEvents = events.filter((ev) => {
                  const status = getEventStatus(ev, todayIso);
                  if (!showPastEvents && status.isPast) return false;
                  return true;
                });

                if (visibleEvents.length === 0) return null;

                return (
                  <section key={yearMonth} className="cal-month-section" aria-label={label}>
                    <div className="cal-sticky-header">
                      <h2 className="cal-month-heading">{label}</h2>
                      <span className="cal-month-counter">{visibleEvents.length}</span>
                    </div>

                    <div className="cal-month-event-list">
                      {visibleEvents.map((ev) => {
                        const Icon = getEventIcon(ev.type);
                        const status = getEventStatus(ev, todayIso);
                        const isUpcomingTarget = !nextAssigned && (status.state === "today" || status.state === "ongoing" || status.state === "upcoming");
                        if (isUpcomingTarget) nextAssigned = true;

                        return (
                          <div
                            key={ev.id}
                            ref={isUpcomingTarget ? nextUpcomingRowRef : null}
                            className={`cal-agenda-row ${status.isPast ? "is-past" : ""} ${status.state === "ongoing" || status.state === "today" ? "is-active" : ""}`}
                            data-type={ev.type}
                          >
                            <div className="cal-row-icon-cell" data-type={ev.type}>
                              <Icon size={20} aria-hidden="true" />
                            </div>

                            <div className="cal-row-main-cell">
                              <div className="cal-row-title-row">
                                <h3 className="cal-row-title">{ev.title}</h3>
                                <span className={`cal-event-status-pill cal-status-${status.state}`}>
                                  {status.label}
                                </span>
                              </div>

                              <div className="cal-row-meta">
                                <span className="cal-row-date">
                                  {formatDisplayRange(ev.start, ev.end, ev.openEnded)}
                                </span>
                                <span className="cal-row-type-tag" data-type={ev.type}>
                                  {ev.type}
                                </span>
                                {ev.audience === "faculty" && (
                                  <span className="cal-row-audience-tag">Faculty</span>
                                )}
                              </div>

                              {ev.note && <div className="cal-row-note">{ev.note}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        ) : (
          <div className="cal-grid-card">
            <div className="cal-grid-nav-bar">
              <button
                type="button"
                onClick={prevMonth}
                className="cal-nav-btn"
                aria-label="Previous month"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="cal-nav-title-group">
                <span className="cal-nav-month-title">{monthTitle}</span>
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="cal-nav-today-btn"
                  aria-label="Jump to current month"
                >
                  Today
                </button>
              </div>

              <button
                type="button"
                onClick={nextMonth}
                className="cal-nav-btn"
                aria-label="Next month"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="cal-grid-weekdays" aria-hidden="true">
              <span>Mo</span>
              <span>Tu</span>
              <span>We</span>
              <span>Th</span>
              <span>Fr</span>
              <span>Sa</span>
              <span className="is-sunday-head">Su</span>
            </div>

            <div className="cal-grid-cells" role="grid" aria-label={`Calendar for ${monthTitle}`}>
              {monthCells.map((cell) => {
                const dayEventTitles = cell.events.map((e) => e.title).join(", ");
                const cellLabel = `${cell.dayNumber} ${cell.dateIso}${
                  cell.events.length > 0 ? `, ${cell.events.length} event(s): ${dayEventTitles}` : ""
                }${cell.isToday ? ", today" : ""}`;

                return (
                  <button
                    key={cell.dateIso}
                    type="button"
                    role="gridcell"
                    aria-label={cellLabel}
                    className={`cal-grid-cell ${!cell.isCurrentMonth ? "is-outside" : ""} ${
                      cell.isSunday ? "is-sunday" : ""
                    } ${cell.isToday ? "is-today" : ""} ${cell.events.length > 0 ? "has-events" : ""}`}
                    onClick={() => {
                      if (cell.events.length > 0) {
                        setSelectedDateIso(cell.dateIso);
                      }
                    }}
                  >
                    <span className="cal-grid-day-number">{cell.dayNumber}</span>
                    {cell.events.length > 0 && (
                      <span className="cal-grid-dots" aria-hidden="true">
                        {cell.events.slice(0, 3).map((e, idx) => (
                          <span key={idx} className="cal-dot" data-type={e.type} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <footer className="cal-footer-notes">
          <div className="cal-source-line">
            <span className="cal-source-badge">Official Static Data</span>
            <span>Source: {term.source}</span>
            <span>·</span>
            <span>Updated: {term.lastUpdated}</span>
          </div>
          <p className="cal-source-disclaimer">
            Academic calendar dates are officially scheduled by JUET and are separate from live portal synchronization.
          </p>
          {term.notes && term.notes.length > 0 && (
            <div className="cal-official-notes">
              {term.notes.map((n, i) => (
                <p key={i}>Note: {n}</p>
              ))}
            </div>
          )}
        </footer>
      </div>

      {selectedDateIso && (
        <CalendarDaySheet
          dateIso={selectedDateIso}
          events={selectedDayEvents}
          onClose={() => setSelectedDateIso(null)}
        />
      )}
    </main>
  );
}
