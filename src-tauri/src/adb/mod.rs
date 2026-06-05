use std::sync::Mutex;

pub mod device;
pub mod logcat;
pub mod media;
pub mod network;
pub mod packages;
pub mod scrcpy;
pub mod shell;
pub mod stats;
pub mod wireless;

pub struct AdbState {
    pub custom_path: Mutex<Option<String>>,
}

impl Default for AdbState {
    fn default() -> Self {
        Self {
            custom_path: Mutex::new(None),
        }
    }
}
