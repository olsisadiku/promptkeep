//! Shared backend for the PromptKeep desktop app.
//!
//! Every UI build (the four design variants) is a thin Tauri binary whose
//! `main.rs` calls [`run`] with its own generated context. That keeps the
//! command surface, plugins, file watcher, and menu-bar tray defined exactly
//! once here.

mod ai;
mod commands;
mod error;
mod fs_library;
mod git;
mod keychain;
mod state;
mod versions;
mod watcher;

pub use error::{Error, Result};

use state::LibraryState;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const QUICK_PANEL: &str = "quickpanel";

/// Build and run the Tauri application. `context` is generated in each app
/// crate via `tauri::generate_context!()` so per-app `tauri.conf.json` (title,
/// identifier, dev URL, dist dir) is respected.
pub fn run(context: tauri::Context<tauri::Wry>) {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(LibraryState::default())
        .invoke_handler(tauri::generate_handler![
            commands::default_library_path,
            commands::get_library_path,
            commands::set_library_path,
            commands::list_library,
            commands::list_search_payload,
            commands::read_prompt,
            commands::create_category,
            commands::rename_category,
            commands::delete_category,
            commands::create_prompt,
            commands::rename_prompt,
            commands::delete_prompt,
            commands::move_prompt,
            commands::save_prompt,
            commands::list_versions,
            commands::read_version,
            commands::restore_version,
            commands::set_api_key,
            commands::has_api_key,
            commands::delete_api_key,
            commands::providers_with_keys,
            commands::optimize_prompt,
            commands::git_status,
            commands::git_publish,
            commands::git_commit_and_push,
        ])
        .setup(|app| {
            setup_quick_panel(app.handle())?;
            setup_tray(app.handle())?;
            #[cfg(debug_assertions)]
            if std::env::var("SPL_DEVTOOLS").is_ok() {
                if let Some(w) = app.get_webview_window("main") {
                    w.open_devtools();
                }
            }
            // Dev-only aid: float + focus the window so screenshots capture it.
            #[cfg(debug_assertions)]
            if std::env::var("SPL_FRONT").is_ok() {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_always_on_top(true);
                    let _ = w.set_focus();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Menu-bar popover behavior: hide the quick panel when it loses focus.
            if window.label() == QUICK_PANEL {
                if let WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
        })
        .run(context)
        .expect("error while running tauri application");
}

/// Create the hidden menu-bar popover window once at startup.
fn setup_quick_panel(app: &tauri::AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(QUICK_PANEL).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, QUICK_PANEL, WebviewUrl::App("index.html".into()))
        .title("Quick Prompts")
        .inner_size(380.0, 540.0)
        .min_inner_size(380.0, 320.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()?;
    Ok(())
}

/// Menu-bar tray icon; left-click toggles the quick panel.
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let icon = app
        .default_window_icon()
        .cloned()
        .expect("app must have a default window icon");

    TrayIconBuilder::with_id("promptkeep-tray")
        .icon(icon)
        .icon_as_template(false) // our icon is colorful, not a monochrome glyph
        .tooltip("PromptKeep")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_quick_panel(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn toggle_quick_panel(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window(QUICK_PANEL) else {
        return;
    };
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
        return;
    }
    position_top_right(&win);
    let _ = win.show();
    let _ = win.set_focus();
}

/// Anchor the popover to the top-right of the active monitor, just below the
/// menu bar — the natural spot for a menu-bar extra.
fn position_top_right(win: &tauri::WebviewWindow) {
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };

    let scale = monitor.scale_factor();
    let mpos = monitor.position(); // physical
    let msize = monitor.size(); // physical

    let panel = win
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new((380.0 * scale) as u32, (540.0 * scale) as u32));

    let margin = (12.0 * scale) as i32;
    let menu_bar = (32.0 * scale) as i32;

    let x = mpos.x + msize.width as i32 - panel.width as i32 - margin;
    let y = mpos.y + menu_bar;
    let _ = win.set_position(tauri::PhysicalPosition::new(x.max(mpos.x + margin), y));
}
