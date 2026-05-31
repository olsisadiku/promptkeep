// Typed bindings to the Rust command surface (crates/core/src/commands.rs) plus
// thin helpers over the Tauri plugins the UI needs.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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

export const defaultLibraryPath = () => invoke<string>("default_library_path");
export const getLibraryPath = () => invoke<string | null>("get_library_path");
export const setLibraryPath = (path: string) =>
  invoke<LibrarySnapshot>("set_library_path", { path });

// --- library / prompts -----------------------------------------------------

export const listLibrary = () => invoke<LibrarySnapshot>("list_library");
/** Flat list of every prompt with content — the search/quick-panel payload. */
export const listSearchPayload = () => invoke<FlatPrompt[]>("list_search_payload");
export const readPrompt = (id: string) => invoke<PromptFull>("read_prompt", { id });

export const createCategory = (name: string) => invoke<void>("create_category", { name });
export const renameCategory = (oldName: string, newName: string) =>
  invoke<void>("rename_category", { old: oldName, new: newName });
export const deleteCategory = (name: string) => invoke<void>("delete_category", { name });

export const createPrompt = (category: string | null, name: string) =>
  invoke<string>("create_prompt", { category, name });
export const renamePrompt = (id: string, newName: string) =>
  invoke<string>("rename_prompt", { id, newName });
export const deletePrompt = (id: string) => invoke<void>("delete_prompt", { id });
export const movePrompt = (id: string, newCategory: string | null) =>
  invoke<string>("move_prompt", { id, newCategory });

export const savePrompt = (id: string, content: string, note?: string) =>
  invoke<SaveResult>("save_prompt", { id, content, note: note ?? null });

// --- version history -------------------------------------------------------

export const listVersions = (id: string) => invoke<VersionMeta[]>("list_versions", { id });
export const readVersion = (id: string, ts: string) =>
  invoke<string>("read_version", { id, ts });
export const restoreVersion = (id: string, ts: string) =>
  invoke<SaveResult>("restore_version", { id, ts });

// --- API keys --------------------------------------------------------------

export const setApiKey = (provider: AiProvider, key: string) =>
  invoke<void>("set_api_key", { provider, key });
export const hasApiKey = (provider: AiProvider) => invoke<boolean>("has_api_key", { provider });
export const deleteApiKey = (provider: AiProvider) =>
  invoke<void>("delete_api_key", { provider });
export const providersWithKeys = () => invoke<AiProvider[]>("providers_with_keys");

// --- AI optimize -----------------------------------------------------------

export const optimizePrompt = (
  provider: AiProvider,
  prompt: string,
  opts?: { model?: string; instructions?: string },
) =>
  invoke<string>("optimize_prompt", {
    provider,
    model: opts?.model ?? null,
    prompt,
    instructions: opts?.instructions ?? null,
  });

// --- Git --------------------------------------------------------------------

export const gitStatus = () => invoke<GitStatus>("git_status");
export const gitPublish = (repoName: string, isPrivate: boolean) =>
  invoke<string>("git_publish", { repoName, private: isPrivate });
export const gitCommitAndPush = (message: string) =>
  invoke<boolean>("git_commit_and_push", { message });

// --- events -----------------------------------------------------------------

/** Subscribe to library-changed events emitted by the Rust file watcher. */
export function onLibraryChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(LIBRARY_CHANGED, () => cb());
}
