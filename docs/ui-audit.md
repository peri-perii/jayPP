# LazyPortal Global iOS-Style UI Overhaul: Technical Audit (Phase 1)

## 1. Executive Summary & Stack Overview

LazyPortal is an open-source, mobile-first student web application and Capacitor native shell for Jaypee University of Engineering and Technology (JUET) Webkiosk. The repository is organized as an npm workspace monorepo:

- **Core Library (`packages/core`)**: Pure JavaScript (`@juet/core`) handling custom RSA/AES cryptographic payload encryption/decryption, multi-step auth sessions (`/token/pretoken-check` -> `/token/generatewebtoken`), CAPTCHA image parsing, and low-level HTTP transport with error classification (`SessionExpiredError`, `CaptchaError`, `NetworkError`).
- **Web Client (`packages/web`)**: React 18.3.1 single-page application built on Vite 6.4.3, TypeScript 5, and Lucide React icons.
- **Native Android Shell (`android/`)**: Capacitor 8 project with a custom `MainActivity.java` bridging WebView day/night configuration, AppWidget updates (`AttendanceWidgetProvider.java`), and local notifications via `@capacitor/local-notifications`.
- **Testing Architecture**: Node.js native test runner (`node:test`, `node:assert/strict`) for unit and integration testing across core logic and calculations, complemented by Playwright E2E testing for mobile device viewports (Pixel 7 @ 412x915, iPhone 13 @ 390x844).

---

## 2. Current Styling Approach & Architecture

### Styling Architecture
- **Vanilla CSS**: The application styling is defined in `packages/web/src/styles.css` (~5,700 lines). There are no external CSS frameworks (no Tailwind, no Bootstrap).
- **Theme System**: Utilizes CSS custom properties with dark theme prioritized as the first-class default:
  - Pre-render `<script>` in `packages/web/index.html` inspects `localStorage.getItem("juet.portal.theme")` and immediately applies `data-theme="dark"` or `"light"` before first DOM paint, avoiding white flashes.
  - Semantic variables in `:root` map to `light-dark()` values and explicit `:root[data-theme="dark"]` overrides.
- **Current Deficiencies**:
  - Color palettes mix Material 3 naming tokens (`--primary`, `--surfaceContainerHigh`, `--outlineVariant`) with ad-hoc variables (`--nav-bg`, `--card`, `--border`).
  - Spacing lacks strict geometric rhythm; margin and padding values vary across components (6px, 10px, 14px, 18px).
  - Borders and shadows are inconsistently applied: some cards use multi-layer box shadows while others use thick borders.

---

## 3. Screens and Navigation Audit

The application shell (`packages/web/src/main.tsx`) utilizes hash-based routing with a floating glass bottom navigation bar (`BottomNav.tsx`):

| Screen | Route Hash | Primary Components | Data Sources & Dependencies |
| :--- | :--- | :--- | :--- |
| **Login** | `/` (unauthenticated) | `LoginPage.tsx` | `auth.login`, `auth.fetchCaptcha`, auto-solve engine |
| **Welcome** | In-memory modal moment | `WelcomeScreen.tsx` | Active interactive session (`session.name`) |
| **Home** | `#home` | `DashboardPage.tsx` | `features.getAttendance`, `features.getAttendanceDetail` |
| **Attendance Detail** | `#attendance` / Bottom Sheet | `SubjectDetailBottomSheet.tsx` | `features.getSubjectAttendanceAll` |
| **Timetable** | `#timetable` | `TimetablePage.tsx` | Exam schedule parser |
| **Academic Calendar** | `#calendar` | `AcademicCalendarPage.tsx` | Static JSON semester calendar |
| **Results** | `#results` | `ResultsPage.tsx` | Semester grades, CGPA/SGPA records |
| **More / Settings** | `#more` | `MorePage.tsx` | Local preferences, goals, theme toggles, logout |

---

## 4. Data Shapes & Mechanical Invariants

### 1. Session Structure (`Session`)
```typescript
interface Session {
  token: string;
  name?: string;
  userid?: string;
  clientid?: string;
  membertype?: string;
  enrollmentno?: string;
  instituteid?: string | null;
  institutename?: string | null;
  institutelist?: Array<{ value?: string; label?: string }>;
  tokendate?: string;
  [key: string]: unknown;
}
```

### 2. Attendance Summary Record (`AttRow`)
```typescript
interface AttRow {
  subjectcode?: string;           // e.g. "COMPUTER NETWORKS(18B11CI611)"
  subjectid?: string | number;
  individualsubjectcode?: string; // e.g. "18B11CI611"
  Lsubjectcomponentid?: string;
  Tsubjectcomponentid?: string;
  Psubjectcomponentid?: string;
  Lpercentage?: string | number;
  Tpercentage?: string | number;
  Ppercentage?: string | number;
  LTpercantage?: string | number; // Note: Webkiosk API specific typo
  LTpercentage?: string | number;
  totalclass?: string | number;
  totalpresent?: string | number;
}
```

### 3. Component Class Logs (`ClassRecord`)
```typescript
interface ClassRecord {
  datetime: string;     // e.g. "12/09/2026 10:00AM-11:00AM"
  isAttended: boolean;
  type?: "L" | "T" | "P";
}
```

---

## 5. Motion & Transition Analysis

### Current State
- Component transitions use inconsistent easing curves (`cubic-bezier(0.34, 1.56, 0.64, 1)`, `ease`, `linear`).
- Bottom sheets use `transform: translateY(100%)` with varied durations (300ms to 400ms).
- Lists frequently re-render without staggered entrance animations.

### Target iOS Motion System
- **Movement Curve**: `cubic-bezier(.32,.72,0,1)` for sheet transitions, nav indicator pills, button presses, and page exits.
- **Reveal Curve**: `cubic-bezier(.22,1,.36,1)` for circular progress rings and bar fills.
- **Duration Scale**:
  - Tap / Press: 120ms – 180ms
  - Fades: 250ms – 300ms
  - Bottom Sheets: 450ms – 500ms
  - Data Choreography / Count-up: 1000ms – 1100ms
- **Strict Constraint**: Animate ONLY `transform` and `opacity` (plus SVG `stroke-dashoffset` and progress `width`). Never animate layout properties (`top`, `margin`, `height`, `flex`) that trigger layout thrashing.
- **Accessibility**: Full adherence to `prefers-reduced-motion` (collapsing transitions to instantaneous or simple crossfades).

---

## 6. Technical Risks & Guardrails

1. **Backend / Proxy Integrity**: Never modify proxy URLs, token structures, or payload formats. All API communication routes through `/api` or the Webkiosk gateway.
2. **Webkiosk Inconsistencies**: The university portal periodically omits subject components, provides erratic timestamps, or uses alternate field names (`LTpercantage` vs `LTpercentage`). Parsing functions must always guard against undefined fields.
3. **Hardware Acceleration & GPU Overdraw**: On mid-tier Android devices, excessive `backdrop-filter: blur(24px)` can cause frame rate drops. Fallbacks via `@supports not (backdrop-filter: blur(...))` with solid surfaces must remain in place.
4. **Session Recovery & Credentials**: Raw student passwords must never be logged or permanently persisted insecurely. Session state recovery must be non-blocking.
