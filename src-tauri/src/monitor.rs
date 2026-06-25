use crate::adb::device::get_connected_devices;
use crate::appium::{get_appium_status, AppiumStatus};
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
pub struct ServiceStatusUpdate {
    appium: Option<AppiumStatus>,
    adb_devices_count: usize,
}

pub fn start_heartbeat_monitor(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5)).await;
        loop {
            let appium_state = app_handle.state::<crate::appium::AppiumState>();

            // Check Appium Status
            let appium_status = get_appium_status(appium_state, None, None, None, None)
                .await
                .ok();

            // Check ADB status
            let adb_devices = get_connected_devices(app_handle.clone()).await.unwrap_or_default();

            let update = ServiceStatusUpdate {
                appium: appium_status,
                adb_devices_count: adb_devices.len(),
            };

            let _ = app_handle.emit("service-status-update", update);

            tokio::time::sleep(Duration::from_secs(20)).await;
        }
    });
}
