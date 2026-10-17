<USER_REQUEST>
# LazyPortal: Global iOS-style UI overhaul (premium minimal)

You are a Senior Product Designer and Expert React/Capacitor Engineer. LazyPortal is an existing, working open-source JUET student portal. Restyle and re-animate the whole app. Do NOT rebuild it. Preserve backend, `/api` proxy, authentication, session handling and data fetching.

Reference: `lazyportal-ios-ui.html` (the interactive prototype). Match its spacing, typography, easing, and loading choreography in the real app.

## Ground rules
- New branch `redesign/ios-global`. Commit per phase. Stop for my approval after each phase.
- No new dependencies unless justified in writing. Prefer CSS transitions and keyframes. No animation libraries.
- No mock data in production. Never claim something was tested unless you ran it. End each phase with "Verified" and "Not verified".
- Do not log credentials. Never store the raw password.

## Design language (iOS-like, minimal)
- Feel: calm, spacious, confident. One clear purpose per screen. Grouped lists with hairline dividers beat many separate cards. Borders over shadows. No decorative gradients or glow.
- Color tokens (semantic, with a derived light theme at WCAG AA): bg `#090B10`, surface `#111620`, elevated `#192131`, accent `#497BFF` (buttons use a deeper `#3A6AEF` so white text passes), text `#F2F5FF`, secondary `#94A3B8`, success `#34D399`, warning `#FBBF24`, danger `#FB7185`, hairline `rgba(255,255,255,.09)`. Theme follows system, with a manual override.
- Color rules: neutrals share the accent's hue family (about 223°). Amber (complement of the blue accent) is reserved for warnings. The accent and status colors are the scarce 10%. Status is NEVER color alone: always an icon plus a word.
- Type: system font stack (`-apple-system, SF Pro, Inter, Roboto`). Large titles 32px bold, tracking -0.03em. Body 16px. Secondary 13px. `font-variant-numeric: tabular-nums` on all numbers. Avoid ALL CAPS.
- Shape: radii 20px for cards, 14 to 16px for controls, pills for the nav. 8px spacing scale as CSS variables. Touch targets at least 48px. Hit areas must exceed the visuals.
- Icons: Lucide, 1.8px stroke, one consistent set. Active nav icons get a soft fill.

## Motion system (define once as tokens, reuse everywhere)
- One easing curve: `cubic-bezier(.32,.72,0,1)` for movement (sheets, nav indicator, press), `cubic-bezier(.22,1,.36,1)` for reveals (bars, ring).
- Durations: press 120 to 180ms, fades 250 to 300ms, sheets 450 to 500ms, data reveals 1000ms.
- Animate only `transform` and `opacity`, plus `stroke-dashoffset` for the ring and `width` for bars. Never animate layout properties that cause reflow in lists.
- Every tappable element has a press state (scale .96 to .985 plus a background change).
- Page transitions: a 280ms fade plus a 8px rise. Bottom sheets slide up from below with a dimmed scrim, and the system back button closes them first.
- Respect `prefers-reduced-motion`: collapse all durations to near zero, skip the count-up, and keep skeletons static.

## Launch and loading experience
1. **Splash:** dark background, centered logo mark scaling in (0.8 to 1), a thin ring spinning around it, and the app name fading in. Crossfade out in 450ms. It stays visible only until session restore finishes. NO artificial delay.
2. **Session routing:** valid session goes straight to Home. Otherwise go to Login.
3. **Skeletons everywhere data loads:** a shimmer (a soft moving gradient over the elevated color, 1.5s loop) in placeholders that have the EXACT shape of the final layout, so nothing shifts on arrival. Show a skeleton only if loading exceeds about 150ms. Once shown, keep it at least 300ms to avoid flashing.
4. **Attendance load choreography (Home), played when real data arrives:**
   - the circular ring draws from 0 to the value (1.1s, reveal curve)
   - the percentage counts up in sync (about 1s, ease-out, tabular numbers)
   - subject rows fade and rise in with a 70ms stagger (stop staggering after 8 rows)
   - each progress bar fills (1s) with a 200ms delay after its row, then settles on its goal tick
   - the "below goal" badge fades in last
   Play the full sequence on first load and after an explicit refresh. On quiet cache-to-fresh updates, update values in place without replaying.
