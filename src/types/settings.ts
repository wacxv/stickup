import type { NotificationMode } from "./task";

/** How the window should appear on launch */
export type StartupVisibility = "shown" | "hidden";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Settings {
  /** Register app as a system login/startup item */
  launchAtStartup: boolean;
  /** Window visibility on launch */
  startupVisibility: StartupVisibility;
  /** Last-known window position + size; null until first close */
  windowBounds: WindowBounds | null;
  /** Global fallback notification mode; null = notifications off by default */
  defaultNotificationMode: NotificationMode | null;
  /** Minutes before due time to fire the first reminder */
  reminderLeadMinutes: number;
  /** Minutes between repeated nag notifications */
  nagIntervalMinutes: number;
}
