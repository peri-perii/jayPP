# Repository Audit: LazyPortal UI/UX Redesign

## 1. Architecture & Tech Stack

### Monorepo Structure
- Monorepo using npm workspaces:
  - `packages/core` (`@juet/core`): Zero-dependency isomorphic protocol layer. Implements WebCrypto AES-128-CBC encryption, authentication dance, session store abstraction, error normalization, and feature endpoints.
  - `packages/web` (`@juet/web`): Single-page React application powered by Vite. Responsible for presentation, caching hooks, and UI interaction.
  - `api/proxy.js`: Vercel serverless proxy handling Origin/Referer spoofing, HTTP method guards, path traversal defense, and response streaming.
  - `shared/cors.js`: Origin allow-list and preflight handler permitting cross-origin requests from the Capacitor WebView (`https://lazyportal-tan.vercel.app`).
  - `android/`: Checked-in native Android project generated and synced by Capacitor.

### Framework & Styling
- Framework: React 18.3.1 (`react`, `react-dom`), Vite 6.4.3 (`@vitejs/plugin-react`).
- Styling: Single monolithic stylesheet `packages/web/src/styles.css` (1,938 lines, 58.9 KB). Uses CSS variables with `light-dark()` color resolution, Material Design 3 tokens, and media queries. No CSS preprocessors, Tailwind, or CSS Modules.
- Icons: Inlined SVG elements directly within JSX components. `lucide-react` is not installed.
- Typography: System font stack with sans-serif fallbacks.

### Routing & Navigation
- No third-party router (no `react-router` or similar).
- Top-level routing in `packages/web/src/main.tsx` conditionally renders `<LoginPage>` or `<DashboardPage>` based on `session`.
- Sub-navigation between dashboard and attendance is controlled via `window.location.hash` (`#attendance` vs default `dashboard`) with `window.addEventListener("hashchange")` and native `document.startViewTransition()` where supported.

### State Management & Data Flow
- Custom React hooks and DOM CustomEvents instead of external state stores (Redux, Zustand, etc.):
  - `useSession`: Subscribes to session store and status changes (`authenticated`, `recovering`, `expired`).
  - `useFeature`: Stale-while-revalidate data fetching hook with `inFlight` promise deduplication across hooks, cache generation invalidation on logout, TTL verification, and `localStorage` caching (`juet.cache.*`).
  - `useSemester`: Manages semester dropdown selection per feature with persistence in `localStorage`.
  - `usePersistentState`: Synchronizes component state with `localStorage` keys prefixed with `juet.portal.`.
- Event bus events: `juet:session-status`, `juet:renewed`, `juet:sync`, `juet:refresh-dashboard`, `juet:refresh-attendance`, `juet:quota-changed`.

### Dependencies & Tooling
- Production dependencies:
  - Root: `@capacitor/android` (^8.5.2), `@capacitor/core` (^8.5.2), `@vercel/analytics` (^2.0.1).
  - `@juet/web`: `@juet/core` (*), `@vercel/analytics` (^2.0.1), `react` (^18.3.1), `react-dom` (^18.3.1).
- Development dependencies:
  - Root: `@capacitor/cli` (^8.5.2), `sharp` (^0.34.4).
  - `@juet/web`: `@playwright/test` (^1.63.0), `@vitejs/plugin-react` (^4.3.4), `vite` (^6.0.0).
- Build & Test tooling:
  - Tests run using Node's native test runner: `node --test test/*.test.js`.
  - Web bundle built using `vite build`.
  - TypeScript is used for type annotations in `packages/web/src`, but Vite/esbuild strips types during build without a standalone `tsc` check or `tsconfig.json`.
  - No ESLint configuration file exists in the repository.

---

## 2. Existing Pages, API Integrations & Features

### Active Screens
1. **LoginPage (`packages/web/src/pages/LoginPage.tsx`)**:
   - Enrollment number input.
   - Password input with visibility toggle.
   - User type toggle: Student (`S`) vs Parent (`P`).
   - "Remember me" checkbox.
   - Captcha display with refresh button and client-side auto-solve status.
   - Error banner and session expired banner.
   - Saved profile chip with one-click clear button.

2. **DashboardPage (`packages/web/src/pages/DashboardPage.tsx`)**:
   - Compact header showing formatted student name, last sync freshness indicator, institute selector (when student has multiple institutes), reconnect pill button, and refresh button.
   - Attendance Hero button showing attendance status summary, leading icon, and chevron navigating to AttendancePage.
   - Stacked collapsible section cards loaded from the section registry (`SECTIONS`).
   - Reconnect modal overlay when session expires.
   - Footer with GitHub repository link and Logout button.