5. **Refresh:** the header refresh button spins while syncing. The status text goes "Syncing…", then "Synced just now". Pull-to-refresh uses the same behavior. Cached data always shows its last-synced time and is never presented as live.
6. **Errors and offline:** an inline banner with a plain message and a Retry button. Keep the last good data visible, dimmed slightly, with "Last synced X ago".

## Global components (build once, reuse)
- **Glass tab bar:** floating pill with 14px margins, safe-area bottom offset, translucent surface plus `backdrop-filter: blur(24px) saturate(170%)`, a hairline top highlight, and a solid fallback via `@supports`. Five tabs (Home, Timetable, Calendar, Results, More), with labels always visible at 10px. One sliding indicator pill moves between tabs (transform only). `aria-current="page"` on the active tab.
- **Grouped list rows** (buttons, not divs), with hairline dividers and a chevron where navigational.
- **Summary ring card** and **subject row** (name, percent, progress bar with a goal tick, a computed action line, a status badge).
- **Bottom sheet** with a drag handle, scrim, focus trap, and Escape/back to close. Used for subject details and the goal stepper (50 to 100%, step 5, 48px buttons).
- **Button** (52px, 14px radius, press scale .97, inline spinner on loading with fixed width), **iOS switch** (`role="switch"`), **segmented control**, **skeleton**, **empty state**, **error banner**, **status badge**.
- Optional haptics: use `@capacitor/haptics` (selection tick on tab change and stepper, light impact on sheet open) ONLY if the plugin is already present or you justify it. Never block UI on a haptic call.

## Screens to restyle with this system
Splash, Login (one grouped input card, a switch for remember-device, one primary button, inline errors with icon plus text), Home (attendance, lowest first, with goal ticks, computed "attend N more / can skip N" text, goal sheet), Timetable (Classes and Exams segmented), Calendar (Agenda and Month), Results (SGPA/CGPA at top, then subject list), More (grouped list, appearance, attendance goals and notifications, source, log out with confirm). Only include features that exist.

## Quality floor
- Contrast AA in both themes. Visible focus rings. System font scaling works. Screen-reader labels on every icon-only control and progress bar.
- No horizontal overflow at 360x800 and 412x915. Edge-to-edge with safe areas. Keyboard never covers inputs. Use `100dvh`.
- Performance: no layout thrash, no `will-change` except during active animations, memoize lists, lazy-load heavy screens. Check scroll smoothness on a low-end device and reduce blur radius or fall back to solid if it stutters.
- Small things count: consistent 8px rhythm, no orphan spacing, tabular numbers, no flash of unstyled or wrong-theme content on startup (set the theme before first paint), no layout shift when fonts or data load.

## Phases
1. Audit (no code changes): write `docs/ui-audit.md` with the stack, current styling approach, screens, data shapes, motion currently used, and the risks.
2. Foundation: tokens (color, type, space, radius, motion), base components, the glass tab bar, the splash and routing, and the theme-before-paint fix.
3. Home and loading choreography: skeletons, the attendance reveal, the sheet and goal stepper, and refresh behavior.
4. Remaining screens restyled with the shared components.
5. Polish and QA: type check, lint, tests, `npm run build`, `npx cap sync android`, plus checks at both viewport sizes in both themes and with reduced motion on.

Final deliverable: a changelog by phase, a short design-system note (tokens and components), a "Not verified" list, and follow-ups. Begin with Phase 1 o# Add: "Welcome, {Student Name}" screen between login and Home

Work on the current branch. Do not touch backend, proxy, or auth logic. No new dependencies. Commit separately. Use the existing design tokens, easing curves, and motion rules.

## Behavior

After a SUCCESSFUL interactive login only, show a full-screen welcome moment, then reveal the attendance screen.

Flow: Login succeeds, then the welcome screen, then it fades up and away, then Home (attendance) plays its normal loading choreography.

- Do NOT show it on session restore or normal app relaunch. A restored session goes splash, then Home, exactly as today. Track this with an in-memory flag set only by the login success handler. Never persist it.
- Do NOT show it if login fails. Failed logins stay on the Login screen with the existing inline error.

## Timeline

