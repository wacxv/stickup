import type { NotificationMode } from "./task";

/** How the window should appear on launch */
export type StartupVisibility = "shown" | "hidden";

/** Which main pane should be shown first in the narrow layout */
export type LastOpenPane = "notes" | "tasks";

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
  /** Last selected main pane */
  lastOpenPane: LastOpenPane;
  /** Global fallback notification mode; null = notifications off by default */
  defaultNotificationMode: NotificationMode | null;
  /** Minutes before due time to fire the first reminder */
  reminderLeadMinutes: number;
  /** Minutes between repeated nag notifications */
  nagIntervalMinutes: number;
}
