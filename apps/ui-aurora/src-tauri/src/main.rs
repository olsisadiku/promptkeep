// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The entire app (commands, plugins, file watcher, menu-bar tray) lives in
    // the shared `spl_core` crate. Each UI build only differs in its frontend
    // and its tauri.conf.json. The context is generated here so this app's own
    // config (title, identifier, dev URL) is used.
    spl_core::run(tauri::generate_context!());
}
