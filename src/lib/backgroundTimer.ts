/**
 * backgroundTimer.ts
 *
 * Runs the recurrence-reset and notification checks on a 60-second interval.
 * Independent of window visibility — the interval keeps ticking as long as
 * the Tauri webview process is alive (i.e. always, since close just hides it).
 *
 * Usage:
 *   const stop = startBackgroundTimer(getBoardsSnapshot, getSettingsSnapshot, {
 *     onTasksUpdated: (boardId, updatedTasks) => store.reorderTasks(boardId, updatedTasks)
 *   });
 *   // Later (e.g. unmount, though in practice we never stop):
 *   stop();
 *
 * The caller provides snapshot getters (not Zustand state directly) so the
 * timer closure always reads the latest values without stale captures.
 */

import type { Board } from "../types/board";
import type { Task } from "../types/task";
import type { Settings } from "../types/settings";
import { getRecurrenceResets } from "./recurrenceService";
import { checkNotifications } from "./notificationService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackgroundTimerCallbacks {
  /** Called for each board whose tasks were mutated (recurrence reset or notification flag update). */
  onTasksUpdated: (boardId: string, tasks: Task[]) => Promise<void>;
}

export type StopFn = () => void;

// ─── Public API ───────────────────────────────────────────────────────────────

const TICK_MS = 60_000; // 60 seconds

let activeTick: (() => Promise<void>) | null = null;
let ticking = false;

/**
 * Trigger an immediate background check (e.g. after adding or editing a task).
 */
export function triggerBackgroundTimer(): void {
  if (activeTick && !ticking) {
    void activeTick();
  }
}

/**
 * Start the background timer.
 * Returns a stop function (call on app teardown if ever needed).
 */
export function startBackgroundTimer(
  getBoards: () => Board[],
  getSettings: () => Settings,
  callbacks: BackgroundTimerCallbacks,
): StopFn {
  console.info("[backgroundTimer] starting notification timer", {
    intervalMs: TICK_MS,
  });
  activeTick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      console.info("[backgroundTimer] tick started");
      await tick(getBoards, getSettings, callbacks);
      console.info("[backgroundTimer] tick finished");
    } finally {
      ticking = false;
    }
  };

  // Run once immediately so we catch anything that's already due on launch
  void activeTick();

  const handle = setInterval(() => {
    void activeTick?.();
  }, TICK_MS);

  return () => {
    clearInterval(handle);
    activeTick = null;
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function tick(
  getBoards: () => Board[],
  getSettings: () => Settings,
  callbacks: BackgroundTimerCallbacks,
): Promise<void> {
  const boards = getBoards();
  const settings = getSettings();

  console.info("[backgroundTimer] checking boards", {
    boardCount: boards.length,
    settings,
  });

  for (const board of boards) {
    let tasks = [...board.tasks];
    let dirty = false;

    // ── 1. Recurrence resets ────────────────────────────────────────────────
    const resets = getRecurrenceResets(tasks);
    if (resets.length > 0) {
      const resetIds = new Set(resets.map((t) => t.id));
      tasks = tasks.map((t) => (resetIds.has(t.id) ? resets.find((r) => r.id === t.id)! : t));
      dirty = true;
    }

    // ── 2. Notification checks ──────────────────────────────────────────────
    const notifUpdates = await checkNotifications(tasks, settings);
    if (notifUpdates.length > 0) {
      const updateMap = new Map(notifUpdates.map((u) => [u.taskId, u]));
      tasks = tasks.map((t) => {
        const upd = updateMap.get(t.id);
        if (!upd) return t;
        return { ...t, notified: upd.notified, last_notified: upd.last_notified };
      });
      dirty = true;
    }

    // ── 3. Persist if anything changed ─────────────────────────────────────
    if (dirty) {
      try {
        await callbacks.onTasksUpdated(board.id, tasks);
      } catch (err) {
        console.error(
          `[backgroundTimer] onTasksUpdated failed for board ${board.id}:`,
          err,
        );
      }
    }
  }
}
