/**
 * NotesPreview
 *
 * Renders a markdown string to HTML using the singleton markdown-it instance
 * from lib/markdown.ts.  The output is injected via dangerouslySetInnerHTML —
 * this is safe here because:
 *   1. The content is user-authored local data, not fetched from a server.
 *   2. markdown-it's html option is disabled (no raw HTML passthrough).
 *   3. We're running inside a Tauri webview with no meaningful attack surface
 *      from the rendered HTML.
 *
 * Styles for the rendered content are defined inline in App.css under the
 * .prose class so Tailwind's purge doesn't remove them.
 */

import { useMemo } from "react";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  source: string;
  onToggleTask: (taskIndex: number) => void;
}

export function NotesPreview({ source, onToggleTask }: Props) {
  const html = useMemo(() => renderMarkdown(source), [source]);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
      return;
    }

    const taskIndex = Number(target.dataset.taskIndex);
    if (Number.isInteger(taskIndex) && taskIndex >= 0) {
      onToggleTask(taskIndex);
    }
  }

  return (
    <div
      className="prose flex-1 overflow-y-auto p-3 min-h-0"
      onClick={handleClick}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: local user data, html disabled in md parser
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
