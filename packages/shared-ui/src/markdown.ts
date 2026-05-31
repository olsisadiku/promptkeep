// Markdown rendering pipeline: markdown-it for structure, Shiki for code block
// highlighting (VS Code themes), DOMPurify for safety. Shiki loads lazily; until
// it's ready, code blocks fall back to plain escaped text.

import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { createHighlighter, type Highlighter } from "shiki";

const LANGS = [
  "javascript",
  "typescript",
  "json",
  "bash",
  "python",
  "rust",
  "markdown",
  "html",
  "css",
  "sql",
  "yaml",
];
const THEMES = { light: "github-light", dark: "github-dark" } as const;
export type MarkdownTheme = keyof typeof THEMES;

let highlighter: Highlighter | null = null;
let loading: Promise<Highlighter> | null = null;

export function ensureHighlighter(): Promise<Highlighter> {
  if (highlighter) return Promise.resolve(highlighter);
  if (!loading) {
    loading = createHighlighter({
      themes: [THEMES.light, THEMES.dark],
      langs: LANGS,
    }).then((h) => {
      highlighter = h;
      return h;
    });
  }
  return loading;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMd(theme: MarkdownTheme): MarkdownIt {
  return new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
    highlight: (code, lang) => {
      if (highlighter && lang && highlighter.getLoadedLanguages().includes(lang as any)) {
        try {
          return highlighter.codeToHtml(code, { lang, theme: THEMES[theme] });
        } catch {
          /* fall through */
        }
      }
      return `<pre class="shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
    },
  });
}

/**
 * Render markdown to sanitized HTML. Call `ensureHighlighter()` once on mount
 * so code blocks are highlighted; rendering still works (un-highlighted) before
 * that resolves.
 */
export function renderMarkdown(content: string, theme: MarkdownTheme = "light"): string {
  const md = buildMd(theme);
  const raw = md.render(content ?? "");
  return DOMPurify.sanitize(raw, { ADD_ATTR: ["target", "style", "class"] });
}

/** A one-line plaintext preview (first non-heading, non-empty line). */
export function previewLine(content: string, max = 140): string {
  const line =
    content
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#")) ?? "";
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}
