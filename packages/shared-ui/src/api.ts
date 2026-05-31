// The backend command surface. On desktop these are typed bindings to the Rust
// commands (crates/core/src/commands.rs) over Tauri's `invoke`; on the website
// they dispatch to the Supabase-backed implementation in web.ts. The exported
// names are identical so the React app is unaware of which backend it's on.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./runtime";
import * as web from "./web";
import type {
  AiProvider,
  FlatPrompt,
  GitStatus,
  LibrarySnapshot,
  PromptFull,
  SaveResult,
  VersionMeta,
} from "./types";

export const LIBRARY_CHANGED = "library-changed";

// --- library location ------------------------------------------------------

export const defaultLibraryPath = (): Promise<string> =>
  isTauri() ? invoke<string>("default_library_path") : web.webDefaultLibraryPath();
export const getLibraryPath = (): Promise<string | null> =>
  isTauri() ? invoke<string | null>("get_library_path") : web.webGetLibraryPath();
export const setLibraryPath = (path: string): Promise<LibrarySnapshot> =>
  isTauri() ? invoke<LibrarySnapshot>("set_library_path", { path }) : web.webSetLibraryPath(path);

// --- library / prompts -----------------------------------------------------

export const listLibrary = (): Promise<LibrarySnapshot> =>
  isTauri() ? invoke<LibrarySnapshot>("list_library") : web.webListLibrary();
/** Flat list of every prompt with content — the search/quick-panel payload. */
export const listSearchPayload = (): Promise<FlatPrompt[]> =>
  isTauri() ? invoke<FlatPrompt[]>("list_search_payload") : web.webListSearchPayload();
export const readPrompt = (id: string): Promise<PromptFull> =>
  isTauri() ? invoke<PromptFull>("read_prompt", { id }) : web.webReadPrompt(id);

export const createCategory = (name: string): Promise<void> =>
  isTauri() ? invoke<void>("create_category", { name }) : web.webCreateCategory(name);
export const renameCategory = (oldName: string, newName: string): Promise<void> =>
  isTauri()
    ? invoke<void>("rename_category", { old: oldName, new: newName })
    : web.webRenameCategory(oldName, newName);
export const deleteCategory = (name: string): Promise<void> =>
  isTauri() ? invoke<void>("delete_category", { name }) : web.webDeleteCategory(name);

export const createPrompt = (category: string | null, name: string): Promise<string> =>
  isTauri()
    ? invoke<string>("create_prompt", { category, name })
    : web.webCreatePrompt(category, name);
export const renamePrompt = (id: string, newName: string): Promise<string> =>
  isTauri() ? invoke<string>("rename_prompt", { id, newName }) : web.webRenamePrompt(id, newName);
export const deletePrompt = (id: string): Promise<void> =>
  isTauri() ? invoke<void>("delete_prompt", { id }) : web.webDeletePrompt(id);
export const movePrompt = (id: string, newCategory: string | null): Promise<string> =>
  isTauri()
    ? invoke<string>("move_prompt", { id, newCategory })
    : web.webMovePrompt(id, newCategory);

export const savePrompt = (id: string, content: string, note?: string): Promise<SaveResult> =>
  isTauri()
    ? invoke<SaveResult>("save_prompt", { id, content, note: note ?? null })
    : web.webSavePrompt(id, content, note);

// --- version history -------------------------------------------------------

export const listVersions = (id: string): Promise<VersionMeta[]> =>
  isTauri() ? invoke<VersionMeta[]>("list_versions", { id }) : web.webListVersions(id);
export const readVersion = (id: string, ts: string): Promise<string> =>
  isTauri() ? invoke<string>("read_version", { id, ts }) : web.webReadVersion(id, ts);
export const restoreVersion = (id: string, ts: string): Promise<SaveResult> =>
  isTauri() ? invoke<SaveResult>("restore_version", { id, ts }) : web.webRestoreVersion(id, ts);

// --- API keys --------------------------------------------------------------

export const setApiKey = (provider: AiProvider, key: string): Promise<void> =>
  isTauri()
    ? invoke<void>("set_api_key", { provider, key })
    : Promise.resolve(web.webSetApiKey(provider, key));
export const hasApiKey = (provider: AiProvider): Promise<boolean> =>
  isTauri() ? invoke<boolean>("has_api_key", { provider }) : Promise.resolve(web.webHasApiKey(provider));
export const deleteApiKey = (provider: AiProvider): Promise<void> =>
  isTauri()
    ? invoke<void>("delete_api_key", { provider })
    : Promise.resolve(web.webDeleteApiKey(provider));
export const providersWithKeys = (): Promise<AiProvider[]> =>
  isTauri() ? invoke<AiProvider[]>("providers_with_keys") : Promise.resolve(web.webProvidersWithKeys());

// --- AI optimize -----------------------------------------------------------

export const optimizePrompt = (
  provider: AiProvider,
  prompt: string,
  opts?: { model?: string; instructions?: string },
): Promise<string> =>
  isTauri()
    ? invoke<string>("optimize_prompt", {
        provider,
        model: opts?.model ?? null,
        prompt,
        instructions: opts?.instructions ?? null,
      })
    : web.webOptimizePrompt(provider, prompt, opts);

// --- Git --------------------------------------------------------------------

export const gitStatus = (): Promise<GitStatus> =>
  isTauri() ? invoke<GitStatus>("git_status") : Promise.resolve(web.webGitStatus());
export const gitPublish = (repoName: string, isPrivate: boolean): Promise<string> =>
  invoke<string>("git_publish", { repoName, private: isPrivate });
export const gitCommitAndPush = (message: string): Promise<boolean> =>
  invoke<boolean>("git_commit_and_push", { message });

// --- events -----------------------------------------------------------------

/** Subscribe to library-changed events emitted by the Rust file watcher.
 * On web there is no watcher, so this is a no-op (the store refreshes after
 * each mutation itself). */
export function onLibraryChanged(cb: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => {});
  return listen(LIBRARY_CHANGED, () => cb());
}
