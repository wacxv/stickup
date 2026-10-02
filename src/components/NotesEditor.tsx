/**
 * NotesEditor
 *
 * A textarea-based markdown editor with a minimal formatting toolbar.
 * The toolbar inserts/toggles markdown syntax around the current selection
 * (or at the cursor if nothing is selected).
 *
 * Supported toolbar actions:
 *   Bold (** **), Italic (_ _), Unordered list (- ), Ordered list (1. ),
 *   Task checkbox (- [ ] ), Fenced code block (``` ```)
 */

import { useRef, useCallback, type KeyboardEvent } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// ─── Toolbar button descriptor ────────────────────────────────────────────────

interface ToolbarItem {
  label: string;
  title: string;
  action: (
    textarea: HTMLTextAreaElement,
    value: string,
    onChange: (v: string) => void,
  ) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotesEditor({ value, onChange, placeholder }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleToolbar = useCallback(
    (action: ToolbarItem["action"]) => {
      const ta = textareaRef.current;
      if (!ta) return;
      action(ta, value, onChange);
      // Return focus to textarea so the user can keep typing
      ta.focus();
    },
    [value, onChange],
  );

  // Tab key inserts two spaces instead of moving focus
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      insertAtCursor(ta, "  ", value, onChange);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-neutral-800 shrink-0">
        {TOOLBAR.map((item) => (
          <button
            key={item.label}
            title={item.title}
            onMouseDown={(e) => {
              // Prevent textarea from losing focus
              e.preventDefault();
              handleToolbar(item.action);
            }}
            className="
              px-1.5 py-0.5 rounded text-xs text-neutral-400
              hover:text-neutral-100 hover:bg-neutral-800
              transition-colors font-mono select-none
            "
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Textarea ─────────────────────────────────────────────────────── */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
    action: (ta, val, set) => wrapSelection(ta, val, set, "**", "**", "bold text"),
  },
  {
    label: "I",
    title: "Italic (_ _)",
    action: (ta, val, set) => wrapSelection(ta, val, set, "_", "_", "italic text"),
  },
  {
    label: "—",
    title: "Divider",
    action: () => {},
  },
  {
    label: "•",
    title: "Unordered list",
    action: (ta, val, set) => prependLines(ta, val, set, "- "),
  },
  {
    label: "1.",
    title: "Ordered list",
    action: (ta, val, set) => prependLinesNumbered(ta, val, set),
  },
  {
    label: "☐",
    title: "Task checkbox",
    action: (ta, val, set) => prependLines(ta, val, set, "- [ ] "),
  },
  {
    label: "—",
    title: "Divider",
    action: () => {},
  },
  {
    label: "</>",
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

/** Wrap the selected text (or placeholder) with a prefix/suffix. */
function wrapSelection(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  prefix: string,
  suffix: string,
  placeholder: string,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const selected = value.slice(start, end) || placeholder;
  const newVal = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
  onChange(newVal);

  requestAnimationFrame(() => {
    ta.selectionStart = start + prefix.length;
    ta.selectionEnd = start + prefix.length + selected.length;
  });
}

/** Prepend each selected line with a fixed prefix. */
function prependLines(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  prefix: string,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const block = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const prefixed = block
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
  const newVal = value.slice(0, lineStart) + prefixed + (lineEnd === -1 ? "" : value.slice(lineEnd));
  onChange(newVal);

  requestAnimationFrame(() => {
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + prefixed.length;
  });
}

/** Prepend selected lines with incrementing numbers (1. 2. 3.). */
function prependLinesNumbered(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const block = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const prefixed = block
    .split("\n")
    .map((l, i) => `${i + 1}. ${l}`)
    .join("\n");
  const newVal = value.slice(0, lineStart) + prefixed + (lineEnd === -1 ? "" : value.slice(lineEnd));
  onChange(newVal);

  requestAnimationFrame(() => {
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + prefixed.length;
  });
}

/** Insert a fenced code block, placing the cursor inside. */
function insertCodeBlock(
  ta: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: start, selectionEnd: end } = ta;
  const selected = value.slice(start, end);
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
