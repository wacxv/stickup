/**
 * boardIO.ts
 *
 * All disk I/O for board .md files.
 *
 * Directory layout (inside the Tauri appData directory):
 *   boards/
 *     <slug>.md   ← one file per board
 *
 * The app always references boards by their frontmatter `id`, never by
 * filename.  The slug is only used to derive the filename and is stored in
 * the frontmatter so we can reconstruct the path from either direction.
 */

import {
  mkdir,
  readTextFile,
  writeTextFile,
  readDir,
  remove,
  exists,
} from "@tauri-apps/plugin-fs";
import type { Board } from "../types/board";
import type { Task } from "../types/task";
import { parseBoardFile, serialiseBoardFile } from "./frontmatter";
import { slugify, makeUniqueSlug } from "./slugify";
import { storagePath } from "./storage";

const BOARDS_DIR = "boards";

// ─── Bootstrap ───────────────────────────────────────────────────────────────

/** Create the boards/ directory if it doesn't exist yet. Safe to call repeatedly. */
export async function ensureBoardsDir(): Promise<void> {
  await mkdir(await storagePath(BOARDS_DIR), { recursive: true });
}

// ─── Single board CRUD ────────────────────────────────────────────────────────

/** Read and parse one board file by slug. Returns null if the file is missing. */
export async function readBoard(slug: string): Promise<Board | null> {
  const path = await boardPath(slug);
  try {
    const raw = await readTextFile(path);
    const { meta, notes } = parseBoardFile(raw);
    return { ...meta, notes };
  } catch {
    return null;
  }
}

/** Write a board to disk (creates or overwrites). Updates the `updated` timestamp. */
export async function writeBoard(board: Board): Promise<void> {
  await ensureBoardsDir();
  const updated: Board = { ...board, updated: new Date().toISOString() };
  const content = serialiseBoardFile(updated);
  await writeTextFile(await boardPath(updated.slug), content);
}

/** Delete a board file permanently. No trash/undo. */
export async function deleteBoard(slug: string): Promise<void> {
  const path = await boardPath(slug);
  if (await exists(path)) {
    await remove(path);
  }
}

/**
 * Rename a board: updates the title and, if the slug changes, moves the file.
 * Returns the updated Board (with new slug and updated timestamp).
 */
export async function renameBoard(
  board: Board,
  newTitle: string,
  existingSlugs: string[],
): Promise<Board> {
  const newSlug = makeUniqueSlug(
    slugify(newTitle),
    existingSlugs,
    board.slug, // exclude own slug so rename to same name is a no-op
  );

  const renamed: Board = {
    ...board,
    title: newTitle,
    slug: newSlug,
    updated: new Date().toISOString(),
  };

  // Write to new path first, then remove old path if slug changed
  await ensureBoardsDir();
  await writeTextFile(await boardPath(newSlug), serialiseBoardFile(renamed));

  if (newSlug !== board.slug) {
    await remove(await boardPath(board.slug));
  }

  return renamed;
}

// ─── Bulk operations ──────────────────────────────────────────────────────────

/**
 * Scan the boards/ directory and return all successfully parsed boards,
 * sorted by their `order` field.  Corrupt or unreadable files are skipped
 * with a console warning — index.json should never be the sole source of
 * truth for board existence.
 */
export async function listAllBoards(): Promise<Board[]> {
  await ensureBoardsDir();

  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(await storagePath(BOARDS_DIR));
  } catch {
    return [];
  }

  const boards: Board[] = [];
  for (const entry of entries) {
    if (!entry.name?.endsWith(".md")) continue;
    const slug = entry.name.slice(0, -3);
    try {
      const board = await readBoard(slug);
      if (board) boards.push(board);
    } catch (err) {
      console.warn(`[boardIO] Skipping corrupt board file: ${entry.name}`, err);
    }
  }

  return boards.sort((a, b) => a.order - b.order);
}

// ─── Task helpers (keep tasks inside the board file) ─────────────────────────

/** Replace the task list on a board and persist. */
export async function saveTasks(board: Board, tasks: Task[]): Promise<Board> {
  const updated: Board = { ...board, tasks, updated: new Date().toISOString() };
  await writeBoard(updated);
  return updated;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a brand-new board with safe defaults and write it to disk.
 * Returns the created Board.
 */
export async function createBoard(
  title: string,
  existingSlugs: string[],
  order: number,
): Promise<Board> {
  const now = new Date().toISOString();
  const slug = makeUniqueSlug(slugify(title), existingSlugs);

  const board: Board = {
    id: crypto.randomUUID(),
    title,
    slug,
    order,
    created: now,
    updated: now,
    tasks: [],
    notes: "",
  };

  await writeBoard(board);
  return board;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function boardPath(slug: string): Promise<string> {
  return storagePath(BOARDS_DIR, `${slug}.md`);
}
