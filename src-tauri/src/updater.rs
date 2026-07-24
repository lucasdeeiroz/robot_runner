use crate::errors::{AppError, AppResult};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{command, AppHandle};

#[command]
pub async fn apply_portable_update(
    app: AppHandle,
    temp_download_path: String,
    asset_name: String,
) -> AppResult<()> {
    let current_exe = std::env::current_exe()
        .map_err(|e| AppError::FileSystemError(format!("Failed to get current exe path: {}", e)))?;

    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| AppError::FileSystemError("Failed to get current exe directory".to_string()))?;

    let temp_path = Path::new(&temp_download_path);
    if !temp_path.exists() {
        return Err(AppError::FileSystemError(
            "Downloaded update file does not exist".to_string(),
        ));
    }

    let clean_asset_name = if asset_name.trim().is_empty() {
        current_exe
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("robot_runner_portable.exe")
            .to_string()
    } else {
        asset_name.trim().to_string()
    };

    let primary_target_path = current_exe.clone();
    let fallback_target_path = exe_dir.join(&clean_asset_name);
    let old_exe_path = current_exe.with_extension("exe.old");

    #[cfg(target_os = "windows")]
    {
        let mut final_launch_path: Option<PathBuf> = None;
        let mut old_to_delete: Option<PathBuf> = None;

        // Attempt 1: In-Place Replacement (Rename running current_exe -> current_exe.old, copy temp_path -> current_exe)
        let _ = fs::remove_file(&old_exe_path);
        if fs::rename(&current_exe, &old_exe_path).is_ok() {
            if fs::copy(temp_path, &primary_target_path).is_ok() {
                final_launch_path = Some(primary_target_path.clone());
                old_to_delete = Some(old_exe_path.clone());
            } else {
                // Restore original executable if copy failed
                let _ = fs::rename(&old_exe_path, &current_exe);
            }
        }

        // Attempt 2: If in-place replacement failed (e.g. permissions), move downloaded asset to same directory with original asset_name
        if final_launch_path.is_none() {
            if fs::copy(temp_path, &fallback_target_path).is_ok() {
                final_launch_path = Some(fallback_target_path.clone());
            }
        }

        let _ = fs::remove_file(temp_path);

        if let Some(target_path) = final_launch_path {
            // To prevent CMD double-quote and backslash escaping issues ("\"), create a temporary batch file in tempDir
            let temp_dir = std::env::temp_dir();
            let bat_path = temp_dir.join(format!("robot_runner_updater_{}.bat", rand::random::<u32>()));

            let old_del_cmd = if let Some(ref old_p) = old_to_delete {
                format!("if exist \"{}\" del /f /q \"{}\"\r\n", old_p.to_string_lossy(), old_p.to_string_lossy())
            } else {
                String::new()
            };

            let bat_content = format!(
                "@echo off\r\ntimeout /t 1 /nobreak >NUL\r\n{}start \"\" \"{}\"\r\n(goto) 2>nul & del \"%~f0\"\r\n",
                old_del_cmd,
                target_path.to_string_lossy()
            );

            fs::write(&bat_path, bat_content)
                .map_err(|e| AppError::FileSystemError(format!("Failed to write updater script: {}", e)))?;

            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            std::process::Command::new("cmd")
                .args(["/C", &bat_path.to_string_lossy().to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| AppError::FileSystemError(format!("Failed to spawn updater batch script: {}", e)))?;

            app.exit(0);
        } else {
            return Err(AppError::FileSystemError(
                "Could not copy portable update to application directory. Permission denied.".to_string(),
            ));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut final_launch_path: Option<PathBuf> = None;
        let mut old_to_delete: Option<PathBuf> = None;

        let _ = fs::remove_file(&old_exe_path);
        if fs::rename(&current_exe, &old_exe_path).is_ok() {
            if fs::copy(temp_path, &primary_target_path).is_ok() {
                final_launch_path = Some(primary_target_path.clone());
                old_to_delete = Some(old_exe_path.clone());
            } else {
                let _ = fs::rename(&old_exe_path, &current_exe);
            }
        }

        if final_launch_path.is_none() {
            if fs::copy(temp_path, &fallback_target_path).is_ok() {
                final_launch_path = Some(fallback_target_path.clone());
            }
        }

        let _ = fs::remove_file(temp_path);

        if let Some(target_path) = final_launch_path {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&target_path, fs::Permissions::from_mode(0o755));
            }

            std::process::Command::new(&target_path)
                .spawn()
                .map_err(|e| AppError::FileSystemError(format!("Failed to launch new binary: {}", e)))?;

            if let Some(old_p) = old_to_delete {
                let _ = fs::remove_file(old_p);
            }

            app.exit(0);
        } else {
            return Err(AppError::FileSystemError(
                "Could not copy portable update to application directory. Permission denied.".to_string(),
            ));
        }
    }

    Ok(())
}
