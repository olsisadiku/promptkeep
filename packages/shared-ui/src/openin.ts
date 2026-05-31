// "Open in…" registry. Each target is a capability record so the UI is
// data-driven. Where the destination supports prefilling a prompt via URL we
// open it directly; otherwise (or when the prompt is too long for a URL) we
// copy to the clipboard and open the destination so the user can paste.
//
// Verified behaviors (best-effort, undocumented third-party UI features; user
// must be logged in):
//   - ChatGPT web `?q=` prefills + auto-submits.
//   - Claude DESKTOP `claude://claude.ai/new?q=` prefills (web `?q=` was removed).
//   - Perplexity `?q=` prefills.
//   - Google AI Studio / Cursor: no stable prefill → clipboard + open.

import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { isTauri } from "./runtime";

// On desktop we use Tauri's opener/clipboard plugins; on web, the browser's own
// window.open and the async clipboard API.
const openExternal = (url: string): Promise<unknown> =>
  isTauri() ? openUrl(url) : Promise.resolve(window.open(url, "_blank", "noopener"));
const copyText = (text: string): Promise<unknown> =>
  isTauri() ? writeText(text) : navigator.clipboard.writeText(text);

export type OpenStrategy = "url_prefill" | "clipboard_open";

export interface OpenTarget {
  id: string;
  label: string;
  strategy: OpenStrategy;
  /** URL template with `{enc}` placeholder, or a plain landing URL for clipboard targets. */
  url: string;
  /** Max encoded prompt length before falling back to clipboard (url_prefill only). */
  maxChars?: number;
  hint: string;
}

export const OPEN_TARGETS: OpenTarget[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    strategy: "url_prefill",
    url: "https://chatgpt.com/?q={enc}",
    maxChars: 8000,
    hint: "Opens chatgpt.com with the prompt prefilled.",
  },
  {
    id: "claude-desktop",
    label: "Claude (desktop app)",
    strategy: "url_prefill",
    url: "claude://claude.ai/new?q={enc}",
    maxChars: 14000,
    hint: "Opens the Claude desktop app with the prompt prefilled.",
  },
  {
    id: "claude-web",
    label: "Claude (web)",
    strategy: "clipboard_open",
    url: "https://claude.ai/new",
    hint: "Copies the prompt and opens claude.ai (web prefill is unavailable).",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    strategy: "url_prefill",
    url: "https://www.perplexity.ai/search/?q={enc}",
    maxChars: 4000,
    hint: "Opens Perplexity with the prompt prefilled.",
  },
  {
    id: "google-ai-studio",
    label: "Google AI Studio",
    strategy: "clipboard_open",
    url: "https://aistudio.google.com/prompts",
    hint: "Copies the prompt and opens AI Studio.",
  },
  {
    id: "cursor",
    label: "Cursor",
    strategy: "clipboard_open",
    url: "",
    hint: "Copies the prompt so you can paste it into Cursor.",
  },
];

export interface OpenOutcome {
  /** What actually happened, for a precise toast. */
  action: "opened" | "copied" | "copied_and_opened";
  target: OpenTarget;
}

export async function openIn(targetId: string, prompt: string): Promise<OpenOutcome> {
  const target = OPEN_TARGETS.find((t) => t.id === targetId);
  if (!target) throw new Error(`unknown target '${targetId}'`);

  const enc = encodeURIComponent(prompt);

  if (target.strategy === "url_prefill" && enc.length <= (target.maxChars ?? Infinity)) {
    await openExternal(target.url.replace("{enc}", enc));
    return { action: "opened", target };
  }

  // Fallback path: copy, then open the landing page if there is one.
  await copyText(prompt);
  if (target.url && !target.url.includes("{enc}")) {
    await openExternal(target.url);
    return { action: "copied_and_opened", target };
  }
  if (target.strategy === "url_prefill" && target.url) {
    // Too long to prefill — open the bare origin so the user can paste.
    try {
      const origin = new URL(target.url.replace("?q={enc}", "")).origin;
      await openExternal(origin);
      return { action: "copied_and_opened", target };
    } catch {
      /* ignore */
    }
  }
  return { action: "copied", target };
}
