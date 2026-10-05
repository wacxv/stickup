/**
 * indexIO.ts
 *
 * Read / write index.json — a lightweight cache of board metadata so the
 * app can show the board list without parsing every .md file on startup.
 *
 * index.json is a CACHE ONLY for board metadata and tab state. The frontmatter
 * in each board's .md file is the source of truth. If index.json is missing,
 * corrupt, or inconsistent, it is rebuilt by scanning boards/*.md via boardIO.
 *
 * Shape of index.json:
 * {
 *   "version": 1,
 *   "lastOpenBoardId": "<id> | null",
 *   "closedBoardIds": ["<id>", …],
 *   "boards": [
 *     { "id": "…", "title": "…", "slug": "…", "order": 0 }
 *   ]
 * }
 */

import {
  readTextFile,
  writeTextFile,
  exists,
} from "@tauri-apps/plugin-fs";
import type { Board } from "../types/board";
import { listAllBoards } from "./boardIO";
import { storagePath } from "./storage";

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
  /** Board IDs closed from the tab strip, newest first. */
  closedBoardIds: string[];
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
  const indexPath = await storagePath(INDEX_PATH);
  if (await exists(indexPath)) {
    try {
      const raw = await readTextFile(indexPath);
      const parsed = JSON.parse(raw) as IndexFile;

      if (parsed.version === INDEX_VERSION && Array.isArray(parsed.boards)) {
        parsed.closedBoardIds = Array.isArray(parsed.closedBoardIds)
          ? parsed.closedBoardIds
          : [];
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
    closedBoardIds: [],
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
  await writeTextFile(await storagePath(INDEX_PATH), json);
}

/**
 * Update the index after a board is created, renamed, reordered, closed,
 * reopened, or deleted. Closed boards remain in the summary list so their
 * files are recoverable, while closedBoardIds controls tab visibility.
 */
export async function syncIndex(
  boards: Board[],
  lastOpenBoardId: string | null,
  closedBoardIds: string[] = [],
  closedBoards: Board[] = [],
): Promise<IndexFile> {
  const allBoards = [
    ...boards,
    ...closedBoards.filter(
      (closed) => !boards.some((board) => board.id === closed.id),
    ),
  ];
  const index: IndexFile = {
    version: INDEX_VERSION,
    lastOpenBoardId,
    closedBoardIds,
    boards: allBoards.map(toSummary),
  };
  await writeIndex(index);
  return index;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSummary(b: Board): BoardSummary {
  return { id: b.id, title: b.title, slug: b.slug, order: b.order };
}
