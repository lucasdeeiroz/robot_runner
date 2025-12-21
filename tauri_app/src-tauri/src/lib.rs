mod adb;
mod runner;
mod inspector;
mod logs;
mod system;
mod appium;
mod ngrok;

mod files;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(adb::shell::ShellState::default())
        .manage(runner::TestState(std::sync::Mutex::new(std::collections::HashMap::new())))
        .manage(appium::AppiumState(std::sync::Mutex::new(None)))
        .manage(ngrok::NgrokState(std::sync::Mutex::new(None)))
        .manage(adb::logcat::LogcatState(std::sync::Mutex::new(std::collections::HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            greet,
            adb::shell::get_adb_version,
            adb::shell::run_adb_command,
            adb::shell::start_adb_command,
            adb::shell::stop_adb_command,
            adb::shell::restart_adb_server,
            adb::device::get_connected_devices,
            runner::run_robot_test,
            runner::stop_robot_test,
            inspector::get_screenshot,
            inspector::get_xml_dump,
            logs::get_test_tests_history,
            logs::open_log_folder,
            adb::wireless::adb_connect,
            adb::wireless::adb_pair,
            adb::wireless::adb_disconnect,
            system::get_system_versions,
            adb::shell::is_adb_server_running,
            adb::shell::kill_adb_server,
            adb::shell::start_adb_server,
            adb::shell::get_adb_version,
            appium::start_appium_server,
            appium::stop_appium_server,
            appium::get_appium_status,
            ngrok::start_ngrok,
            ngrok::stop_ngrok,
            // Logcat
            adb::logcat::start_logcat,
            adb::logcat::stop_logcat,
            adb::logcat::fetch_logcat_buffer,
            adb::logcat::is_logcat_active,
            // Stats
            adb::stats::get_device_stats,
            // Scrcpy
            adb::scrcpy::open_scrcpy,
            // Media
            adb::media::save_screenshot,
            adb::media::start_screen_recording,
            adb::media::stop_screen_recording,
            adb::network::get_device_ip,
            files::list_directory,
            files::save_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