3. **AttendancePage (`packages/web/src/pages/AttendancePage.tsx`)**:
   - Header with back navigation button, page title, sync status pill ("Refreshing X/Y..." or quota status), semester selector dropdown, reconnect button, and manual refresh button.
   - Filter pills ("All X" vs "Short Y") when attendance shortage exists.
   - Subject list displaying subject code, subject title, attended vs conducted ratio, and percentage badge colored by threshold.
   - Slide-over `SubjectDetailSheet` modal when selecting a subject.

4. **SubjectDetailSheet (`packages/web/src/components/SubjectDetailSheet.tsx`)**:
   - Header with subject title, close button, and mobile drag handle.
   - KPI card displaying percentage, ratio of classes attended, and actionable bunk/attend margin advice.
   - Target attendance toggle (70%, 80%, 90%).
   - What-If simulator (`WhatIfStepper.tsx`) allowing interactive addition of hypothetical attended or missed classes to project final percentage.
   - Detailed class breakdown history timeline (`CombinedClassLog`) with date, time, component type (Lecture/Tutorial/Practical), and Present/Absent status.

5. **ReconnectModal (`packages/web/src/components/ReconnectModal.tsx`)**:
   - Modal prompt triggered when session token expires.
   - Re-fetches captcha, auto-fills saved credentials if present, and executes login without resetting the user's active page state.

6. **InstallBanner (`packages/web/src/components/InstallBanner.tsx`)**:
   - Bottom sheet banner prompting users to install the PWA or download the Android APK.

### Feature Registry (`packages/web/src/sections/index.ts`)
| Section ID | Label | Status | API Endpoints Called | Description |
|---|---|---|---|---|
| `attendance` | Attendance | Active | `/StudentClassAttendance/getstudentInforegistrationforattendence`<br>`/StudentClassAttendance/getstudentattendancedetail`<br>`/StudentClassAttendance/getstudentsubjectpersentage` | Attendance registrations LOV, semester detail rows, and lecture/tutorial/practical breakdown logs. |
| `marks` | Marks | Active | `/studentcommonsontroller/getsemestercode-exammarks`<br>`/studentsexamview/getstudent-exammarks` | Evaluation marks, full marks vs obtained marks, and event filter pills (T1, T2, T3, P1). |
| `grades` | Grades | Disabled (`enabled: false`) | `/studentgradecard/getstudentinfo`<br>`/studentgradecard/getregistrationList`<br>`/studentgradecard/showstudentgradecard` | Subject grades, earned credits, and grade points. Disabled due to upstream 500 errors on current portal backend. |
| `cgpa` | CGPA | Disabled (`enabled: false`) | `/studentsgpacgpa/loadData`<br>`/studentsgpacgpa/checkIfstudentmasterexist`<br>`/studentsgpacgpa/getallsemesterdata`<br>`/studentsgpacgpa/getallsemesterdatadetail` | Semester SGPA/CGPA history and credit points. Disabled due to upstream portal 500 errors. |
| `exams` | Exams | Active | `/studentcommonsontroller/getsemestercode-withstudentexamevents`<br>`/studentcommonsontroller/getstudentexamevents`<br>`/studentsttattview/getstudent-examschedule` | Exam timetable, dates, time slots, room codes, seat numbers, and countdown timer. |
| `faculty` | Faculty | Active | `/reqsubfaculty/getregistrationList`<br>`/reqsubfaculty/getfaculties` | Registered courses with assigned faculty employee names and credit points. |
| `subjects` | Subjects | Active | `/studentchoiceprint/getsemestercodelist`<br>`/studentchoiceprint/getsubjectpreference` | Enrolled courses for the semester with course codes and regular/minor types. |

### Additional Unexposed Endpoints in `packages/core/src/features.js`
The following endpoints exist in the core protocol library but do not currently have web section views:
- Personal information: `getPersonalInfo` (`/studentpersinfo/getstudent-personalinformation`)
- Medical information: `getMedicalInfo` (`/studentinformation/getstudentmedicalinfo`)
- Service requests: `getPendingServiceRequests`, `getApprovedRequests`, `getClosedRequests`, `getPaidRequests`, `getWithdrawnRequests`, `getCancelledRequests` (`/servicerequestbystudent/*`)
- Fees: `getFeeSummary` (`/studentfeeledger/loadfeesummary`), `getPayslipDues` (`/feepayslipcontroller/getdueamountdetails`), `getFeeEvents` (`/onlinefeepayment/getmyactivefeeevents`)

---

## 3. Auth Flow & Session Persistence

### Two-Step Authentication Dance
1. **Captcha Fetch**:
   - Web client calls `GET /token/getcaptcha` through the proxy without auth headers.
   - Upstream returns `{ response: { captcha: { hidden, image } } }`.
