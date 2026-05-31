//! Watches the library root and emits a `library-changed` event to the
//! frontend (debounced). Changes under `.spl/` (version snapshots, prefs) are
//! ignored so saving a prompt doesn't cause a re-scan storm.

use crate::fs_library::META_DIR;
use crate::state::LibraryState;
use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub const LIBRARY_CHANGED: &str = "library-changed";

pub fn watch(app: &AppHandle, state: &State<LibraryState>, root: std::path::PathBuf) {
    let app = app.clone();
    let meta_marker = format!("{}{}{}", std::path::MAIN_SEPARATOR, META_DIR, std::path::MAIN_SEPARATOR);

    let debouncer = new_debouncer(
        Duration::from_millis(400),
        move |res: notify_debouncer_mini::DebounceEventResult| {
            if let Ok(events) = res {
                let relevant = events.iter().any(|e| {
                    let p = e.path.to_string_lossy();
                    !p.contains(&meta_marker) && !p.ends_with(META_DIR)
                });
                if relevant {
                    let _ = app.emit(LIBRARY_CHANGED, ());
                }
            }
        },
    );

    match debouncer {
        Ok(mut d) => {
            if d.watcher().watch(Path::new(&root), RecursiveMode::Recursive).is_ok() {
                // Keep the debouncer alive by storing it; replaces any prior one.
                *state.watcher.lock().unwrap() = Some(d);
            }
        }
        Err(e) => {
            eprintln!("failed to start file watcher: {e}");
        }
    }
}
