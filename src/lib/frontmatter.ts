/**
 * frontmatter.ts
 *
 * Minimal hand-rolled YAML frontmatter parser/serialiser.
 *
 * Format on disk:
 *   ---
 *   <YAML key: value lines>
 *   ---
 *   <markdown body>
 *
 * We deliberately avoid a full YAML library to keep the bundle small and
 * because our frontmatter is machine-written and structurally predictable.
 * Only the subset of YAML we actually emit needs to be parsed back.
 *
 * Supported value types:
 *   - string (quoted or bare)
 *   - number
 *   - boolean (true / false)
 *   - null  (literal ~  or  null)
 *   - inline arrays  [ "a", "b" ]  (for simple string arrays, not tasks)
 *
 * Tasks are stored as a JSON blob under a special "tasks:" key so we don't
 * have to implement full block-sequence YAML.
 */

import type { Board } from "../types/board";
import type { Task } from "../types/task";

const FENCE = "---";

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ParsedFile {
  meta: BoardMeta;
  notes: string;
}

/** The subset of Board that lives in frontmatter (no `notes`, handled separately) */
export type BoardMeta = Omit<Board, "notes">;

/**
 * Parse a full .md file string into structured metadata + markdown body.
 * Throws if the frontmatter is missing or malformed.
 */
export function parseBoardFile(raw: string): ParsedFile {
  const lines = raw.split("\n");

  if (lines[0].trimEnd() !== FENCE) {
    throw new Error("Board file is missing opening frontmatter fence (---)");
  }

  const closeIdx = lines.indexOf(FENCE, 1);
  if (closeIdx === -1) {
    throw new Error("Board file is missing closing frontmatter fence (---)");
  }

  const fmLines = lines.slice(1, closeIdx);
  const bodyLines = lines.slice(closeIdx + 1);

  const meta = parseFrontmatter(fmLines.join("\n"));
  const notes = bodyLines.join("\n").trimStart();

  return { meta, notes };
}

/**
 * Serialise a Board back to the .md file format.
 */
export function serialiseBoardFile(board: Board): string {
  const { notes, ...meta } = board;
  const fm = serialiseFrontmatter(meta);
  // Always one blank line between frontmatter and body
  return `${FENCE}\n${fm}${FENCE}\n\n${notes ?? ""}`;
}

// ─── Frontmatter parser ───────────────────────────────────────────────────────

function parseFrontmatter(fm: string): BoardMeta {
  // Tasks are stored as a single-line JSON value; extract before line parsing
  // to avoid confusing the simple line scanner with JSON commas/colons.
  const tasksMatch = fm.match(/^tasks:\s*(.+)$/m);
  const tasks: Task[] = tasksMatch ? JSON.parse(tasksMatch[1]) : [];
  const fmWithoutTasks = fm.replace(/^tasks:.*$/m, "").trim();

  const obj: Record<string, unknown> = {};
  for (const line of fmWithoutTasks.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();
    obj[key] = parseScalar(rawVal);
  }

  // Validate required fields
  const required = ["id", "title", "slug", "order", "created", "updated"];
  for (const k of required) {
    if (obj[k] === undefined) {
      throw new Error(`Board frontmatter missing required field: ${k}`);
    }
  }

  return {
    id: String(obj.id),
    title: String(obj.title),
    slug: String(obj.slug),
    order: Number(obj.order),
    created: String(obj.created),
    updated: String(obj.updated),
    tasks,
  };
}

function parseScalar(raw: string): unknown {
  if (raw === "~" || raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  // Quoted string
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  // Bare string
  return raw;
}

// ─── Frontmatter serialiser ───────────────────────────────────────────────────

function serialiseFrontmatter(meta: BoardMeta): string {
  const lines: string[] = [
    `id: ${quoteString(meta.id)}`,
    `title: ${quoteString(meta.title)}`,
    `slug: ${quoteString(meta.slug)}`,
    `order: ${meta.order}`,
    `created: ${quoteString(meta.created)}`,
    `updated: ${quoteString(meta.updated)}`,
    // Tasks as a compact JSON single line — avoids block YAML complexity
    `tasks: ${JSON.stringify(meta.tasks)}`,
  ];
  return lines.join("\n") + "\n";
}

/** Wrap a string value in double quotes, escaping inner quotes. */
function quoteString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
