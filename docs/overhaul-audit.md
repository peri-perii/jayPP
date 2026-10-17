# LazyPortal Minimal UI Overhaul: Technical Audit

## 1. Project & Repository Structure

LazyPortal is an npm workspace monorepo consisting of:
- `packages/core`: Plain JavaScript core package (`@juet/core`) handling portal authentication, session encryption/decryption, request payload signing, and low-level HTTP transport with the university Webkiosk API.
- `packages/web`: Modern React 18 single-page application built with Vite and TypeScript.
- `android/`: Native Android project generated and managed via Capacitor 8.
- Top-level config: `capacitor.config.json` targeting appId `com.lazyportal.juet`.

### Current Routing & Shell Hierarchy
The application entry point `packages/web/src/main.tsx` renders `AppShell`, which manages hash-based routing:
- `#home`: Currently renders `DashboardPage`, which displays a hero attendance card, shortcut tiles to Timetable and Results, and three stacked collapsible sections (Marks, Faculty, Registered Subjects).
- `#attendance`: Currently renders `AttendancePage`, an isolated view reached only by clicking the hero attendance card.
- `#timetable`: Renders `TimetablePage`, displaying exam schedules via `ExamsSection`.
- `#calendar`: Dedicated top-level tab rendering `AcademicCalendarPage`.
- `#results`: Renders `ResultsPage`, containing stacked `MarksSection`, `GradesSection`, and `CgpaSection`.
- `#more`: Renders `MorePage`, presenting user profile information, quick links, theme selection, and logout.
- Bottom navigation: Floating translucent glass pill navigation (`BottomNav.tsx`) with 5 tabs: Home, Timetable, Calendar, Results, and More.

---

## 2. Attendance Data Shape & Mechanics

### Portal Data Sources in `@juet/core`
Attendance data originates from two distinct portal API calls:
1. `features.getAttendance(client, session)`:
   - Fetches LOV header (`stynumber`) and semester registration list from `/StudentClassAttendance/getstudentInforegistrationforattendence`.
   - Fetches summary rows for the active registration code via `/StudentClassAttendance/getstudentattendancedetail`.
   - Data structure returned (`AttData`):
     ```typescript
     interface AttRow {
       subjectcode?: string;             // e.g. "COMPUTER NETWORKS(18B11CI611)"
       subjectid?: string | number;      // e.g. "10423"
       individualsubjectcode?: string;   // e.g. "18B11CI611"
       Lsubjectcomponentid?: string;     // Lecture component ID (comma-separated or single)
       Tsubjectcomponentid?: string;     // Tutorial component ID
       Psubjectcomponentid?: string;     // Practical/Lab component ID
       Lpercentage?: string | number;    // Lecture percentage string or number
       Tpercentage?: string | number;    // Tutorial percentage string or number
       Ppercentage?: string | number;    // Practical percentage string or number
       LTpercantage?: string | number;   // Official combined L+T percentage (portal typo: 'LTpercantage')
       LTpercentage?: string | number;
       totalclass?: string | number;     // Sometimes present in certain portal versions
       totalpresent?: string | number;
     }
     ```
2. `features.getSubjectAttendanceAll(client, session, row, base)`:
   - Queries component-level attendance logs via `/StudentClassAttendance/getstudentsubjectpersentage` for each component present (L, T, P).
   - Returns chronological class logs:
     ```typescript
     interface ClassRecord {
       datetime: string;     // e.g. "12/09/2026 10:00AM-11:00AM"
       isAttended: boolean;
       type?: "L" | "T" | "P";
     }
     ```
   - Aggregated via `parseClassLogs` into `{ total: number, attended: number, absent: number, pct: string, classes: ClassRecord[] }`.

### Stable Subject Identifiers
- `subjectcode` formatted as `NAME(CODE)` provides the unique course identifier (e.g. `18B11CI611`).
- Extracting the alphanumeric code inside parentheses yields an immutable key that survives semester roll-overs, re-registrations, and array index shifts.
- When no parenthesized code exists, `individualsubjectcode` or `subjectid` serves as fallback.

### Data Edge Cases
- **No classes held ($c = 0$):** Subjects like projects, seminars, or early-semester classes have 0 conducted classes. These must display "No classes yet", with percentage represented as `"—"`, and must be excluded from overall attendance percentage calculations and below-goal counts.
- **Goal boundary ($100\%$ goal):** When goal $g = 1.0$, the attendance formula $\lceil \frac{g \cdot c - a}{1 - g} \rceil$ has a zero denominator. The system must display "Goal not reachable if any class is missed".
- **Lab vs Lecture combinations:** Certain courses have only Practical components ($P$), others have $L+T$, and some have $L+T+P$. `combinedAttendance` in `attendanceCalc.ts` accurately accounts for these component combinations.

