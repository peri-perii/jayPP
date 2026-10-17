import { useState, useEffect, useRef } from "react";
import {
  LogOut,
  Sun,
  Moon,
  Laptop,
  Wifi,
  Bell,
  ChevronRight,
  User,
  Building2,
  Sparkles,
  Calculator,
  Target,
} from "lucide-react";
import { FacultySection } from "../sections/faculty";
import { SubjectsSection } from "../sections/subjects";
import { ReconnectModal } from "../components/ReconnectModal";
import { AttendanceSettingsSheet } from "../components/AttendanceSettingsSheet";
import { AttendanceCalculatorSheet } from "../components/AttendanceCalculatorSheet";
import { loadGoalsConfig, subscribeGoals, type AttendanceGoalsConfig } from "../lib/attendanceGoals";
import { titleCase } from "../components/DataViews";
import { useTabScroll } from "../lib/tabScroll";
import type { Session } from "../types";

interface InstituteOption {
  value?: string;
  label?: string;
}

export function MorePage({
  session,
  isExpired,
  isRecovering,
  onLogout,
  onSessionRenewed,
  onSelectInstitute,
}: {
  session: Session;
  isExpired?: boolean;
  isRecovering?: boolean;
  onLogout: () => void;
  onSessionRenewed?: (s: Session) => void;
  onSelectInstitute?: (instituteid: string) => void;
}) {
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [goalsConfig, setGoalsConfig] = useState<AttendanceGoalsConfig>(() => loadGoalsConfig());
  const [theme, setTheme] = useState<"system" | "light" | "dark">(() => {
    try {
      return (localStorage.getItem("juet.portal.theme") as "system" | "light" | "dark") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    if (isRecovering || !isExpired) setShowRenewModal(false);
  }, [isExpired, isRecovering]);

  useEffect(() => {
    return subscribeGoals((cfg) => setGoalsConfig(cfg));
  }, []);

  const applyThemePreference = (nextTheme: "system" | "light" | "dark") => {
    setTheme(nextTheme);
    try {
      localStorage.setItem("juet.portal.theme", nextTheme);
    } catch {}

    if (nextTheme === "system") {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", nextTheme);
    }
  };

  const institutes = (session.institutelist as InstituteOption[] | undefined) ?? [];
  const displayName = titleCase(session.name ?? session.enrollmentno ?? "Student");
  const enrollment = session.enrollmentno ?? "";
  const initialLetter = displayName.charAt(0).toUpperCase() || "S";

  const [isCompact, setIsCompact] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useTabScroll("more", scrollContainerRef);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const compact = el.scrollTop > 8;
    setIsCompact((prev) => (prev !== compact ? compact : prev));
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
    <main className="dash dash-view-enter">
      <header className={`dash-top-bar ${isCompact ? "is-compact" : ""}`}>
        <div className="dash-user-meta">
          <h1 className="dash-user-name">More</h1>
          <div className="dash-user-sub">
            <span className="dash-sync-time">{displayName} · {enrollment}</span>
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
        </div>
      </header>

      <div className="dash-scroll-container" ref={scrollContainerRef} onScroll={handleScroll}>
        <section className="more-profile-card" aria-label="Student Profile Summary">
          <div className="more-avatar-box">
            <span className="more-avatar-text">{initialLetter}</span>
          </div>
          <div className="more-profile-info">
            <h2 className="more-profile-name">{displayName}</h2>
            <div className="more-profile-chips">
              {enrollment && <span className="more-pill-badge">{enrollment}</span>}
              {session.instituteid && (
                <span className="more-pill-badge muted">
                  <Building2 size={11} />
                  <span>{session.instituteid}</span>
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="more-group-card" aria-label="Settings and Preferences">
          <div className="more-group-header">
            <span className="more-group-title">Preferences</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="more-row-action"
            aria-label="Set attendance goal and alerts"
          >
            <div className="more-row-left">
              <div className="more-icon-container">
                <Target size={18} />
              </div>
              <div className="more-row-texts">
                <span className="more-row-primary">Set Attendance Goal &amp; Alerts</span>
                <span className="more-row-secondary">
                  Target {goalsConfig.defaultGoal}% · Sync notifications &amp; thresholds
                </span>
              </div>
            </div>
            <ChevronRight size={18} className="more-row-arrow" />
          </button>

          <div className="more-divider" />

          <button
            type="button"
            onClick={() => setShowCalculatorModal(true)}
            className="more-row-action"
            aria-label="Attendance calculator and bunk simulator"
          >
            <div className="more-row-left">
              <div className="more-icon-container att-calc-icon-container">
                <Calculator size={18} />
              </div>
              <div className="more-row-texts">
                <span className="more-row-primary">Attendance &amp; Bunk Calculator</span>
                <span className="more-row-secondary">
                  Simulate bunk allowance (e.g. {goalsConfig.defaultGoal}% goal)
                </span>
              </div>
            </div>
            <ChevronRight size={18} className="more-row-arrow" />
          </button>

          <div className="more-divider" />

          <div className="more-row-static">
            <div className="more-row-left">
              <div className="more-icon-container">
                {theme === "dark" ? <Moon size={18} /> : theme === "light" ? <Sun size={18} /> : <Laptop size={18} />}
              </div>
              <div className="more-row-texts">
                <span className="more-row-primary">Appearance</span>
                <span className="more-row-secondary">Choose app theme</span>
              </div>
            </div>

            <div className="more-theme-pills">
              <button
                type="button"
                aria-pressed={theme === "light"}
                onClick={() => applyThemePreference("light")}
                className={`more-theme-btn ${theme === "light" ? "is-active" : ""}`}
                aria-label="Light theme"
              >
                <Sun size={13} />
                <span>Light</span>
              </button>
              <button
                type="button"
                aria-pressed={theme === "dark"}
                onClick={() => applyThemePreference("dark")}
                className={`more-theme-btn ${theme === "dark" ? "is-active" : ""}`}
                aria-label="Dark theme"
              >
                <Moon size={13} />
                <span>Dark</span>
              </button>
              <button
                type="button"
                aria-pressed={theme === "system"}
                onClick={() => applyThemePreference("system")}
                className={`more-theme-btn ${theme === "system" ? "is-active" : ""}`}
                aria-label="System theme"
              >
                <Laptop size={13} />
                <span>Auto</span>
              </button>
            </div>
          </div>

          {institutes.length > 1 && onSelectInstitute && (
            <>
              <div className="more-divider" />
              <div className="more-institute-box">
                <label htmlFor="institute-select-more" className="more-institute-label">
                  Active Institute
                </label>
                <select
                  id="institute-select-more"
                  value={String(session.instituteid ?? "")}
                  onChange={(e) => onSelectInstitute(e.target.value)}
                  className="dash-institute-select"
                >
                  {institutes.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                      {String(o.label ?? o.value)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </section>

        <div className="more-group-header-label">
          <span>Academic Directory</span>
        </div>

        <div className="m3-stacked-sections" role="list">
          <FacultySection
            key={`faculty:${String(session.instituteid ?? "")}`}
            session={session}
            onLogout={onLogout}
          />

          <SubjectsSection
            key={`subjects:${String(session.instituteid ?? "")}`}
            session={session}
            onLogout={onLogout}
          />
        </div>

        <section className="more-group-card" aria-label="Session Controls">
          <div className="more-logout-wrapper">
            {!showLogoutConfirm ? (
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="m3-connected-btn logout-action more-logout-btn"
                aria-label="Log out of student portal"
              >
                <LogOut size={16} />
                <span>Log out</span>
              </button>
            ) : (
              <div className="more-logout-confirm-box" role="alert">
                <span className="more-logout-confirm-text">Log out of your session?</span>
                <div className="more-logout-confirm-actions">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="more-logout-cancel-btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="more-logout-danger-btn"
                  >
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <footer className="more-footer">
          <span className="peri-watermark">peri-peri</span>
        </footer>
      </div>

      {renewModal}
      {showSettingsModal && (
        <AttendanceSettingsSheet
          onClose={() => setShowSettingsModal(false)}
          onSaved={() => setGoalsConfig(loadGoalsConfig())}
        />
      )}
      {showCalculatorModal && (
        <AttendanceCalculatorSheet
          session={session}
          initialGoal={goalsConfig.defaultGoal}
          onClose={() => setShowCalculatorModal(false)}
          onGoalSaved={() => setGoalsConfig(loadGoalsConfig())}
        />
      )}
    </main>
  );
}
