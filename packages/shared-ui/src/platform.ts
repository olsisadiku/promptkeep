// Thin helpers over Tauri plugins used directly by the UI.

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Native folder picker. Returns the chosen path or null if cancelled. */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  const result = await openDialog({
    directory: true,
    multiple: false,
    defaultPath,
    title: "Choose your prompt library folder",
  });
  return typeof result === "string" ? result : null;
}

export async function copyToClipboard(text: string): Promise<void> {
  await writeText(text);
}

/** Label of the current Tauri window — "quickpanel" for the menu-bar popover. */
export function windowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

export const isQuickPanel = (): boolean => windowLabel() === "quickpanel";

export async function hideQuickPanel(): Promise<void> {
  try {
    await getCurrentWindow().hide();
  } catch {
    /* not in a tauri window */
  }
}
