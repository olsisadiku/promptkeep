// Thin helpers over native capabilities, with browser fallbacks for the web
// build. On desktop these use Tauri plugins; on web they use standard DOM APIs
// (or no-op where there's no equivalent, e.g. the native folder picker).

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./runtime";

/** Native folder picker. Returns the chosen path, or null if cancelled / on web
 * (the web "library" is the signed-in account, not a folder). */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  if (!isTauri()) return null;
  const result = await openDialog({
    directory: true,
    multiple: false,
    defaultPath,
    title: "Choose your prompt library folder",
  });
  return typeof result === "string" ? result : null;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (!isTauri()) {
    await navigator.clipboard.writeText(text);
    return;
  }
  await writeText(text);
}

/** Label of the current Tauri window — "quickpanel" for the menu-bar popover.
 * Always "main" on web. */
export function windowLabel(): string {
  if (!isTauri()) return "main";
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

export const isQuickPanel = (): boolean => windowLabel() === "quickpanel";

export async function hideQuickPanel(): Promise<void> {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().hide();
  } catch {
    /* not in a tauri window */
  }
}
