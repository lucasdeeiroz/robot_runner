use crate::errors::{AppError, AppResult};
use std::fs;
use std::path::{Path, PathBuf};
use sha2::{Digest, Sha256};
use std::io::Read;
use tauri::{command, AppHandle};

const RELEASE_DOWNLOAD_PREFIX: &str = "https://github.com/lucasdeeiroz/robot_runner/releases/download/";
const CHECKSUM_ERROR_PREFIX: &str = "UPDATE_CHECKSUM_";

/// Accepts only a plain release file name (`Robot.Runner_*`), never a path.
fn validate_asset_name(asset_name: &str) -> AppResult<String> {
    let name = asset_name.trim();
    let is_plain = !name.is_empty()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && !name.contains(':')
        && !Path::new(name).is_absolute()
        && Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name);
    if !is_plain || !name.starts_with("Robot.Runner_") {
        return Err(AppError::FileSystemError(format!(
            "{}INVALID_ASSET: Refusing to apply update with unexpected asset name '{}'",
            CHECKSUM_ERROR_PREFIX, name
        )));
    }
    Ok(name.to_string())
}

fn sha256_file(path: &Path) -> AppResult<String> {
    let mut file = fs::File::open(path)
        .map_err(|e| AppError::FileSystemError(format!("Failed to open downloaded update: {}", e)))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| AppError::FileSystemError(format!("Failed to read downloaded update: {}", e)))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect())
}

/// Parses `sha256sum` output lines: `<64 hex>  <name>` or `<64 hex> *<name>`.
fn find_expected_hash(sums: &str, asset_name: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let line = line.trim();
        let (hash, rest) = line.split_once(char::is_whitespace)?;
        let file = rest.trim().trim_start_matches('*').trim();
        let file = file.rsplit(['/', '\\']).next().unwrap_or(file);
        if file == asset_name && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
            Some(hash.to_ascii_lowercase())
        } else {
            None
        }
    })
}

async fn verify_asset_checksum(temp_path: &Path, asset_name: &str, checksums_url: Option<&str>) -> AppResult<()> {
    let url = checksums_url.map(str::trim).unwrap_or("");
    if url.is_empty() || !url.starts_with(RELEASE_DOWNLOAD_PREFIX) || !url.ends_with("/SHA256SUMS.txt") {
        return Err(AppError::FileSystemError(format!(
            "{}MISSING: SHA256SUMS.txt is not available for this release",
            CHECKSUM_ERROR_PREFIX
        )));
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("RobotRunner-App")
        .build()
        .map_err(|e| AppError::NetworkError(e.to_string()))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::NetworkError(format!("{}MISSING: {}", CHECKSUM_ERROR_PREFIX, e)))?;
    if !resp.status().is_success() {
        return Err(AppError::NetworkError(format!(
            "{}MISSING: SHA256SUMS.txt download returned HTTP {}",
            CHECKSUM_ERROR_PREFIX,
            resp.status()
        )));
    }
    let sums = resp
        .text()
        .await
        .map_err(|e| AppError::NetworkError(format!("{}MISSING: {}", CHECKSUM_ERROR_PREFIX, e)))?;
    let expected = find_expected_hash(&sums, asset_name).ok_or_else(|| {
        AppError::FileSystemError(format!(
            "{}MISSING: no SHA-256 entry for {} in SHA256SUMS.txt",
            CHECKSUM_ERROR_PREFIX, asset_name
        ))
    })?;

    let path = temp_path.to_path_buf();
    let actual = tokio::task::spawn_blocking(move || sha256_file(&path))
        .await
        .map_err(|e| AppError::FileSystemError(format!("Checksum task failed: {}", e)))??;

    if actual != expected {
        return Err(AppError::FileSystemError(format!(
            "{}MISMATCH: expected {}, got {}",
            CHECKSUM_ERROR_PREFIX, expected, actual
        )));
    }
    Ok(())
}

#[command]
pub async fn apply_portable_update(
    app: AppHandle,
    temp_download_path: String,
    asset_name: String,
    checksums_url: Option<String>,
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

    let clean_asset_name = validate_asset_name(&asset_name)?;

    // Integrity gate: refuse to apply anything that does not match the release SHA256SUMS.txt.
    if let Err(e) = verify_asset_checksum(temp_path, &clean_asset_name, checksums_url.as_deref()).await {
        let _ = fs::remove_file(temp_path);
        return Err(e);
    }

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