---

## 3. Data Synchronization & Storage Architecture

### Sync Triggers
1. **Initial Mount / App Open:** `useAttendanceInitial` triggers on mount if the cached record is missing or expired.
2. **Manual Refresh (Action Bar):** User taps the refresh icon on top app bar, dispatching `juet:refresh-dashboard` or `juet:refresh-attendance`.
3. **Portal Day Rollover:** `subscribePortalDayRollover` detects when local time passes midnight Indian Standard Time (IST) and invalidates stale day caches.
4. **Window Storage & Focus Events:** Synchronizes UI when cache updates occur across contexts or tabs.

### Local Storage Mechanics
- The application uses browser `localStorage` as its local persistence engine.
- Key conventions:
  - `juet.portal.last_sync`: Timestamp (milliseconds) of the last successful network sync.
  - `juet.cache.att.initial:<username>:<instituteid>`: Cached overview rows and semester metadata.
  - `juet.cache.att.subject:<username>:<instituteid>:<registrationid>:<subjectid>`: Cached component class breakdown.
  - Custom events `juet:sync` and `storage` keep all active components in sync without redundant network calls.

### Attendance Goals Storage Plan
- Dedicated local storage key: `juet.attendance.goals`.
- JSON schema:
  ```typescript
  interface AttendanceGoalsStore {
    defaultGoal: number; // e.g. 75
    overrides: Record<string, number>; // subjectCode -> goal (50-100)
    notificationsEnabled: boolean;
    dailyReminderEnabled: boolean;
    dailyReminderTime: string; // e.g. "20:00"
    lastKnownStatus: Record<string, "below" | "close" | "on_track">;
  }
  ```
- Fast, synchronous reads on mount, zero overhead, and fully isolated from session/auth data.

---

## 4. Timetable Screen Bug Diagnosis

### Identified Causes
1. **Collapsed-by-Default Card Bug:**
   In `TimetablePage.tsx`, the screen renders only `<ExamsSection />`. In `ExamsSection.tsx`, card expansion defaults to `defaultOpen={false}` via `useCardState("exams", false)`. Consequently, the page loads with a single collapsed pill row titled "Exam schedules", rendering the rest of the viewport completely empty.
2. **Clipping & Sticky Header Layout Defect:**
   The top bar (`dash-top-bar`) uses `position: sticky; top: 0; z-index: 2` with top safe-area padding. The content wrapper `.dash-content` applies top padding `var(--gap-header-home)` (32px). In `ExamsSection`, `.m3-card` specifies `scroll-margin-top: 80px`. Under narrow viewports and certain scroll positions, the collapsed card gets clipped underneath the sticky header rather than flowing naturally in the scroll container.
3. **Missing Class Timetable Feature:**
   The portal API (`@juet/core`) has official endpoints for exam schedules (`getExamSemesters`, `getExamEvents`, `getExamSchedule`), but JUET Webkiosk has no published class timetable endpoint. `TimetablePage` lacked a segmented control for `Classes | Exams` and had no day view or empty state for classes.

### Remedy Plan
- Introduce top segmented control: `Classes | Exams`.
- Re-architect container layout: Ensure clear margin separation between top bar and content, remove collapsible wrapper overhead, and display exam cards and class schedules directly in a scrollable list.
- Implement Classes view with day switcher (Monday through Saturday, highlighting today) and clean empty state ("No classes scheduled today").
- Implement Exams view displaying upcoming exams first with countdown badges, seating, and venue details, collapsing past exams.

---

## 5. Capacitor & Local Notifications Readiness

### Current Configuration
- Root `package.json` contains:
  - `@capacitor/core`: `^8.5.2`
  - `@capacitor/android`: `^8.5.2`
  - `@capacitor/cli`: `^8.5.2`
- Android configuration:
  - Android platform installed under `android/`.
  - `AndroidManifest.xml` currently contains only `android.permission.INTERNET`.

### Requirements for Phase 4 Setup
1. **Plugin Installation:** Add `@capacitor/local-notifications` (compatible with Capacitor 8).
2. **Android 13+ Permissions:**
   - Add `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>` to `AndroidManifest.xml`.
   - Add `<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>` if exact daily scheduling is required.
