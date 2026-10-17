import { LocalNotifications, type Channel } from "@capacitor/local-notifications";

export const NOTIFICATION_CHANNEL_ID = "attendance_alerts";
export const NOTIFICATION_SETTINGS_KEY = "juet.attendance.notifications.settings";
export const LAST_STATUS_STORAGE_KEY = "juet.attendance.last_status_map";
export const DAILY_REMINDER_NOTIFICATION_ID = 99991;

export interface NotificationSettings {
  enabled: boolean;
  dailyReminderEnabled: boolean;
  dailyReminderTime: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  dailyReminderEnabled: false,
  dailyReminderTime: "20:00",
};

export interface SubjectStatusItem {
  code: string;
  name: string;
  percentage: number | null;
  status: string;
  goal: number;
}

export interface TransitionSubject {
  code: string;
  name: string;
  percentage: number | null;
  goal: number;
}

export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed?.enabled),
      dailyReminderEnabled: Boolean(parsed?.dailyReminderEnabled),
      dailyReminderTime: typeof parsed?.dailyReminderTime === "string" && parsed.dailyReminderTime ? parsed.dailyReminderTime : "20:00",
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("juet:notifications-settings-changed", { detail: settings }));
    }
  } catch {}
}

export async function checkNotificationPermission(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  if (typeof window === "undefined") return "unsupported";
  try {
    const result = await LocalNotifications.checkPermissions();
    if (result.display === "granted") return "granted";
    if (result.display === "denied") return "denied";
    return "prompt";
  } catch {
    if ("Notification" in window) {
      if (Notification.permission === "granted") return "granted";
      if (Notification.permission === "denied") return "denied";
      return "prompt";
    }
    return "unsupported";
  }
}

export async function requestNotificationPermission(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof window === "undefined") return "unsupported";
  try {
    const result = await LocalNotifications.requestPermissions();
    if (result.display === "granted") return "granted";
    return "denied";
  } catch {
    if ("Notification" in window && typeof Notification.requestPermission === "function") {
      try {
        const res = await Notification.requestPermission();
        return res === "granted" ? "granted" : "denied";
      } catch {
        return "denied";
      }
    }
    return "unsupported";
  }
}

export async function ensureNotificationChannel(): Promise<void> {
  try {
    const channel: Channel = {
      id: NOTIFICATION_CHANNEL_ID,
      name: "Attendance Alerts",
      description: "Alerts when subject attendance drops below target goal",
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: undefined,
      lights: true,
    };
    await LocalNotifications.createChannel(channel);
  } catch {}
}

export function detectStatusTransitions(
  currentSubjects: readonly SubjectStatusItem[],
  customLastStatusMap?: Record<string, string> | null
): {
  transitions: TransitionSubject[];
  nextStatusMap: Record<string, string>;
  isFirstRun: boolean;
} {
  let prevMap: Record<string, string> = {};
  let isFirstRun = false;

  if (customLastStatusMap !== undefined && customLastStatusMap !== null) {
    prevMap = customLastStatusMap;
  } else {
    try {
      const raw = localStorage.getItem(LAST_STATUS_STORAGE_KEY);
      if (!raw) {
        isFirstRun = true;
      } else {
        prevMap = JSON.parse(raw);
      }
    } catch {
      isFirstRun = true;
    }
  }

  const nextStatusMap: Record<string, string> = {};
  const transitions: TransitionSubject[] = [];

  for (const sub of currentSubjects) {
    if (!sub.code) continue;
    const currentStatus = sub.status;
    nextStatusMap[sub.code] = currentStatus;

    if (!isFirstRun && currentStatus === "below") {
      const previousStatus = prevMap[sub.code];
      if (previousStatus && previousStatus !== "below") {
        transitions.push({
          code: sub.code,
          name: sub.name,
          percentage: sub.percentage,
          goal: sub.goal,
        });
      }
    }
  }

  return {
    transitions,
    nextStatusMap,
    isFirstRun,
  };
}

export function saveLastStatusMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(LAST_STATUS_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function formatTransitionNotification(
  newlyBelowSubjects: readonly TransitionSubject[]
): { title: string; body: string } {
  const count = newlyBelowSubjects.length;
  if (count === 1) {
    const s = newlyBelowSubjects[0];
    const pctStr = s.percentage !== null ? `${s.percentage}%` : "0%";
    return {
      title: `Attendance Alert: ${s.name}`,
      body: `${s.name} is now at ${pctStr}, which is below your target goal of ${s.goal}%.`,
    };
  }

  const listStr = newlyBelowSubjects
    .map((s) => `${s.name} (${s.percentage !== null ? `${s.percentage}%` : "0%"})`)
    .join(", ");

  return {
    title: `Attendance Alert: ${count} subjects below goal`,
    body: `${count} subjects dropped below target goal: ${listStr}.`,
  };
}

export async function dispatchAttendanceAlertIfNeeded(
  newlyBelowSubjects: readonly TransitionSubject[]
): Promise<boolean> {
  if (newlyBelowSubjects.length === 0) return false;

  const settings = loadNotificationSettings();
  if (!settings.enabled) return false;

  const perm = await checkNotificationPermission();
  if (perm !== "granted") return false;

  await ensureNotificationChannel();

  const { title, body } = formatTransitionNotification(newlyBelowSubjects);
  const notificationId = Math.floor(Date.now() % 100000) + 10;

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId,
          title,
          body,
          channelId: NOTIFICATION_CHANNEL_ID,
          smallIcon: "ic_launcher_round",
          schedule: { at: new Date(Date.now() + 500) },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

export async function syncDailyReminder(
  subjectsBelowGoal: readonly { name: string; percentage: number | null; goal: number }[]
): Promise<void> {
  const settings = loadNotificationSettings();

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: DAILY_REMINDER_NOTIFICATION_ID }],
    });
  } catch {}

  if (!settings.enabled || !settings.dailyReminderEnabled) {
    return;
  }

  const perm = await checkNotificationPermission();
  if (perm !== "granted") return;

  await ensureNotificationChannel();

  const [hoursStr, minutesStr] = (settings.dailyReminderTime || "20:00").split(":");
  const hours = parseInt(hoursStr || "20", 10);
  const minutes = parseInt(minutesStr || "0", 10);

  const targetDate = new Date();
  targetDate.setHours(hours, minutes, 0, 0);
  if (targetDate.getTime() <= Date.now()) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const belowCount = subjectsBelowGoal.length;
  let body: string;
  if (belowCount === 0) {
    body = "All your subjects are currently on track with your attendance goals.";
  } else {
    const names = subjectsBelowGoal.slice(0, 3).map((s) => s.name).join(", ");
    body = `${belowCount} ${belowCount === 1 ? "subject is" : "subjects are"} currently below goal (${names}).`;
  }

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: DAILY_REMINDER_NOTIFICATION_ID,
          title: "Daily Attendance Summary",
          body,
          channelId: NOTIFICATION_CHANNEL_ID,
          schedule: {
            at: targetDate,
            repeats: true,
            every: "day",
          },
        },
      ],
    });
  } catch {}
}
