mod adb;
mod runner;
mod inspector;
mod logs;
mod system;
mod appium;

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
        .manage(adb::shell::ShellManager::new())
        .manage(runner::TestState(std::sync::Mutex::new(None)))
        .manage(appium::AppiumState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            greet,
            adb::shell::get_adb_version,
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
            appium::start_appium_server,
            appium::stop_appium_server,
            appium::get_appium_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
