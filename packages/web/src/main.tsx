import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";
import { Analytics } from "@vercel/analytics/react";
import { useSession } from "./hooks/useSession";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AttendancePage } from "./pages/AttendancePage";
import { TimetablePage } from "./pages/TimetablePage";
import { ResultsPage } from "./pages/ResultsPage";
import { MorePage } from "./pages/MorePage";
import { AcademicCalendarPage } from "./pages/AcademicCalendarPage";
import { BottomNav, type TabId } from "./components/BottomNav";
import { ReconnectModal } from "./components/ReconnectModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { preloadAttendanceData } from "./sections/attendance";
import { scrollToTopTab } from "./lib/tabScroll";
import type { Session } from "./types";
import "./styles.css";

type ViewRoute = "home" | "attendance" | "timetable" | "results" | "more" | "calendar";

function hashToRoute(hash: string): ViewRoute {
  switch (hash) {
    case "#attendance":
    case "#home":
      return "home";
    case "#timetable":
    case "#schedule":
      return "timetable";
    case "#results":
    case "#academics":
      return "results";
    case "#calendar":
      return "calendar";
    case "#more":
      return "more";
    default:
      return "home";
  }
}

function routeToActiveTab(route: ViewRoute): TabId {
  if (route === "attendance") return "home";
  return route;
}

function AppShell({
  session,
  isExpired,
  isRecovering,
  save,
  logout,
}: {
  session: NonNullable<ReturnType<typeof useSession>["session"]>;
  isExpired: boolean;
  isRecovering: boolean;
  save: (s: typeof session) => void;
  logout: () => void;
}) {
  const [currentRoute, setCurrentRoute] = useState<ViewRoute>(() =>
    hashToRoute(window.location.hash)
  );
  const [showRenewModal, setShowRenewModal] = useState(false);

  useEffect(() => {
    if (isRecovering || !isExpired) {
      setShowRenewModal(false);
    }
  }, [isExpired, isRecovering]);

  const navigateTab = useCallback((tab: TabId) => {
    const active = routeToActiveTab(currentRoute);
    if (tab === active) {
      scrollToTopTab(tab);
      return;
    }
    const hash = `#${tab}`;
    const transition = () => {
      window.location.hash = hash;
      setCurrentRoute(tab);
    };
    if ("startViewTransition" in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(transition);
    } else {
      transition();
    }
  }, [currentRoute]);

  const handleBackFromAttendance = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTab("home");
    }
  }, [navigateTab]);

  const handleBackFromCalendar = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTab("home");
    }
  }, [navigateTab]);

  useEffect(() => {
    const handleHash = () => {
      setCurrentRoute(hashToRoute(window.location.hash));
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    const cap = (globalThis as unknown as {
      Capacitor?: {
        Plugins?: {
          App?: {
            addListener: (evt: string, cb: (data: { canGoBack: boolean }) => void) => { remove: () => void };
            exitApp: () => void;
          };
        };
      };
    }).Capacitor;
    const appPlugin = cap?.Plugins?.App;
    if (!appPlugin) return;

    let sub: { remove: () => void } | null = null;
    try {
      sub = appPlugin.addListener("backButton", ({ canGoBack }: { canGoBack: boolean }) => {
        const current = hashToRoute(window.location.hash);
        if (current !== "home") {
          navigateTab("home");
        } else if (canGoBack && window.history.length > 1) {
          window.history.back();
        } else {
          appPlugin.exitApp();
        }
      });
    } catch {}

    return () => {
      sub?.remove();
    };
  }, [navigateTab]);

  const handleSelectInstitute = (instituteid: string) => {
    const match = ((session.institutelist as { value?: string; label?: string }[] | undefined) ?? [])
      .find((o) => String(o.value) === instituteid);
    save({ ...session, instituteid, institutename: match?.label ?? session.institutename });
  };

  const renewModal = showRenewModal ? (
    <ReconnectModal
      session={session}
      onRenewed={(s) => {
        setShowRenewModal(false);
        save(s);
      }}
      onClose={() => setShowRenewModal(false)}
    />
  ) : null;

  let page: React.ReactNode;

  switch (currentRoute) {
    case "attendance":
      page = (
        <AttendancePage
          session={session}
          isExpired={isExpired}
          isRecovering={isRecovering}
          onBack={handleBackFromAttendance}
          onLogout={logout}
          onRequestRenew={() => setShowRenewModal(true)}
        />
      );
      break;
    case "timetable":
      page = (
        <TimetablePage
          session={session}
          isExpired={isExpired}
          isRecovering={isRecovering}
          onLogout={logout}
          onSessionRenewed={save}
        />
      );
      break;
    case "results":
      page = (
        <ResultsPage
          session={session}
          isExpired={isExpired}
          isRecovering={isRecovering}
          onLogout={logout}
          onSessionRenewed={save}
        />
      );
      break;
    case "calendar":
      page = (
        <AcademicCalendarPage
          onBack={handleBackFromCalendar}
        />
      );
      break;
    case "more":
      page = (
        <MorePage
          session={session}
          isExpired={isExpired}
          isRecovering={isRecovering}
          onLogout={logout}
          onSessionRenewed={save}
          onSelectInstitute={handleSelectInstitute}
        />
      );
      break;
    default:
      page = (
        <DashboardPage
          session={session}
          isExpired={isExpired}
          isRecovering={isRecovering}
          onLogout={logout}
          onSessionRenewed={save}
          onSelectInstitute={handleSelectInstitute}
        />
      );
  }

  return (
    <div className="app-shell">
      <div className="app-shell-content">
        {page}
      </div>
      <BottomNav active={routeToActiveTab(currentRoute)} onChange={navigateTab} />
      {renewModal}
    </div>
  );
}