2. **Client-side Autosolve**:
   - `packages/core/src/captcha.js` renders the base64 PNG onto an offscreen canvas.
   - Strips the dark strikethrough line using horizontal neighbor tracking and median filtering.
   - Matches the 5 character glyphs against pre-computed bold Arial font templates.
   - `fetchAutosolvedCaptcha` attempts up to 5 iterations if confidence is low before falling back to manual entry.
3. **Pretoken Check (`POST /token/pretoken-check`)**:
   - Headers: `Authorization: Bearer` and dynamic `LocalName` header.
   - Payload: AES-128-CBC encrypted `{ username, usertype, captcha: { captcha: text, hidden, image } }`.
   - Upstream returns `{ response: { random, otppwd } }`. The `random` token is single-use.
4. **Token Generation (`POST /token/generatewebtoken`)**:
   - Headers: Same auth and `LocalName` headers.
   - Payload: AES-128-CBC encrypted `{ otppwd, username, passwordotpvalue: password, Modulename: "STUDENTMODULE", random }`.
   - Upstream returns student registration payload `regdata` including JWT `token`, `clientid`, `name`, `enrollmentno`, `membertype`, and `institutelist`.

### Session Persistence Details
All persistence currently uses browser `localStorage`.
- `juet.portal.session.v1`: JSON string containing token, user ID, client ID, full name, enrollment number, member type, institute ID, institute name, institute list, and timestamp.
- `juet.portal.last_user`: String containing enrollment number.
- `juet.portal.last_usertype`: `"S"` or `"P"`.
- `juet.portal.saved_pw`: Plaintext user password stored if "Remember me" is checked.
- `juet.portal.expired`: Flag set to `"1"` when the session expires upstream.
- `juet.portal.last_sync`: Timestamp (ms) of the last successful sync.
- `juet.portal.refresh_quota.<user>:<institute>`: JSON record tracking daily manual refresh attempts and cooldowns.
- `juet.portal.card.<id>`: Accordion card expansion state (`"1"` or `"0"`).
- `juet.portal.sem.<feature>`: Selected semester registration ID per section.
- `juet.cache.<key>`: Cached API data with expiration timestamps and checksums.

### Silent Renewal & Recovery
- When an API request returns HTTP 401 or portal failure, `createClient` triggers `onRefresh`.
- If `juet.portal.saved_pw` is present in `localStorage`, the client attempts up to 5 silent login cycles using captcha autosolve in the background.
- If renewal succeeds, the fresh session is saved, and `juet:renewed` is dispatched.
- If renewal fails or no password was saved, `juet.portal.expired` is marked, status transitions to `"expired"`, and the Reconnect modal is displayed.

---

## 4. Capacitor & Android Native Setup

### Configuration
- `capacitor.config.json`:
  - `appId`: `com.lazyportal.juet`
  - `appName`: `JUET Portal`
  - `webDir`: `packages/web/dist`
  - `server.url`: `"https://lazyportal-tan.vercel.app"`
  - `server.cleartext`: `false`
  - Note on architecture: The native app loads the hosted production web app from `server.url`. This design ensures instant web updates without requiring students to reinstall the APK. The local bundle in `packages/web/dist` serves as the offline base.

### Native Project (`android/`)
- Android SDK configuration:
  - `minSdkVersion`: 24 (Android 7.0)
  - `compileSdkVersion`: 36
  - `targetSdkVersion`: 36
  - Java version: JDK 21
- Native manifest:
  - `android:allowBackup="false"` in `AndroidManifest.xml` ensures credentials stored in WebView `localStorage` are excluded from Google Drive backups.
  - Single permission: `android.permission.INTERNET`.
- MainActivity:
  - Extends `BridgeActivity`. Configures WebView background color (`#141316` dark / `#FCF8FD` light) and enables `WebSettings.FORCE_DARK` for Android versions between Q and 32.
- Asset Generation:
  - `scripts/generate-app-assets.mjs` uses `sharp` to derive launcher icons and splash screens directly from `packages/web/public/icon-512.png` and `icon-maskable-512.png`.

---

## 5. Reusable Components & Modules

### Core Logic (Keep Untouched)
- `packages/core/src/crypto.js`: AES-128-CBC encryption/decryption routines and key derivations.
- `packages/core/src/auth.js`: Captcha fetching, refresh, and two-step login orchestration.
- `packages/core/src/captcha.js`: Canvas template matching solver.
- `packages/core/src/client.js`: HTTP request client with header injection, body encryption, and 401 recovery loop.
- `packages/core/src/features.js`: Typed read functions for all portal endpoints.
- `packages/core/src/session.js`: JWT decoding, expiry checks, and store adapters.

### Web Utilities & Calculation Engines (Keep & Reuse)
- `packages/web/src/lib/attendanceCalc.ts`: Pure mathematical calculations for attendance:
  - `combinedAttendance`: Merges Lecture, Tutorial, and Practical rows with detailed class logs.
  - `computeBunkMargin`: Computes exact classes needed or classes safe to bunk for a target threshold.
  - `parseClassLogs`: Parses raw attendance logs into structured records.
