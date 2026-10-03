/**
 * markdown.ts
 *
 * Singleton markdown-it instance configured for StickUp's feature set:
 *   ✓ Bold, italic
 *   ✓ Unordered and ordered lists
 *   ✓ GFM-style task-list checkboxes  [ ] / [x]
 *   ✓ Fenced code blocks with syntax highlighting via highlight.js
 *   ✓ Inline code
 *   ✓ Underline (++ ++), strikethrough, headings, links, tables
 *   ✓ Blockquotes
 *   ✗ HTML passthrough (disabled)
 *   ✗ Mermaid, KaTeX, image attachments (out of scope per spec)
 */

import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";

// ── Register only the languages we ship ─────────────────────────────────────
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import rust from "highlight.js/lib/languages/rust";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);

// ── markdown-it instance ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const md = new MarkdownIt({
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre class="hljs-pre"><code class="hljs">' +
          hljs.highlight(code, { language: lang, ignoreIllegals: true }).value +
          "</code></pre>"
        );
      } catch {
        // fall through to escaped plain text
      }
    }
    return (
      '<pre class="hljs-pre"><code class="hljs">' +
      MarkdownIt().utils.escapeHtml(code) +
      "</code></pre>"
    );
  },
  breaks: true,
  linkify: true,
});

// ── GFM task-list checkbox plugin ────────────────────────────────────────────
// Transforms  - [ ] text  and  - [x] text  into checkbox list items.
const LIST_ITEM_RE = /^\[([ xX])\]\s+/;

// Markdown has no standard underline syntax. Keep the light editor syntax
// explicit and local by treating ++text++ as an underline span.
md.inline.ruler.before("emphasis", "underline", (state, silent) => {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== "++") return false;

  const end = state.src.indexOf("++", start + 2);
  if (end === -1 || end === start + 2) return false;
  if (/\s/.test(state.src[start + 2]) || /\s/.test(state.src[end - 1])) return false;
  if (silent) return true;

  const token = state.push("underline", "u", 0);
  token.content = state.src.slice(start + 2, end);
  state.pos = end + 2;
  return true;
});

md.renderer.rules.underline = (tokens, idx) =>
  `<u>${md.utils.escapeHtml(tokens[idx].content)}</u>`;

// The StateCore type is not re-exported from the markdown-it package root in v15.
// We extract it from the ruler callback parameter type to stay fully typed.
type CoreRuleCallback = Parameters<typeof md.core.ruler.after>[2];
type StateCore = Parameters<CoreRuleCallback>[0];

md.core.ruler.after("inline", "task-list", (state: StateCore): void => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "inline") continue;
    if (!tokens[i - 2] || tokens[i - 2].type !== "list_item_open") continue;

    const inlineToken = tokens[i];
    const children = inlineToken.children;
    if (!children || children.length === 0) continue;

    const firstChild = children[0];
    if (firstChild.type !== "text") continue;

    const match = LIST_ITEM_RE.exec(firstChild.content);
    if (!match) continue;

    const checked = match[1] !== " ";
    firstChild.content = firstChild.content.slice(match[0].length);

    tokens[i - 2].attrSet("class", "task-list-item");

    const checkbox = new state.Token("html_inline", "", 0);
    checkbox.content = `<input type="checkbox" disabled${checked ? " checked" : ""} class="task-checkbox"> `;
    children.unshift(checkbox);
  }
});

/** Render a markdown string to HTML. */
export function renderMarkdown(source: string): string {
  return md.render(source);
}