- t = 0: login succeeds. Mount the welcome screen immediately and START fetching attendance and other Home data in parallel, so it is ready or nearly ready when the welcome ends.
- 0 to 450ms: "Welcome," fades in, then the student's name fades in and rises 8px into place (stagger about 120ms).
- Hold until about 1600ms total from t = 0. Make this one constant (`WELCOME_HOLD_MS = 1600`), clamped to between 1000 and 2000. The hold is a fixed moment and is NOT extended if data is slow.
- Exit (450ms): the whole welcome block fades out while moving UP about 16px (opacity 1 to 0, translateY 0 to -16px), using the movement easing curve `cubic-bezier(.32,.72,0,1)`.
- At the START of the exit, mount Home underneath. Both screens use the same background color, so the handoff is seamless with no flash. Home's attendance load choreography starts as the welcome fades: the ring draws, the number counts up, rows stagger in, and the bars fill. If data isn't ready yet, show the normal skeleton and play the reveal when it arrives.
- Tap anywhere to skip (jump straight to the exit). Respect the system back button: it must never return to the welcome or to Login after success. Replace the history entry so back from Home exits the app.

## Visual design (minimal, iOS-like)

- Background: the app background token. Nothing else on screen: no logo, no loader, no buttons.
- Content centered horizontally, positioned slightly above vertical center.
- "Welcome," in secondary text color, 17px, weight 500.
- The student's name below it in primary text, 34px, weight 700, tracking -0.03em, `text-wrap: balance`, max 2 lines, centered. Add a safe horizontal padding of 32px.
- Use only the existing tokens. No gradients, no glow, no emoji.

## Name handling (real data only)

- Use the authenticated student's name from the existing profile/session data. Never hardcode a name. No mock data.
- Portals often return names in ALL CAPS. Normalize to Title Case for display ("PRIYAM JAIN" becomes "Priyam Jain"), handling multiple words and hyphens or apostrophes sensibly.
- Show the full name if it fits in 2 lines. If it is very long (more than about 28 characters), show the first name only.
- If the name is missing or empty, show just "Welcome" (no comma, no placeholder) and keep the same timing.
- Never log the name or any credentials.

## Accessibility

- Container is `role="status"` with `aria-live="polite"`, so screen readers announce "Welcome, {name}". Focus then moves to the Home heading after the exit.
- `prefers-reduced-motion`: replace movement with a plain fade (no translate), shorten the hold to about 900ms, and skip stagger. The tap-to-skip still works.
- Text contrast meets AA in dark and light themes.
- The welcome never traps the user. Tap to skip is the escape, and it is available from the first frame.

## Engineering

- Implement as a small standalone component with a timeline driven by CSS transitions plus one timer, with the timers cleaned up on unmount and on skip. Avoid animation libraries.
- Put the sequence in the router or auth layer, not inside Login's UI, so the Login component stays presentation-only.
- Only transform and opacity animate. Set `will-change` only during the animation and remove it afterward.
- Preload what Home needs during the hold (data fetch only, no extra work on the main thread).

## Acceptance

- Verify: login success shows welcome then Home; wrong password never shows it; killing and reopening the app with a valid session skips it; back button never returns to welcome or Login; skip tap works; a slow network shows Home's skeleton right after the welcome; a very short name, a very long name, an all-caps name, and a missing name all render correctly; reduced-motion behaves as specified.
- Type check, lint, and build pass. Check at 360x800 and 412x915 in dark and light themes.
- End with "Verified" and "Not verified" lists. Don't claim anything was tested unless it was run.nly.

</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-17T09:15:03+05:30.

The user's current state is as follows:
Active Document: c:\Users\ASUS\Downloads\JPEE\lazyportal\android\gradle\wrapper\gradle-wrapper.properties (LANGUAGE_UNSPECIFIED)
Cursor is on line: 9
Other open documents:
- c:\Users\ASUS\Downloads\JPEE\lazyportal\android\app\src\main\res\drawable\widget_background.xml (LANGUAGE_XML)
- c:\Users\ASUS\Downloads\JPEE\lazyportal\packages\web\src\pages\AcademicCalendarPage.tsx (LANGUAGE_TSX)
- c:\Users\ASUS\Downloads\JPEE\lazyportal\packages\web\test\academicCalendar.test.js (LANGUAGE_JAVASCRIPT)
- c:\Users\ASUS\Downloads\JPEE\lazyportal\packages\web\playwright.config.js (LANGUAGE_JAVASCRIPT)
- c:\Users\ASUS\Downloads\JPEE\lazyportal\packages\web\src\pages\TimetablePage.tsx (LANGUAGE_TSX)
</ADDITIONAL_METADATA>