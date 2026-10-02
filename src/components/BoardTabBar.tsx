import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useBoardStore } from "../stores/boardStore";
import type { Board } from "../types/board";

/**
 * BoardTabBar
 *
 * Renders the board tab strip at the top of the window.
 *
 * Behaviour:
 *  - Tabs are laid out horizontally; titles truncate with ellipsis
 *  - When tabs overflow the strip width an "▾ N more" overflow button
 *    appears that opens a dropdown listing the hidden boards
 *  - "+" instantly creates an "Untitled" board and drops into inline rename
 *  - Clicking a tab activates that board
 *  - Double-clicking a tab activates inline rename
 *  - The active tab shows a bottom accent line
 */
export function BoardTabBar() {
  const { boards, activeBoardId, setActiveBoard, addBoard, renameActiveBoard } =
    useBoardStore();

  // ── Inline rename state ──────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Overflow detection ───────────────────────────────────────────────────
  const stripRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState<number>(boards.length);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Measure how many tabs fit in the strip
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const measure = () => {
      // Reserve ~72px for the overflow button + add button
      const available = strip.clientWidth - 72;
      const tabEls = Array.from(
        strip.querySelectorAll<HTMLButtonElement>("[data-tab]"),
      );
      let used = 0;
      let count = 0;
      for (const el of tabEls) {
        used += el.offsetWidth;
        if (used > available) break;
        count++;
      }
      setVisibleCount(Math.max(1, count));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [boards]);

  // Close overflow dropdown on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (!overflowRef.current?.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [overflowOpen]);

  // Focus rename input when it mounts
  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function startRename(board: Board) {
    setRenamingId(board.id);
    setRenameValue(board.title);
  }

  async function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      // Only the active board can be renamed via the tab bar
      if (renamingId === activeBoardId) {
        await renameActiveBoard(trimmed);
      }
    }
    setRenamingId(null);
  }

  function handleRenameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") setRenamingId(null);
  }

  async function handleAdd() {
    const board = await addBoard("Untitled");
    startRename(board);
  }

  const visibleBoards = boards.slice(0, visibleCount);
  const hiddenBoards = boards.slice(visibleCount);

  return (
    <div
      ref={stripRef}
      className="
        flex items-stretch shrink-0
        bg-neutral-900 border-b border-neutral-800
        overflow-hidden
      "
      style={{ height: "2rem" /* 32px */ }}
    >
      {/* ── Visible tabs ──────────────────────────────────────────────── */}
      {visibleBoards.map((board) => {
        const isActive = board.id === activeBoardId;
        const isRenaming = board.id === renamingId;

        return (
          <button
            key={board.id}
            data-tab
            onClick={() => setActiveBoard(board.id)}
            onDoubleClick={() => startRename(board)}
            title={board.title}
            className={`
              relative flex items-center px-3 max-w-[120px] shrink-0
              text-xs truncate transition-colors
              ${
                isActive
                  ? "text-neutral-100 bg-neutral-950 after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-indigo-500"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
              }
            `}
          >
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKey}
                onClick={(e) => e.stopPropagation()}
                className="
                  w-full bg-neutral-800 text-neutral-100 text-xs
                  border border-indigo-500 rounded px-1 outline-none
                  min-w-0
                "
              />
            ) : (
              <span className="truncate">{board.title}</span>
            )}
          </button>
        );
      })}

      {/* ── Overflow button ───────────────────────────────────────────── */}
      {hiddenBoards.length > 0 && (
        <div ref={overflowRef} className="relative flex items-center">
          <button
            onClick={() => setOverflowOpen((o) => !o)}
            className="
              flex items-center gap-1 px-2 h-full
              text-xs text-neutral-400 hover:text-neutral-200
              hover:bg-neutral-800 transition-colors
            "
          >
            <span>▾</span>
            <span>{hiddenBoards.length}</span>
          </button>

          {overflowOpen && (
            <div
              className="
                absolute top-full left-0 z-50 min-w-[140px]
                bg-neutral-800 border border-neutral-700
                rounded-md shadow-lg py-1 mt-0.5
              "
            >
              {hiddenBoards.map((board) => (
                <button
                  key={board.id}
                  onClick={() => {
                    setActiveBoard(board.id);
                    setOverflowOpen(false);
                  }}
                  className="
                    w-full text-left px-3 py-1.5 text-xs
                    text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100
                    truncate transition-colors
                  "
                >
                  {board.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Spacer ───────────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Add board button ──────────────────────────────────────────── */}
      <button
        onClick={handleAdd}
        title="New board"
        aria-label="New board"
        className="
          flex items-center justify-center w-8 h-full shrink-0
          text-neutral-400 hover:text-neutral-100
          hover:bg-neutral-800 transition-colors text-base leading-none
        "
      >
        +
      </button>
    </div>
  );
}
