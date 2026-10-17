import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Bell,
  Clock,
  RotateCcw,
  Sliders,
  AlertTriangle,
  Info,
  Check,
  Minus,
  Plus,
} from "lucide-react";
import {
  loadGoalsConfig,
  saveGoalsConfig,
  setDefaultGoal,
  resetSubjectGoal,
  resetAllSubjectGoals,
  type AttendanceGoalsConfig,
} from "../lib/attendanceGoals.ts";
import {
  loadNotificationSettings,
  saveNotificationSettings,
  checkNotificationPermission,
  requestNotificationPermission,
  type NotificationSettings,
} from "../lib/notifications.ts";

interface AttendanceSettingsSheetProps {
  onClose: () => void;
  onSaved?: () => void;
}

export function AttendanceSettingsSheet({ onClose, onSaved }: AttendanceSettingsSheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [goalsConfig, setGoalsConfig] = useState<AttendanceGoalsConfig>(() => loadGoalsConfig());
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(() => loadNotificationSettings());
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "prompt" | "unsupported">("prompt");
  const [isRequestingPerm, setIsRequestingPerm] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, 200);
  }, [isClosing, onClose]);

  useEffect(() => {
    checkNotificationPermission().then(setPermissionState);
  }, []);

  useEffect(() => {
    window.history.pushState({ attendanceSettings: true }, "");

    const handlePopState = () => {
      handleClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.history.back();
      }
      if (e.key === "Tab" && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    if (closeBtnRef.current) {
      closeBtnRef.current.focus();
    }

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose]);

  const handleDefaultGoalStep = (delta: number) => {
    const next = Math.min(100, Math.max(50, goalsConfig.defaultGoal + delta));
    setDefaultGoal(next);
    setGoalsConfig(loadGoalsConfig());
    if (onSaved) onSaved();
  };

  const handleDefaultGoalSlider = (val: number) => {
    const next = Math.min(100, Math.max(50, val));
    setDefaultGoal(next);
    setGoalsConfig(loadGoalsConfig());
    if (onSaved) onSaved();
  };

  const handleToggleNotifications = async () => {
    if (!notifSettings.enabled) {
      setIsRequestingPerm(true);
      const perm = await requestNotificationPermission();
      setPermissionState(perm);
      setIsRequestingPerm(false);

      if (perm === "granted") {
        const updated = { ...notifSettings, enabled: true };
        setNotifSettings(updated);
        saveNotificationSettings(updated);
        if (onSaved) onSaved();
      }
    } else {
      const updated = { ...notifSettings, enabled: false };
      setNotifSettings(updated);
      saveNotificationSettings(updated);
      if (onSaved) onSaved();
    }
  };

  const handleToggleDailyReminder = () => {
    const updated = {
      ...notifSettings,
      dailyReminderEnabled: !notifSettings.dailyReminderEnabled,
    };
    setNotifSettings(updated);
    saveNotificationSettings(updated);
    if (onSaved) onSaved();
  };

  const handleTimeChange = (timeStr: string) => {
    const updated = { ...notifSettings, dailyReminderTime: timeStr };
    setNotifSettings(updated);
    saveNotificationSettings(updated);
    if (onSaved) onSaved();
  };

  const handleResetOverride = (code: string) => {
    resetSubjectGoal(code);
    setGoalsConfig(loadGoalsConfig());
    if (onSaved) onSaved();
  };

  const handleResetAllOverrides = () => {
    resetAllSubjectGoals();
    setGoalsConfig(loadGoalsConfig());
    if (onSaved) onSaved();
  };

  const overrideEntries = Object.entries(goalsConfig.overrides);

  return (
    <div
      className={`bottom-sheet-backdrop ${isClosing ? "is-closing" : ""}`}
      onClick={() => window.history.back()}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={`bottom-sheet-modal notif-settings-modal ${isClosing ? "is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-settings-title"
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />

        <div className="bottom-sheet-header">
          <div className="bottom-sheet-titles">
            <h2 id="notif-settings-title" className="bottom-sheet-title">
              Attendance Goals & Notifications
            </h2>
            <span className="bottom-sheet-code">Thresholds and sync alerts</span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="bottom-sheet-close-btn"
            onClick={() => window.history.back()}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bottom-sheet-content">
          <div className="settings-notice-box">
            <Info size={16} className="notice-icon" />
            <div className="notice-text-group">
              <span className="notice-title">Sync-Triggered Alerts</span>
              <p className="notice-body">
                Alerts are checked whenever the app syncs upon opening or manual refresh. J.P P stores credentials locally on device and does not run background polling servers.
              </p>
            </div>
          </div>

          <section className="settings-card-group" aria-label="Default Goal Setting">
            <div className="settings-card-header">
              <span className="settings-group-label">Default Target Goal</span>
              <span className="settings-goal-value">{goalsConfig.defaultGoal}%</span>
            </div>

            <div className="bottom-sheet-goal-stepper">
              <button
                type="button"
                onClick={() => handleDefaultGoalStep(-1)}
                disabled={goalsConfig.defaultGoal <= 50}
                className="goal-stepper-btn"
                aria-label="Decrease default goal"
              >
                <Minus size={16} />
              </button>

              <div className="goal-slider-wrapper">
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={1}
                  value={goalsConfig.defaultGoal}
                  onChange={(e) => handleDefaultGoalSlider(Number(e.target.value))}
                  className="goal-slider-input"
                  aria-label="Default attendance goal"
                />
              </div>

              <button
                type="button"
                onClick={() => handleDefaultGoalStep(1)}
                disabled={goalsConfig.defaultGoal >= 100}
                className="goal-stepper-btn"
                aria-label="Increase default goal"
              >
                <Plus size={16} />
              </button>
            </div>
          </section>

          <section className="settings-card-group" aria-label="Notification Preferences">
            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <div className="settings-toggle-title">
                  <Bell size={16} />
                  <span>Below Goal Alerts</span>
                </div>
                <p className="settings-toggle-desc">
                  Notify when a subject falls below its target goal after syncing.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notifSettings.enabled}
                onClick={handleToggleNotifications}
                disabled={isRequestingPerm}
                className={`settings-switch ${notifSettings.enabled ? "is-on" : ""}`}
                aria-label="Toggle below goal alerts"
              >
                <span className="switch-thumb" />
              </button>
            </div>

            {permissionState === "denied" && (
              <div className="settings-warning-box">
                <AlertTriangle size={15} />
                <span>
                  Notifications are blocked in your system settings. Enable notification permissions in your OS Settings &gt; Apps &gt; JUET Portal to receive alerts.
                </span>
              </div>
            )}

            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <div className="settings-toggle-title">
                  <Clock size={16} />
                  <span>Daily Summary Reminder</span>
                </div>
                <p className="settings-toggle-desc">
                  Receive a scheduled daily reminder summarizing subjects below goal.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notifSettings.dailyReminderEnabled}
                onClick={handleToggleDailyReminder}
                disabled={!notifSettings.enabled}
                className={`settings-switch ${notifSettings.dailyReminderEnabled ? "is-on" : ""}`}
                aria-label="Toggle daily summary reminder"
              >
                <span className="switch-thumb" />
              </button>
            </div>

            {notifSettings.dailyReminderEnabled && (
              <div className="settings-time-row">
                <label htmlFor="daily-time-input" className="settings-time-label">
                  Reminder time
                </label>
                <input
                  id="daily-time-input"
                  type="time"
                  value={notifSettings.dailyReminderTime}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="settings-time-input"
                />
              </div>
            )}
          </section>

          <section className="settings-card-group" aria-label="Per Subject Overrides">
            <div className="settings-card-header">
              <div className="settings-toggle-title">
                <Sliders size={16} />
                <span>Subject Overrides ({overrideEntries.length})</span>
              </div>
              {overrideEntries.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetAllOverrides}
                  className="reset-all-btn"
                  title="Reset all subject goals to default"
                >
                  <RotateCcw size={12} />
                  <span>Reset All</span>
                </button>
              )}
            </div>

            {overrideEntries.length === 0 ? (
              <p className="settings-empty-overrides">
                No custom subject overrides. All courses follow the default target of {goalsConfig.defaultGoal}%. Set individual goals from any subject&apos;s details on Home.
              </p>
            ) : (
              <div className="overrides-list">
                {overrideEntries.map(([code, goal]) => (
                  <div key={code} className="override-row">
                    <div className="override-meta">
                      <span className="override-code">{code}</span>
                      <span className="override-goal">{goal}%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResetOverride(code)}
                      className="override-reset-btn"
                      title={`Reset ${code} to default`}
                    >
                      <RotateCcw size={13} />
                      <span>Reset</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
