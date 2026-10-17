import oddSem2026 from "../data/academicCalendar.odd-2026-27.json" with { type: "json" };

export type EventType =
  | "exam"
  | "practical"
  | "holiday"
  | "vacation"
  | "registration"
  | "academic"
  | "event";

export type Audience = "student" | "faculty" | "all";

export interface AcademicEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  openEnded?: boolean;
  type: EventType;
  audience: Audience;
  note?: string;
}

export interface AcademicCalendarTerm {
  term: string;
  academicYear: string;
  source: string;
  lastUpdated: string;
  events: AcademicEvent[];
  notes?: string[];
}

export interface EventStatusResult {
  state: "today" | "ongoing" | "upcoming" | "past";
  label: string;
  daysDiff: number;
  isPast: boolean;
}

export interface CalendarDayCell {
  dateIso: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isSunday: boolean;
  isToday: boolean;
  events: AcademicEvent[];
}

const REGISTERED_TERMS: AcademicCalendarTerm[] = [
  oddSem2026 as unknown as AcademicCalendarTerm,
];

export function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function formatLocalDateIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayIso(): string {
  return formatLocalDateIso(new Date());
}

export function getDaysDifference(fromIso: string, toIso: string): number {
  const from = parseLocalDate(fromIso).getTime();
  const to = parseLocalDate(toIso).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((to - from) / oneDay);
}

export function isDateInRange(
  dateIso: string,
  startIso: string,
  endIso?: string,
  openEnded?: boolean
): boolean {
  if (dateIso < startIso) return false;
  if (openEnded) return true;
  if (!endIso) return dateIso === startIso;
  return dateIso <= endIso;
}

export function formatDisplayDate(iso: string): string {
  const date = parseLocalDate(iso);
  const day = date.getDate();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[date.getMonth()];
  return `${day} ${month} ${date.getFullYear()}`;
}

export function formatDisplayRange(
  startIso: string,
  endIso?: string,
  openEnded?: boolean
): string {
  if (openEnded) {
    return `${formatDisplayDate(startIso)} onwards`;
  }
  if (!endIso || endIso === startIso) {
    return formatDisplayDate(startIso);
  }

  const s = parseLocalDate(startIso);
  const e = parseLocalDate(endIso);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth()) {
      return `${s.getDate()} – ${e.getDate()} ${months[s.getMonth()]} ${s.getFullYear()}`;
    }
    return `${s.getDate()} ${months[s.getMonth()]} – ${e.getDate()} ${months[e.getMonth()]} ${s.getFullYear()}`;
  }

  return `${formatDisplayDate(startIso)} – ${formatDisplayDate(endIso)}`;
}

export function getEventStatus(
  event: AcademicEvent,
  referenceDateIso?: string
): EventStatusResult {
  const today = referenceDateIso || getTodayIso();

  if (event.end) {
    if (today < event.start) {
      const diff = getDaysDifference(today, event.start);
      return {
        state: "upcoming",
        label: diff === 1 ? "Tomorrow" : `In ${diff} days`,
        daysDiff: diff,
        isPast: false,
      };
    }
    if (today <= event.end) {
      const left = getDaysDifference(today, event.end);
      return {
        state: "ongoing",
        label: left === 0 ? "Ends today" : left === 1 ? "Ends in 1 day" : `Ends in ${left} days`,
        daysDiff: left,
        isPast: false,
      };
    }
    const pastDays = getDaysDifference(event.end, today);
    return {
      state: "past",
      label: "Done",
      daysDiff: -pastDays,
      isPast: true,
    };
  }

  if (event.openEnded) {
    if (today < event.start) {
      const diff = getDaysDifference(today, event.start);
      return {
        state: "upcoming",
        label: diff === 1 ? "Tomorrow" : `In ${diff} days`,
        daysDiff: diff,
        isPast: false,
      };
    }
    return {
      state: "ongoing",
      label: "Ongoing",
      daysDiff: 0,
      isPast: false,
    };
  }

  if (today === event.start) {
    return {
      state: "today",
      label: "Today",
      daysDiff: 0,
      isPast: false,
    };
  }
  if (today < event.start) {
    const diff = getDaysDifference(today, event.start);
    return {
      state: "upcoming",
      label: diff === 1 ? "Tomorrow" : `In ${diff} days`,
      daysDiff: diff,
      isPast: false,
    };
  }

  const pastDays = getDaysDifference(event.start, today);
  return {
    state: "past",
    label: "Done",
    daysDiff: -pastDays,
    isPast: true,
  };
}

