/**
 * indexIO.ts
 *
 * Read / write index.json — a lightweight cache of board metadata so the
 * app can show the board list without parsing every .md file on startup.
 *
 * index.json is a CACHE ONLY.  The frontmatter in each board's .md file
 * is the source of truth.  If index.json is missing, corrupt, or
 * inconsistent, it is rebuilt by scanning boards/*.md via boardIO.
 *
 * Shape of index.json:
 * {
 *   "version": 1,
 *   "lastOpenBoardId": "<id> | null",
 *   "boards": [
 *     { "id": "…", "title": "…", "slug": "…", "order": 0 }
 *   ]
 * }
 */

import {
  BaseDirectory,
  readTextFile,
  writeTextFile,
  exists,
} from "@tauri-apps/plugin-fs";
import type { Board } from "../types/board";
import { listAllBoards } from "./boardIO";

const BASE = BaseDirectory.AppData;
const INDEX_PATH = "index.json";
const INDEX_VERSION = 1;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoardSummary {
  id: string;
  title: string;
  slug: string;
  order: number;
}

export interface IndexFile {
  version: number;
  lastOpenBoardId: string | null;
  boards: BoardSummary[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load index.json.  If missing or corrupt, rebuilds from the boards/ directory
 * and writes the fresh index before returning.
 *
 * Returns the index and the full board list.  The full list is returned on
 * rebuild so callers don't need a second round of disk reads.
 */
export async function loadIndex(): Promise<{
  index: IndexFile;
  boards: Board[];
}> {
  // ── Try reading the cached index ──
  if (await exists(INDEX_PATH, { baseDir: BASE })) {
    try {
      const raw = await readTextFile(INDEX_PATH, { baseDir: BASE });
      const parsed = JSON.parse(raw) as IndexFile;

      if (parsed.version === INDEX_VERSION && Array.isArray(parsed.boards)) {
        // Index looks valid — trust it for the summary list but don't
        // return full Board objects from here (caller will load on demand).
        return { index: parsed, boards: [] };
      }
    } catch {
      // Fall through to rebuild
    }
  }

  // ── Rebuild from disk ──
  console.info("[indexIO] Rebuilding index.json from boards/");
  return rebuildIndex(null);
}

/**
 * Rebuild index.json by scanning all board files.
 * Optionally preserves a specific lastOpenBoardId if the board still exists.
 */
export async function rebuildIndex(
  lastOpenBoardId: string | null,
): Promise<{ index: IndexFile; boards: Board[] }> {
  const boards = await listAllBoards();

  // Validate that lastOpenBoardId still refers to a real board
  const validLastOpen =
    lastOpenBoardId && boards.some((b) => b.id === lastOpenBoardId)
      ? lastOpenBoardId
      : (boards[0]?.id ?? null);

  const index: IndexFile = {
    version: INDEX_VERSION,
    lastOpenBoardId: validLastOpen,
    boards: boards.map(toSummary),
  };

  await writeIndex(index);
  return { index, boards };
}

/**
 * Persist index.json to disk.
 */
export async function writeIndex(index: IndexFile): Promise<void> {
  const json = JSON.stringify(index, null, 2);
  await writeTextFile(INDEX_PATH, json, { baseDir: BASE });
}

/**
 * Update the index after a board is created, renamed, reordered, or deleted.
 * Accepts the new full board list so the caller controls the source of truth.
 */
export async function syncIndex(
  boards: Board[],
  lastOpenBoardId: string | null,
): Promise<IndexFile> {
  const index: IndexFile = {
    version: INDEX_VERSION,
    lastOpenBoardId,
    boards: boards.map(toSummary),
  };
  await writeIndex(index);
  return index;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSummary(b: Board): BoardSummary {
  return { id: b.id, title: b.title, slug: b.slug, order: b.order };
}
