import type { NotificationMode } from "./task";

export type StartupVisibility = "visible" | "hidden" | "tray";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Settings {
  /** Whether the app registers itself as a login/startup item */
  launchAtStartup: boolean;
  /** Window state when the app launches */
  startupVisibility: StartupVisibility;
  /** Last-known window position and size, persisted across sessions */
  windowBounds: WindowBounds | null;
  /** Fallback notification mode applied to new tasks */
  defaultNotificationMode: NotificationMode | null;
  /** Minutes before a due time to fire the first reminder */
  reminderLeadMinutes: number;
  /** Interval in minutes between repeated "nag" notifications */
  nagIntervalMinutes: number;
}
