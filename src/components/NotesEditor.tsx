/**
 * NotesEditor
 *
 * A textarea-based markdown editor with a minimal formatting toolbar.
 * The toolbar inserts/toggles markdown syntax around the current selection
 * (or at the cursor if nothing is selected).
 *
 * Supported toolbar actions:
 *   Bold, italic, underline, strikethrough, lists, checkboxes, blockquotes,
 *   headings, links, tables, and fenced code blocks.
 */

import {
  useRef,
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  FiCheckSquare,
  FiCode,
  FiCornerDownRight,
  FiGrid,
  FiLink,
  FiList,
  FiMoreHorizontal,
} from "react-icons/fi";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// ─── Toolbar button descriptor ────────────────────────────────────────────────

interface ToolbarItem {
  label: ReactNode;
  title: string;
  shortcut?: string;
  shortcutKey?: string;
  shortcutShift?: boolean;
  action: "table" | ((
    textarea: HTMLTextAreaElement,
    value: string,
    onChange: (v: string) => void,
  ) => void);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotesEditor({ value, onChange, placeholder }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>();
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tableSize, setTableSize] = useState<{ rows: string; columns: string } | null>(null);
  const [tableError, setTableError] = useState(false);
  const tableSelectionRef = useRef({ start: 0, end: 0 });
  const tableRowsRef = useRef<HTMLInputElement>(null);
  const tableOpen = tableSize !== null;

  useEffect(() => {
    if (tableOpen) tableRowsRef.current?.focus();
  }, [tableOpen]);

  const applyChange = useCallback(
    (nextValue: string) => {
      if (nextValue === value) return;
      undoStackRef.current.push(value);
      redoStackRef.current = [];
      onChange(nextValue);
    },
    [value, onChange],
  );

  const handleToolbar = useCallback(
    (action: ToolbarItem["action"]) => {
      const ta = textareaRef.current;
      if (!ta) return;
      if (action === "table") {
        tableSelectionRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
        setTableSize({ rows: "2", columns: "3" });
        setTableError(false);
        return;
      }
      setTableSize(null);
      action(ta, value, applyChange);
      // Return focus to textarea so the user can keep typing
      ta.focus();
    },
    [value, applyChange],
  );

  const handleUndoRedo = useCallback(
    (redo: boolean) => {
      const source = redo ? redoStackRef.current : undoStackRef.current;
      const target = redo ? undoStackRef.current : redoStackRef.current;
      const nextValue = source.pop();
      if (nextValue === undefined) return false;

      target.push(value);
      onChange(nextValue);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return true;
    },
    [value, onChange],
  );

  function handleShortcut(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (e.nativeEvent.isComposing || (!e.ctrlKey && !e.metaKey) || e.altKey) return false;

    if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      handleUndoRedo(e.shiftKey);
      return true;
    }
    if (e.key.toLowerCase() === "y" && !e.shiftKey) {
      e.preventDefault();
      handleUndoRedo(true);
      return true;
    }

    const shortcut = e.key.toLowerCase();
    const item = TOOLBAR.find(
      (candidate) =>
        candidate.shortcutKey === shortcut &&
        (candidate.shortcutShift ?? false) === e.shiftKey,
    );
    if (!item) return false;

