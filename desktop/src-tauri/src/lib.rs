#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, PhysicalPosition, Position};

pub fn run() {
    const WINDOW_MARGIN: i32 = 24;

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let (Ok(Some(monitor)), Ok(window_size)) =
                    (window.current_monitor(), window.outer_size())
                {
                    let monitor_origin = monitor.position();
                    let monitor_size = monitor.size();
                    let x = monitor_origin.x + monitor_size.width as i32
                        - window_size.width as i32
                        - WINDOW_MARGIN;
                    let y = monitor_origin.y + monitor_size.height as i32
                        - window_size.height as i32
                        - WINDOW_MARGIN;

                    let target_position = PhysicalPosition::new(
                        x.max(monitor_origin.x),
                        y.max(monitor_origin.y),
                    );
                    let _ = window.set_position(Position::Physical(target_position));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
