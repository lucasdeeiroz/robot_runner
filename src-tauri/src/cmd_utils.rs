#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Creates a new synchronous std::process::Command with suppression of console windows on Windows.
pub fn new_std_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Creates a new asynchronous tokio::process::Command with suppression of console windows on Windows.
pub fn new_tokio_command(program: &str) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}