    e.preventDefault();
    handleToolbar(item.action);
    return true;
  }

  useEffect(() => {
    if (!moreOpen) return;

    function updateMenuHeight() {
      const menu = overflowMenuRef.current;
      if (!menu) return;
      setMenuMaxHeight(Math.max(0, window.innerHeight - menu.getBoundingClientRect().top - 8));
    }

    updateMenuHeight();
    const observer = new ResizeObserver(updateMenuHeight);
    if (moreMenuRef.current) observer.observe(moreMenuRef.current);
    window.addEventListener("resize", updateMenuHeight);

    function closeOnOutsideClick(event: MouseEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("resize", updateMenuHeight);
      observer.disconnect();
    };
  }, [moreOpen]);

  // Tab key inserts two spaces instead of moving focus
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (handleShortcut(e)) return;

    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      insertAtCursor(ta, "  ", value, applyChange);
      return;
    }
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      continueList(e.currentTarget, value, applyChange)
    ) {
      e.preventDefault();
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="notes-toolbar flex items-center gap-0.5 px-2 py-1 border-b border-neutral-800 shrink-0">
        {TOOLBAR.map((item) => (
          <button
            key={item.title}
            type="button"
            title={item.title}
            onMouseDown={(e) => {
              // Prevent textarea from losing focus
              e.preventDefault();
            }}
            onClick={() => handleToolbar(item.action)}
            className="
              toolbar-inline
              px-1.5 py-0.5 rounded text-xs text-neutral-400
              hover:text-neutral-100 hover:bg-neutral-800
              transition-colors font-mono select-none
            "
          >
            {item.label}
          </button>
        ))}
        <div ref={moreMenuRef} className="toolbar-overflow relative">
          <button
            type="button"
            title="More formatting tools"
            aria-label="More formatting tools"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            className="
              inline-flex items-center justify-center px-1.5 py-0.5
              rounded text-xs text-neutral-400
              hover:text-neutral-100 hover:bg-neutral-800
              transition-colors
            "
          >
            <FiMoreHorizontal aria-hidden="true" />
          </button>
          {moreOpen && (
            <div
              ref={overflowMenuRef}
              role="menu"
              aria-label="More formatting tools"
              style={{ maxHeight: menuMaxHeight }}
              className="
                toolbar-overflow-menu absolute top-full left-0 z-50 mt-1 min-w-[180px] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain p-1
                bg-neutral-800 border border-neutral-700 rounded-md shadow-xl
              "
            >
              {TOOLBAR.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  role="menuitem"
                  title={item.title}
                  onClick={() => {
                    handleToolbar(item.action);
                    setMoreOpen(false);
                  }}
                  className="
                    toolbar-overflow-item flex shrink-0 items-center gap-2 w-full px-2 py-1.5 rounded
                    text-left text-xs text-neutral-300
                    hover:bg-neutral-700 hover:text-neutral-100
                  "
                >
                  <span className="toolbar-overflow-icon inline-flex w-5 shrink-0 justify-center">{item.label}</span>
                  <span className="toolbar-overflow-label min-w-0 flex-1 truncate">{item.title}</span>
                  {item.shortcut && (
                    <kbd className="shrink-0 text-[10px] text-neutral-500">{item.shortcut}</kbd>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Textarea ─────────────────────────────────────────────────────── */}
      {tableSize && (
        <form
          aria-label="Create table"
          noValidate
          className="flex flex-wrap items-center gap-2 px-2 py-1 border-b border-neutral-800 text-xs text-neutral-300 shrink-0 min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            const rows = Number(tableSize.rows);
            const columns = Number(tableSize.columns);
            if (![tableSize.rows, tableSize.columns].every((size) => /^\d+$/.test(size)) ||
                ![rows, columns].every((size) => Number.isInteger(size) && size >= 1 && size <= 10)) {
              setTableError(true);
              return;
            }
            const ta = textareaRef.current;
            if (!ta) return;
            ta.setSelectionRange(tableSelectionRef.current.start, tableSelectionRef.current.end);
            insertTable(ta, value, applyChange, rows, columns);
            setTableSize(null);
            ta.focus();
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setTableSize(null);
              textareaRef.current?.focus();
            }
          }}
        >
          {(["rows", "columns"] as const).map((dimension) => (
            <label key={dimension} className="flex items-center gap-1">
              {dimension === "rows" ? "Rows" : "Columns"}
              <input
                ref={dimension === "rows" ? tableRowsRef : undefined}
                type="number"
                min={1}
                max={10}
                step={1}
                value={tableSize[dimension]}
                aria-invalid={tableError}
                aria-describedby={tableError ? "table-size-error" : undefined}
                onChange={(event) => {
                  setTableSize({ ...tableSize, [dimension]: event.target.value });
                  setTableError(false);
                }}
                className="w-12 min-w-0 rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5"
              />
            </label>
          ))}
          <button type="submit" className="rounded px-1 py-0.5 hover:bg-neutral-800">Insert</button>
          <button type="button" onClick={() => {
            setTableSize(null);
            textareaRef.current?.focus();
          }} className="rounded px-1 py-0.5 hover:bg-neutral-800">Cancel</button>
          {tableError && (
            <p id="table-size-error" role="alert" className="w-full text-red-400">
              Rows and columns must be whole numbers from 1 to 10.
            </p>
          )}
        </form>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => applyChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Start typing…"}
        spellCheck
        className="
          flex-1 resize-none bg-transparent text-neutral-200
          text-sm leading-relaxed font-mono
          p-3 outline-none min-h-0
          placeholder:text-neutral-600
          selection:bg-indigo-600/40
        "
      />
    </div>
  );
}

// ─── Toolbar definitions ──────────────────────────────────────────────────────

const TOOLBAR: ToolbarItem[] = [
  {
    label: "B",
    title: "Bold (** **)",
    shortcut: "Ctrl+B",
    shortcutKey: "b",
    action: (ta, val, set) => wrapSelection(ta, val, set, "**", "**", "bold text"),
  },
  {
    label: "I",
    title: "Italic (_ _)",
    shortcut: "Ctrl+I",
    shortcutKey: "i",
    action: (ta, val, set) => wrapSelection(ta, val, set, "_", "_", "italic text"),
  },
  {
    label: "U",
    title: "Underline (++ ++)",
    shortcut: "Ctrl+U",
    shortcutKey: "u",
    action: (ta, val, set) => wrapSelection(ta, val, set, "++", "++", "underlined text"),
  },
  {
    label: "S",
    title: "Strikethrough (~~ ~~)",
    shortcut: "Ctrl+Shift+X",
    shortcutKey: "x",
    shortcutShift: true,
    action: (ta, val, set) => wrapSelection(ta, val, set, "~~", "~~", "struck text"),
  },
  {
    label: <FiList aria-hidden="true" />,
    title: "Unordered list",
    action: (ta, val, set) => toggleLines(ta, val, set, /^- /, "- "),
  },
  {
    label: <span aria-hidden="true">1.</span>,
    title: "Ordered list",
    action: (ta, val, set) => toggleNumberedLines(ta, val, set),
  },
  {
    label: <FiCheckSquare aria-hidden="true" />,
    title: "Task checkbox",
    action: (ta, val, set) => toggleLines(ta, val, set, /^- \[[ xX]\] /, "- [ ] "),
  },
  {
    label: <FiCornerDownRight aria-hidden="true" />,
    title: "Blockquote",
    action: (ta, val, set) => toggleLines(ta, val, set, /^> /, "> "),
  },
  {
    label: "H",
    title: "Heading (H1/H2/H3)",
    action: (ta, val, set) => cycleHeading(ta, val, set),
  },
  {
    label: <FiLink aria-hidden="true" />,
    title: "Link ([text](url))",
    shortcut: "Ctrl+K",
    shortcutKey: "k",
    action: (ta, val, set) => insertLink(ta, val, set),
  },
  {
    label: <FiGrid aria-hidden="true" />,
    title: "Table",
    action: "table",
  },
  {
    label: <FiCode aria-hidden="true" />,
    title: "Code block",
    action: (ta, val, set) => insertCodeBlock(ta, val, set),
  },
  {
    label: "`",
    title: "Inline code",
    action: (ta, val, set) => wrapSelection(ta, val, set, "`", "`", "code"),
  },
];

// ─── Toolbar action helpers ───────────────────────────────────────────────────

function continueList(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
): boolean {
  if (ta.selectionStart !== ta.selectionEnd) return false;
  const cursor = ta.selectionStart;
  const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
  const lineEnd = value.indexOf("\n", cursor);
  const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
  const beforeCursor = line.slice(0, cursor - lineStart);
  const bullet = /^(\s*)- (.*)$/.exec(beforeCursor);
  const checkbox = /^(\s*)- \[[ xX]\] (.*)$/.exec(beforeCursor);
  const numbered = /^(\s*)(\d+)\. (.*)$/.exec(beforeCursor);
  if (!bullet && !checkbox && !numbered) return false;

  let markerLength: number;
  if (checkbox) {
    markerLength = checkbox[0].length - checkbox[2].length;
  } else if (numbered) {
    markerLength = numbered[0].length - numbered[3].length;
  } else {
    markerLength = bullet![0].length - bullet![2].length;
  }
  const content = beforeCursor.slice(markerLength);
  if (!content.trim()) {
    const newValue = value.slice(0, lineStart) + "\n" + value.slice(cursor);
    onChange(newValue);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = lineStart + 1;
    });
    return true;
  }

  const marker = checkbox
    ? `${checkbox[1]}- [ ] `
    : numbered
      ? `${numbered[1]}${Number(numbered[2]) + 1}. `
      : `${bullet![1]}- `;
  const newValue = value.slice(0, cursor) + "\n" + marker + value.slice(cursor);
  onChange(newValue);
  requestAnimationFrame(() => {
    ta.selectionStart = ta.selectionEnd = cursor + marker.length + 1;
  });
  return true;
}