function SplashScreen({ onFadedOut }: { onFadedOut: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Session restore is synchronous in useSession. Crossfade out in 450ms on startup.
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 60);

    const doneTimer = setTimeout(() => {
      onFadedOut();
    }, 510);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onFadedOut]);

  return (
    <div className={`app-splash-screen ${fading ? "is-fading-out" : ""}`} aria-hidden="true">
      <div className="splash-center">
        <div className="splash-mark-wrap">
          <svg className="splash-ring-spinner" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="32" strokeWidth="2.5" />
          </svg>
          <div className="splash-logo-mark">J</div>
        </div>
        <div className="splash-app-name">J.P P</div>
      </div>
    </div>
  );
}

function App() {
  const { session, isExpired, isRecovering, save, logout } = useSession();
  const [welcomeSession, setWelcomeSession] = useState<Session | null>(null);
  const [mountHomeUnderneath, setMountHomeUnderneath] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const handleLoginDone = useCallback(
    (s: Session) => {
      // 1. Persist session to local storage and hook state
      save(s);

      // 2. Replace browser history so pressing back exits the app instead of returning to login
      try {
        window.history.replaceState(null, "", "#home");
      } catch {}

      // 3. Kick off attendance data preload immediately in parallel (t = 0)
      preloadAttendanceData(s);

      // 4. Set in-memory welcome session (never persisted; only active after interactive login)
      setWelcomeSession(s);
      setMountHomeUnderneath(false);
    },
    [save]
  );

  const handleWelcomeStartExit = useCallback(() => {
    // Mount Home underneath right as the Welcome screen begins its upward exit transition
    setMountHomeUnderneath(true);
  }, []);

  const handleWelcomeComplete = useCallback(() => {
    setWelcomeSession(null);
    setMountHomeUnderneath(false);

    // Shift accessible focus to the Home heading after exit
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("[data-home-heading], .dash-user-name, h1");
      heading?.focus();
    });
  }, []);

  const handleLogout = useCallback(() => {
    setWelcomeSession(null);
    setMountHomeUnderneath(false);
    logout();
  }, [logout]);

  return (
    <>
      {showSplash && <SplashScreen onFadedOut={() => setShowSplash(false)} />}
      {!session ? (
        <LoginPage onDone={handleLoginDone} />
      ) : (
        <>
          {(!welcomeSession || mountHomeUnderneath) && (
            <AppShell
              session={session}
              isExpired={isExpired}
              isRecovering={isRecovering}
              save={save}
              logout={handleLogout}
            />
          )}
          {welcomeSession && (
            <WelcomeScreen
              rawName={welcomeSession.name}
              onStartExit={handleWelcomeStartExit}
              onComplete={handleWelcomeComplete}
            />
          )}
        </>
      )}
    </>
  );
}

const el = document.getElementById("root");
if (!el) throw new Error("#root element missing");

if (typeof window !== "undefined" && window.matchMedia) {
  let savedTheme: string | null = null;
  try {
    savedTheme = localStorage.getItem("juet.portal.theme");
  } catch {}
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = (dark: boolean) => {
    if (savedTheme === "system") {
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    } else if (savedTheme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  };
  applyTheme(mq.matches);
  if (mq.addEventListener) {
    mq.addEventListener("change", (e) => {
      try {
        savedTheme = localStorage.getItem("juet.portal.theme");
      } catch {}
      if (savedTheme === "system") {
        applyTheme(e.matches);
      }
    });
  } else if (mq.addListener) {
    mq.addListener((e) => {
      try {
        savedTheme = localStorage.getItem("juet.portal.theme");
      } catch {}
      if (savedTheme === "system") {
        applyTheme(e.matches);
      }
    });
  }
}

createRoot(el).render(
  <ErrorBoundary>
    <App />
    <Analytics />
  </ErrorBoundary>
);

if (typeof window !== "undefined" && "serviceWorker" in navigator && import.meta.env.PROD) {
  const isNative =
    typeof (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      ?.isNativePlatform === "function"
      ? (globalThis as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform()
      : false;
  if (!isNative) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

if (
  typeof window !== "undefined" &&
  import.meta.env.PROD &&
  !["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname)
) {
  const cf = document.createElement("script");
  cf.defer = true;
  cf.src = "https://static.cloudflareinsights.com/beacon.min.js";
  cf.setAttribute("data-cf-beacon", '{"token": "5fccd3a60a2841158d9930b0680d958d"}');
  document.head.appendChild(cf);
}
