//! App-global state: the currently open library root and the live file watcher.

use notify::RecommendedWatcher;
use notify_debouncer_mini::Debouncer;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Default)]
pub struct LibraryState {
    root: Mutex<Option<PathBuf>>,
    /// Held so the watcher thread stays alive; replaced when the library changes.
    pub(crate) watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
}

impl LibraryState {
    pub fn root(&self) -> Option<PathBuf> {
        self.root.lock().unwrap().clone()
    }

    pub fn set_root(&self, root: Option<PathBuf>) {
        *self.root.lock().unwrap() = root;
    }
}

/// `~/Documents/PromptKeep` — the default library location.
pub fn default_library_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    home.join("Documents").join("PromptKeep")
}
