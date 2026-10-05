import type { Task } from "./task";

export interface Board {
  /** Unique identifier — never changes, even on rename */
  id: string;
  /** Display title */
  title: string;
  /** Slugified filename (without .md) — derived from title, collision-safe */
  slug: string;
  /** 0-based sort order among all boards */
  order: number;
  /** ISO-8601 datetime when the board was created */
  created: string;
  /** ISO-8601 datetime of the last modification */
  updated: string;
  /** Ordered task list for this board */
  tasks: Task[];
  /** Free-text markdown notes body (everything below the frontmatter) */
  notes: string;
  /**
   * When true this board exists only in memory and has not yet been written to
   * disk.  Any real mutation (rename away from "Untitled", notes edit, task
   * add) must first materialise the file before proceeding.  If the board is
   * closed/abandoned while still a ghost, nothing is written to disk.
   */
  ghost?: true;
}