export function getHighlightsStatus(
  events: AcademicEvent[],
  referenceDateIso?: string,
  includeFaculty = false
): string {
  const today = referenceDateIso || getTodayIso();
  const eligible = events.filter(
    (e) => includeFaculty || e.audience === "student" || e.audience === "all"
  );

  const ongoing = eligible.filter((e) =>
    isDateInRange(today, e.start, e.end, e.openEnded)
  );

  if (ongoing.length > 0) {
    const primary =
      ongoing.find((e) => e.type === "exam") ||
      ongoing.find((e) => e.type === "practical") ||
      ongoing.find((e) => e.type === "vacation") ||
      ongoing.find((e) => e.type === "holiday") ||
      ongoing[0];

    if (primary.end && primary.start !== primary.end) {
      const daysLeft = getDaysDifference(today, primary.end);
      if (daysLeft === 0) return `${primary.title} is ongoing (ends today)`;
      return `${primary.title} is ongoing (ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"})`;
    }
    if (primary.openEnded) {
      return `${primary.title} is ongoing`;
    }
    return `Today: ${primary.title}`;
  }

  const upcoming = eligible
    .filter((e) => e.start > today)
    .sort((a, b) => a.start.localeCompare(b.start));

  if (upcoming.length > 0) {
    const next = upcoming[0];
    const daysUntil = getDaysDifference(today, next.start);
    if (daysUntil === 1) {
      return `Next: ${next.title} tomorrow`;
    }
    return `Next: ${next.title} in ${daysUntil} days`;
  }

  return "Semester events concluded";
}

export function getActiveCalendar(
  targetDate?: Date | string
): AcademicCalendarTerm | null {
  if (REGISTERED_TERMS.length === 0) return null;

  const iso =
    typeof targetDate === "string"
      ? targetDate
      : formatLocalDateIso(targetDate || new Date());

  for (const term of REGISTERED_TERMS) {
    if (!term.events || term.events.length === 0) continue;
    const sorted = [...term.events].sort((a, b) => a.start.localeCompare(b.start));
    const termStart = sorted[0].start;
    const endEvents = sorted.map((e) => e.end || e.start).sort();
    const termEnd = endEvents[endEvents.length - 1];

    if (iso >= termStart && iso <= termEnd) {
      return term;
    }
  }

  const firstTerm = REGISTERED_TERMS[0];
  const sorted = [...firstTerm.events].sort((a, b) => a.start.localeCompare(b.start));
  const earliest = sorted[0]?.start;
  if (earliest && iso < earliest) {
    return firstTerm;
  }

  return REGISTERED_TERMS[REGISTERED_TERMS.length - 1];
}

export function getAllTerms(): AcademicCalendarTerm[] {
  return REGISTERED_TERMS;
}

export function getMonthCalendarCells(
  year: number,
  monthIndex: number,
  events: AcademicEvent[],
  referenceTodayIso?: string,
  includeFaculty = false
): CalendarDayCell[] {
  const todayIso = referenceTodayIso || getTodayIso();
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);

  let startWeekday = firstDayOfMonth.getDay();
  startWeekday = (startWeekday + 6) % 7;

  const cells: CalendarDayCell[] = [];
  const daysInMonth = lastDayOfMonth.getDate();

  const prevMonthLastDay = new Date(year, monthIndex, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const prevDate = new Date(year, monthIndex - 1, day);
    const iso = formatLocalDateIso(prevDate);
    const dayEvents = events.filter(
      (e) =>
        (includeFaculty || e.audience === "student" || e.audience === "all") &&
        isDateInRange(iso, e.start, e.end, e.openEnded)
    );
    cells.push({
      dateIso: iso,
      dayNumber: day,
      isCurrentMonth: false,
      isSunday: prevDate.getDay() === 0,
      isToday: iso === todayIso,
      events: dayEvents,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const curDate = new Date(year, monthIndex, day);
    const iso = formatLocalDateIso(curDate);
    const dayEvents = events.filter(
      (e) =>
        (includeFaculty || e.audience === "student" || e.audience === "all") &&
        isDateInRange(iso, e.start, e.end, e.openEnded)
    );
    cells.push({
      dateIso: iso,
      dayNumber: day,
      isCurrentMonth: true,
      isSunday: curDate.getDay() === 0,
      isToday: iso === todayIso,
      events: dayEvents,
    });
  }

  const remainder = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= remainder; day++) {
    const nextDate = new Date(year, monthIndex + 1, day);
    const iso = formatLocalDateIso(nextDate);
    const dayEvents = events.filter(
      (e) =>
        (includeFaculty || e.audience === "student" || e.audience === "all") &&
        isDateInRange(iso, e.start, e.end, e.openEnded)
    );
    cells.push({
      dateIso: iso,
      dayNumber: day,
      isCurrentMonth: false,
      isSunday: nextDate.getDay() === 0,
      isToday: iso === todayIso,
      events: dayEvents,
    });
  }

  return cells;
}

export function getNextUpcomingExam(
  events: AcademicEvent[],
  referenceDateIso?: string
): AcademicEvent | null {
  const today = referenceDateIso || getTodayIso();
  const exams = events
    .filter((e) => e.type === "exam" || e.type === "practical")
    .filter((e) => (e.end ? e.end >= today : e.start >= today))
    .sort((a, b) => a.start.localeCompare(b.start));

  return exams[0] || null;
}