/** Toggle markdown delimiters around the selected text (or placeholder). */
function wrapSelection(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  prefix: string,
  suffix: string,
  placeholder: string,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const wrapped =
    start >= prefix.length &&
    value.slice(start - prefix.length, start) === prefix &&
    value.slice(end, end + suffix.length) === suffix;
  if (wrapped) {
    const newVal =
      value.slice(0, start - prefix.length) +
      value.slice(start, end) +
      value.slice(end + suffix.length);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.selectionStart = start - prefix.length;
      ta.selectionEnd = end - prefix.length;
    });
    return;
  }
  const selected = value.slice(start, end) || placeholder;
  const newVal = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
  onChange(newVal);

  requestAnimationFrame(() => {
    ta.selectionStart = start + prefix.length;
    ta.selectionEnd = start + prefix.length + selected.length;
  });
}

/** Add or remove a fixed prefix from each selected line. */
function toggleLines(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  pattern: RegExp,
  prefix: string,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const block = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const lines = block.split("\n");
  const removePrefix = lines.every((line) => pattern.test(line));
  const prefixed = lines
    .map((line) => (removePrefix ? line.replace(pattern, "") : prefix + line))
    .join("\n");
  const newVal = value.slice(0, lineStart) + prefixed + (lineEnd === -1 ? "" : value.slice(lineEnd));
  onChange(newVal);

  requestAnimationFrame(() => {
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + prefixed.length;
  });
}

