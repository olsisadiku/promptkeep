//! The Tauri command surface. This is the contract every frontend (the four
//! UIs and the menu-bar quick panel) depends on. Keep it stable.

use crate::error::{Error, Result};
use crate::state::LibraryState;
use crate::{ai, fs_library, git, keychain, versions};
use crate::fs_library::{LibrarySnapshot, PromptFull};
use crate::versions::VersionMeta;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize)]
pub struct SaveResult {
    pub id: String,
    /// The snapshot created for the *previous* content, if there was any.
    pub version: Option<VersionMeta>,
}

fn root(state: &State<LibraryState>) -> Result<PathBuf> {
    state.root().ok_or(Error::NoLibrary)
}

// --- library location ------------------------------------------------------

#[tauri::command]
pub fn default_library_path() -> String {
    crate::state::default_library_dir()
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub fn get_library_path(state: State<LibraryState>) -> Option<String> {
    state.root().map(|p| p.to_string_lossy().to_string())
}

/// Open a library folder: persists it in state, starts the file watcher, and
/// returns the initial scan.
#[tauri::command]
pub fn set_library_path(
    app: AppHandle,
    state: State<LibraryState>,
    path: String,
) -> Result<LibrarySnapshot> {
    let root = PathBuf::from(&path);
    std::fs::create_dir_all(&root)?;
    let snapshot = fs_library::scan(&root)?;
    state.set_root(Some(root.clone()));
    crate::watcher::watch(&app, &state, root);
    Ok(snapshot)
}

#[tauri::command]
pub fn list_library(state: State<LibraryState>) -> Result<LibrarySnapshot> {
    fs_library::scan(&root(&state)?)
}

#[tauri::command]
pub fn read_prompt(state: State<LibraryState>, id: String) -> Result<PromptFull> {
    fs_library::read_prompt(&root(&state)?, &id)
}

// --- categories ------------------------------------------------------------

#[tauri::command]
pub fn create_category(state: State<LibraryState>, name: String) -> Result<()> {
    fs_library::create_category(&root(&state)?, &name)
}

#[tauri::command]
pub fn rename_category(state: State<LibraryState>, old: String, new: String) -> Result<()> {
    fs_library::rename_category(&root(&state)?, &old, &new)
}

#[tauri::command]
pub fn delete_category(state: State<LibraryState>, name: String) -> Result<()> {
    fs_library::delete_category(&root(&state)?, &name)
}

// --- prompts ---------------------------------------------------------------

#[tauri::command]
pub fn create_prompt(
    state: State<LibraryState>,
    category: Option<String>,
    name: String,
) -> Result<String> {
    fs_library::create_prompt(&root(&state)?, category.as_deref(), &name)
}

#[tauri::command]
pub fn rename_prompt(state: State<LibraryState>, id: String, new_name: String) -> Result<String> {
    fs_library::rename_prompt(&root(&state)?, &id, &new_name)
}

#[tauri::command]
pub fn delete_prompt(state: State<LibraryState>, id: String) -> Result<()> {
    fs_library::delete_prompt(&root(&state)?, &id)
}

#[tauri::command]
pub fn move_prompt(
    state: State<LibraryState>,
    id: String,
    new_category: Option<String>,
) -> Result<String> {
    fs_library::move_prompt(&root(&state)?, &id, new_category.as_deref())
}

/// Save content. Snapshots the *previous* content into local history first.
#[tauri::command]
pub fn save_prompt(
    state: State<LibraryState>,
    id: String,
    content: String,
    note: Option<String>,
) -> Result<SaveResult> {
    let root = root(&state)?;
    let prev = fs_library::write_prompt_raw(&root, &id, &content)?;
    let version = match prev {
        Some(prev_content) if prev_content != content => {
            Some(versions::snapshot(&root, &id, &prev_content, note)?)
        }
        _ => None,
    };
    Ok(SaveResult { id, version })
}

// --- version history -------------------------------------------------------

#[tauri::command]
pub fn list_versions(state: State<LibraryState>, id: String) -> Result<Vec<VersionMeta>> {
    versions::list(&root(&state)?, &id)
}

#[tauri::command]
pub fn read_version(state: State<LibraryState>, id: String, ts: String) -> Result<String> {
    versions::read(&root(&state)?, &id, &ts)
}

/// Restore an old version: snapshots the current content, then writes the old
/// content as the new live version. Non-destructive.
#[tauri::command]
pub fn restore_version(
    state: State<LibraryState>,
    id: String,
    ts: String,
) -> Result<SaveResult> {
    let root = root(&state)?;
    let old = versions::read(&root, &id, &ts)?;
    let prev = fs_library::write_prompt_raw(&root, &id, &old)?;
    let version = match prev {
        Some(prev_content) if prev_content != old => Some(versions::snapshot(
            &root,
            &id,
            &prev_content,
            Some(format!("before restoring {ts}")),
        )?),
        _ => None,
    };
    Ok(SaveResult { id, version })
}

// --- API keys (Keychain) ---------------------------------------------------

#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<()> {
    keychain::set_key(&provider, &key)
}

#[tauri::command]
pub fn has_api_key(provider: String) -> Result<bool> {
    keychain::has_key(&provider)
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<()> {
    keychain::delete_key(&provider)
}

#[tauri::command]
pub fn providers_with_keys() -> Vec<String> {
    ["openai", "openrouter", "anthropic"]
        .into_iter()
        .filter(|p| keychain::has_key(p).unwrap_or(false))
        .map(|p| p.to_string())
        .collect()
}

// --- AI optimize -----------------------------------------------------------

#[tauri::command]
pub async fn optimize_prompt(
    provider: String,
    model: Option<String>,
    prompt: String,
    instructions: Option<String>,
) -> Result<String> {
    ai::optimize_prompt(&provider, model.as_deref(), &prompt, instructions.as_deref()).await
}

// --- Git --------------------------------------------------------------------

#[tauri::command]
pub fn git_status(state: State<LibraryState>) -> Result<git::GitStatus> {
    git::status(&root(&state)?)
}

#[tauri::command]
pub fn git_publish(
    state: State<LibraryState>,
    repo_name: String,
    private: bool,
) -> Result<String> {
    git::publish(&root(&state)?, &repo_name, private)
}

#[tauri::command]
pub fn git_commit_and_push(state: State<LibraryState>, message: String) -> Result<bool> {
    git::commit_and_push(&root(&state)?, &message)
}

/// The UI search payload: every prompt flattened *with content*, fed into the
/// frontend MiniSearch index (and the menu-bar quick panel).
#[tauri::command]
pub fn list_search_payload(state: State<LibraryState>) -> Result<Vec<PromptFull>> {
    fs_library::scan_flat(&root(&state)?)
}
