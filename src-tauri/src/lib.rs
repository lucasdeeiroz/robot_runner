mod adb;
mod appium;
mod inspector;
mod logs;
mod ngrok;
mod runner;
mod system;
mod xml_parser;
mod ai_context;
mod db;
pub mod cmd_utils;
pub mod errors;
mod monitor;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;

mod files;
mod cmd_registry;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(adb::shell::ShellState::default())
        .manage(runner::TestState(Arc::new(Mutex::new(HashMap::new()))))
        .manage(appium::AppiumState(Arc::new(Mutex::new(None))))
        .manage(ngrok::NgrokState(Mutex::new(None)))
        .manage(adb::logcat::LogcatState(Mutex::new(
            HashMap::new(),
        )))
        .manage(system::WakelockState(std::sync::Mutex::new(None)))
        .setup(|app| {
            monitor::start_heartbeat_monitor(app.handle().clone());
            Ok(())
        })
        .invoke_handler(generate_robot_runner_handler![])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { .. } => {}
            tauri::RunEvent::Exit => {
                let state = app_handle.state::<appium::AppiumState>();
                let state_inner = state.0.clone();
                tauri::async_runtime::block_on(async move {
                    appium::shutdown_appium_with_inner(&state_inner).await;
                });
                let ngrok_state = app_handle.state::<ngrok::NgrokState>();
                ngrok::shutdown_ngrok(&ngrok_state);
                let runner_state = app_handle.state::<runner::TestState>();
                runner::shutdown_all_tests(&runner_state);
            }
            _ => {}
        });
}
