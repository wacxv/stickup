use std::fs;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_fs::FsExt;

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn storage_dir<R: Runtime>(app: tauri::AppHandle<R>) -> tauri::Result<String> {
    let storage_dir = storage_dir_path(&app)?;

    fs::create_dir_all(&storage_dir)?;
    Ok(storage_dir.to_string_lossy().into_owned())
}

fn storage_dir_path<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<std::path::PathBuf> {
    let app_data_dir = app.path().app_data_dir()?;
    let parent = app_data_dir
        .parent()
        .ok_or_else(|| std::io::Error::other("app data directory has no parent"))?;
    Ok(parent.join("StickUp"))
}

// ─── App entry point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![greet, storage_dir])
        .setup(|app| {
            let app_handle = app.handle();
            let storage_dir = storage_dir_path(&app_handle)?;
            fs::create_dir_all(&storage_dir)?;
            app.fs_scope().allow_directory(&storage_dir, true)?;

            setup_tray(app)?;
            apply_startup_visibility(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── Startup visibility ───────────────────────────────────────────────────────
//
// On every launch after the first we read settings.json from the app-data
// directory.  If startupVisibility == "hidden" we hide the window immediately
// after creation so the app starts tray-only.
//
// First run: settings.json doesn't exist yet → window stays visible (shown).

fn apply_startup_visibility<R: Runtime>(app: &mut tauri::App<R>) {
    // Resolve the app-data directory
    let app_handle = app.handle();
    let app_data = match storage_dir_path(&app_handle) {
        Ok(p) => p,
        Err(_) => return, // can't read path, leave window visible
    };

    let settings_path = app_data.join("settings.json");

    // If settings.json doesn't exist this is first run → keep window shown
    if !settings_path.exists() {
        return;
    }

    // Read and parse just enough of settings.json to get startupVisibility
    let raw = match fs::read_to_string(&settings_path) {
        Ok(s) => s,
        Err(_) => return,
    };

    // Simple substring check — avoids pulling in serde_json just for this
    // (serde_json is already a transitive dep but we keep lib.rs lightweight)
    if raw.contains("\"startupVisibility\":\"hidden\"")
        || raw.contains("\"startupVisibility\": \"hidden\"")
    {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
    }
}

// ─── Tray setup ───────────────────────────────────────────────────────────────

fn setup_tray<R: Runtime>(app: &mut tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show StickUp", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let icon = Image::from_path(
        app.path()
            .resource_dir()
            .expect("resource dir")
            .join("icons/32x32.png"),
    )
    .unwrap_or_else(|_| app.default_window_icon().unwrap().clone());

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("StickUp")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
