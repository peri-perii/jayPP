import { useEffect, useRef } from "react";
import { X, GraduationCap, FlaskConical, Sparkles, Sun, ClipboardList, BookOpen, CalendarRange, type LucideIcon } from "lucide-react";
import type { AcademicEvent, EventType } from "../lib/academicCalendar";
import { formatDisplayDate, formatDisplayRange, getEventStatus } from "../lib/academicCalendar";

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

export function CalendarDaySheet({
  dateIso,
  events,
  onClose,
}: {
  dateIso: string;
  events: AcademicEvent[];
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const formattedDate = formatDisplayDate(dateIso);

  return (
    <div className="cal-sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="cal-sheet-title">
      <div
        className="cal-sheet-container"
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cal-sheet-drag-handle" aria-hidden="true" />

        <div className="cal-sheet-header">
          <div>
            <h2 id="cal-sheet-title" className="cal-sheet-title">
              {formattedDate}
            </h2>
            <span className="cal-sheet-count">
              {events.length} event{events.length === 1 ? "" : "s"} scheduled
            </span>
          </div>
          <button
            type="button"
            className="cal-sheet-close"
            onClick={onClose}
            aria-label="Close day events"
          >
            <X size={20} />
          </button>
        </div>

        <div className="cal-sheet-body">
          {events.length === 0 ? (
            <div className="cal-empty-state">
              <p>No academic events scheduled on this day.</p>
            </div>
          ) : (
            <div className="cal-events-list">
              {events.map((ev) => {
                const Icon = getEventIcon(ev.type);
                const status = getEventStatus(ev, dateIso);
                return (
                  <div key={ev.id} className="cal-event-card" data-type={ev.type}>
                    <div className="cal-event-icon-wrap" data-type={ev.type}>
                      <Icon size={18} aria-hidden="true" />
                    </div>

                    <div className="cal-event-info">
                      <div className="cal-event-topline">
                        <span className="cal-event-type-badge" data-type={ev.type}>
                          {ev.type}
                        </span>
                        <span className={`cal-event-status-pill cal-status-${status.state}`}>
                          {status.label}
                        </span>
                      </div>

                      <h3 className="cal-event-title">{ev.title}</h3>

                      <span className="cal-event-range">
                        {formatDisplayRange(ev.start, ev.end, ev.openEnded)}
                      </span>

                      {ev.note && <span className="cal-event-note">{ev.note}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
