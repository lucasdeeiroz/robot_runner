mod adb;
mod ai;
mod auth;
mod ai_context;
mod appium;
pub mod cmd_utils;
mod db;
pub mod errors;
mod inspector;
mod logs;
mod monitor;
mod ngrok;
mod runner;
mod system;
mod xml_parser;
mod image_utils;
mod security;
mod git;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;

mod cmd_registry;
mod files;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(target_os = "windows")]
mod win32 {
    use std::ffi::c_void;

    unsafe extern "system" {
        pub fn AllocConsole() -> i32;
        pub fn GetConsoleWindow() -> *mut c_void;
        pub fn ShowWindow(hWnd: *mut c_void, nCmdShow: i32) -> i32;
    }
}

#[cfg(target_os = "windows")]
fn init_hidden_console() {
    unsafe {
        let window = win32::GetConsoleWindow();
        if window.is_null() {
            win32::AllocConsole();
            let window = win32::GetConsoleWindow();
            if !window.is_null() {
                win32::ShowWindow(window, 0); // 0 is SW_HIDE
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    init_hidden_console();

    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(adb::shell::ShellState::default())
        .manage(adb::AdbState::default())
        .manage(runner::TestState(Arc::new(Mutex::new(HashMap::new()))))
        .manage(appium::AppiumState(Arc::new(Mutex::new(None))))
        .manage(ngrok::NgrokState(Mutex::new(None)))
        .manage(adb::logcat::LogcatState(Mutex::new(HashMap::new())))
        .manage(adb::dmesg::DmesgState(Mutex::new(HashMap::new())))
        .manage(adb::stats::PerformanceState(Mutex::new(HashMap::new())))
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