- `packages/web/src/lib/portalSchedule.ts`:
  - `getManualRefreshQuota`, `recordSuccessfulManualRefresh`: Enforces 1 manual refresh per portal day and 6-hour cooldowns on unchanged data.
  - `getPortalDayKey`, `isCurrentPortalDay`: Handles JUET's 02:00 AM IST daily commit rollover.
  - `computeSubjectRowChecksum`: Computes checksums to detect attendance changes.
- `packages/web/src/lib/captchaSolve.ts`: Autosolve helper with retry orchestration.
- `packages/web/src/lib/marks.ts`: Formats internal exam tags (`T1`, `T2`, `T3`, `P1`).
- `packages/web/src/lib/sessionSelection.ts`: Preserves user's active institute selection across session renewals.
- `packages/web/src/hooks/useFeature.ts`: Data caching hook with deduplication and stale-while-revalidate lifecycle.
- `packages/web/src/hooks/useSemester.ts`: Semester selection persistence.
- `packages/web/src/hooks/usePersistentState.ts`: Key-value storage synchronization.
- `packages/web/src/components/SubjectDetailSheet.tsx` & `WhatIfStepper.tsx`: Interactive what-if simulation and class log timeline.

---

## 6. Integration Risks & Decisions for the Redesign

### Decision 1: Class Timetable vs Exam Schedule
- **Finding**: The prompt specifies a "Timetable" bottom navigation tab with Day View ("What classes do I have today?") and Week View. However, **JUET's official portal has no class timetable endpoint** (confirmed in `docs/ARCHITECTURE.md` line 72: *"The class timetable does not exist there, only the exam-schedule endpoint, so don't promise one"*). The only timetable endpoint provided by the portal is `getExamSchedule` (`/studentsttattview/getstudent-examschedule`).
- **Options**:
  1. Dedicate the tab to "Schedule" / "Exams", presenting the existing exam timetable with countdowns, seat allocations, and dates.
  2. Implement an offline/local class timetable where students can import or define their weekly routine, while displaying exam schedules alongside it.
  3. Reconfigure bottom navigation to: Home, Attendance, Exams/Results, More.
- **Recommendation**: Dedicate the tab to Schedule (Exams) or clarify user intent regarding manual/cached class schedules.

### Decision 2: Notices Feature Scope
- **Finding**: The prompt lists a "Notices" preview on Home and a Notices screen under secondary screens. The current codebase has no notices endpoint or data source.
- **Options**:
  1. Integrate student service requests or fee announcements if those represent official portal notices.
  2. Display a clean empty/unsupported state indicating that portal notices are not published via API.
  3. Connect an external or static feed if one is provided.
- **Recommendation**: Do not mock fake notices. Surface academic announcements only if a valid data source exists.

### Decision 3: Credential Storage & Security
- **Finding**: The existing application persists the raw user password in plaintext inside `localStorage.getItem("juet.portal.saved_pw")` when "Remember me" is checked. This is done to enable silent background re-login when session tokens expire.
- **Options**:
  1. Retain existing session renewal behavior to avoid breaking automatic reconnects, while abstracting storage behind a secure adapter.
  2. On native Android builds, integrate Keystore-backed secure storage via Capacitor plugin (or Android Keystore bridge).
  3. Discontinue storing plaintext passwords; require manual captcha/password entry on session expiration.
- **Recommendation**: Maintain compatibility with the existing auth flow without logging credentials. If Android Keystore is desired, introduce a lightweight secure storage plugin with written justification.

### Decision 4: Grades & CGPA Portal 500 Failures
- **Finding**: Grades and CGPA sections are disabled (`enabled: false`) in `sections/index.ts` because the university portal returns HTTP 500 errors.
- **Options**:
  1. In the Results tab, query SGPA/Grades but provide robust fallback empty/error states explaining that university grade cards are temporarily unavailable upstream.
  2. Combine Marks and Results under one unified screen.
- **Recommendation**: Provide a unified Results screen with Marks as the primary reliable data source, with graceful fallback handling for CGPA/Grades.

### Decision 5: Icon Strategy (Zero Dependencies vs Lucide)
- **Finding**: The prompt permits Lucide if already compatible, while enforcing zero new dependencies without written justification. The codebase currently uses inlined SVGs without `lucide-react`.
- **Options**:
  1. Install `lucide-react` (~30KB gzipped).
  2. Use a curated set of clean, native SVG icon components matching Lucide / M3 specifications with zero new dependencies.
- **Recommendation**: Build a minimal, zero-dependency SVG icon set matching the Lucide stroke aesthetic.
