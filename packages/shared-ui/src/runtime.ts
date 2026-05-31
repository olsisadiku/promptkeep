// Runtime target detection. The exact same JS bundle drives both the Tauri
// desktop app and the deployed website; every backend call branches on this.
//
// In a Tauri v2 webview the global `__TAURI_INTERNALS__` is injected before the
// app script runs. In a plain browser it is absent, so we take the web path.

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** True when running as the deployed website (no native backend available). */
export const isWeb = (): boolean => !isTauri();