3. **Notification Channel:**
   - Register notification channel `attendance_alerts` with high importance, alert sound, and vibration.
4. **Permission Flow:**
   - Must request runtime permission **in context** (when user toggles on notifications in settings), not on app launch.
5. **Architectural Constraints & Transparency:**
   - The app has no background daemon or remote push server. Attendance data is only refreshed when the app syncs (on open or manual refresh).
   - Clear copy will be displayed in Settings explaining: *"Alerts are checked whenever the app syncs."*
   - In-app notification indicator (header dot + summary count) will be provided so alerts function even if system notification permissions are denied.

---

## 6. Technical Risks & Mitigations

1. **Background Detail Fetch Latency:**
   - *Risk:* Fetching class-by-class detail for every subject on Home screen could cause UI freeze or excessive network traffic.
   - *Mitigation:* Render Home immediately using initial summary rows (`AttRow`), then resolve details via cached local records and concurrency-limited background workers (max concurrency 2).
2. **Division by Zero & Edge Cases in Attendance Logic:**
   - *Risk:* Zero conducted classes or 100% target goals could yield `NaN` or `Infinity`.
   - *Mitigation:* Isolate all calculations into a pure, unit-tested module (`src/lib/attendance.ts`) with strict guards for $c = 0$, $g = 1$, and edge rounding.
3. **Floating Navigation Clearance:**
   - *Risk:* Fixed floating pill navbar (`height: 64px`) can occlude the bottom-most list items.
   - *Mitigation:* Apply bottom padding `calc(64px + 32px + env(safe-area-inset-bottom, 0px))` across all scroll containers.
4. **Performance on Low-End Devices:**
   - *Risk:* Re-rendering subject lists on goal slider adjustments could cause stutter.
   - *Mitigation:* Memoize sorted lists with `useMemo`, debounce goal persistence, and isolate bottom sheet state from the main list.

---

## 7. Proposed Component Architecture

### Phase 2: Core Logic & Storage
- `src/lib/attendance.ts`:
  - Pure calculation functions: `calculateAttendanceStatus`, `classesNeededToReachGoal`, `classesAllowedToSkip`, `sortSubjectsByAttendance`.
  - Comprehensive unit test suite in `packages/web/test/attendance.test.js`.
- `src/lib/attendanceGoals.ts`:
  - Goal storage adapter for `localStorage`, state management hooks for defaults and per-subject overrides.

### Phase 3: Attendance-First Home & Timetable Fix
- `src/pages/DashboardPage.tsx` (overhauled to Attendance-First Home):
  - `HomeHeader`: Student first name, sync status ("Synced X ago"), refresh button, in-app alert indicator.
  - `OverallAttendanceSummary`: Overall attendance percentage, total attended/conducted, actionable status line ("2 subjects below goal").
  - `SubjectAttendanceList`: Stable-sorted list (lowest attendance first) with memoized rows.
  - `SubjectAttendanceRow`: Subject title, code, prominent percentage, progress bar with goal tick, attended/conducted count, computed action sentence, status badge (icon + label).
  - `SubjectDetailBottomSheet`: Accessible bottom sheet featuring large percentage display, goal stepper/slider (50% to 100%), attendance stats, and class history log.
- `src/pages/TimetablePage.tsx` (overhauled):
  - Segmented control (`Classes | Exams`).
  - `ClassesView`: Day selector, chronological lecture/lab cards with Now/Next indicators, empty state.
  - `ExamsView`: Chronological exam cards with countdown, venue/seating, collapsible past exams.

### Phase 4: Local Notifications & Settings
- `src/lib/notifications.ts`:
  - Capacitor Local Notifications adapter, notification channel registration, permission request handler, transition detector ("Below goal" transitions only).
- `src/components/AttendanceSettingsSheet.tsx` (accessible from More tab):
  - Default goal stepper (50% to 100%).
  - Notification toggle with permission status prompt.
  - Daily reminder toggle and time picker.
  - Per-subject override manager with "Reset to default" actions.

### Phase 5: Results & More Restructure
- `src/pages/ResultsPage.tsx`:
  - Top summary: Prominent SGPA / CGPA display.
  - Unified view: Semester selector with consolidated marks, grades, and credit badges.
- `src/pages/MorePage.tsx`:
  - Strict ordered list: Attendance goals & notifications, Faculty, Registered subjects, Appearance, Source code, Log out.