/** Add or remove incrementing numbers from the selected lines. */
function toggleNumberedLines(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const block = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const lines = block.split("\n");
  const removePrefix = lines.every((line) => /^\d+\. /.test(line));
  const prefixed = lines
    .map((line, i) => (removePrefix ? line.replace(/^\d+\. /, "") : `${i + 1}. ${line}`))
    .join("\n");
  const newVal = value.slice(0, lineStart) + prefixed + (lineEnd === -1 ? "" : value.slice(lineEnd));
  onChange(newVal);

  requestAnimationFrame(() => {
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + prefixed.length;
  });
}

function cycleHeading(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: start } = ta;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", start);
  const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
  const match = /^(#{1,3}) ?(.*)$/.exec(line);
  const level = match ? (match[1].length % 3) + 1 : 1;
  const content = match ? match[2] : line;
  const replacement = `${"#".repeat(level)} ${content}`;
  const newValue = value.slice(0, lineStart) + replacement + value.slice(lineStart + line.length);
  onChange(newValue);
  requestAnimationFrame(() => {
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + replacement.length;
  });
}

function insertLink(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const selected = value.slice(start, end) || "link text";
  const replacement = `[${selected}](url)`;
  onChange(value.slice(0, start) + replacement + value.slice(end));
  requestAnimationFrame(() => {
    const urlStart = start + selected.length + 3;
    ta.selectionStart = urlStart;
    ta.selectionEnd = urlStart + 3;
  });
}

function insertTable(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  rows: number,
  columns: number,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const table = [
    line(Array.from({ length: columns }, (_, i) => `Header ${i + 1}`)),
    line(Array.from({ length: columns }, () => "---")),
    ...Array.from({ length: rows - 1 }, () =>
      line(Array.from({ length: columns }, (_, i) => `Cell ${i + 1}`))),
  ].join("\n");
  onChange(value.slice(0, start) + table + value.slice(end));
  requestAnimationFrame(() => {
    ta.selectionStart = start;
    ta.selectionEnd = start + table.length;
  });
}

/** Toggle a fenced code block, placing the cursor inside when adding one. */
function insertCodeBlock(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const selected = value.slice(start, end);
  if (selected.startsWith("```\n") && selected.endsWith("\n```")) {
    const unwrapped = selected.slice(4, -4);
    const newVal = value.slice(0, start) + unwrapped + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.selectionStart = start;
      ta.selectionEnd = start + unwrapped.length;
    });
    return;
  }
  const block = "```\n" + (selected || "code here") + "\n```";
  const newVal = value.slice(0, start) + block + value.slice(end);
  onChange(newVal);

  requestAnimationFrame(() => {
    if (selected) {
      ta.selectionStart = start + 4;
      ta.selectionEnd = start + 4 + selected.length;
    } else {
      ta.selectionStart = start + 4;
      ta.selectionEnd = start + 4 + "code here".length;
    }
  });
}

/** Insert text at the cursor position. */
function insertAtCursor(
  ta: HTMLTextAreaElement,
  text: string,
  value: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const newVal = value.slice(0, start) + text + value.slice(end);
  onChange(newVal);
  requestAnimationFrame(() => {
    ta.selectionStart = ta.selectionEnd = start + text.length;
  });
}
