use crate::adb::shell::execute_adb_with_recovery;
use crate::errors::{AppError, AppResult};
use std::time::Duration;
use tauri::{command, AppHandle};

#[command]
pub async fn check_companion_installed(app: AppHandle, device: String) -> AppResult<bool> {
    let args = vec![
        "shell".to_string(),
        "pm".to_string(),
        "list".to_string(),
        "packages".to_string(),
        "com.robotrunner.companion".to_string(),
    ];
    let output = execute_adb_with_recovery(&app, Some(&device), args).await?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let installed = stdout.contains("com.robotrunner.companion");
    eprintln!("[Companion Rust] check_companion_installed for {}: {}", device, installed);
    Ok(installed)
}

#[command]
pub async fn start_companion_forward(
    app: AppHandle,
    device: String,
    local_port: Option<u16>,
    remote_port: Option<u16>,
) -> AppResult<u16> {
    let l_port = local_port.unwrap_or(9876);
    let r_port = remote_port.unwrap_or(9876);

    let args = vec![
        "forward".to_string(),
        format!("tcp:{}", l_port),
        format!("tcp:{}", r_port),
    ];

    eprintln!("[Companion Rust] ADB forward: adb -s {} forward tcp:{} tcp:{}", device, l_port, r_port);
    let output = execute_adb_with_recovery(&app, Some(&device), args).await?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    eprintln!("[Companion Rust] ADB forward result: stdout='{}', stderr='{}', status={}", stdout.trim(), stderr.trim(), output.status);

    if output.status.success() {
        Ok(l_port)
    } else {
        Err(AppError::AdbError(format!(
            "Failed to setup ADB port forwarding: {}",
            stderr
        )))
    }
}

#[command]
pub async fn stop_companion_forward(
    app: AppHandle,
    device: String,
    local_port: Option<u16>,
) -> AppResult<()> {
    let l_port = local_port.unwrap_or(9876);
    let args = vec![
        "forward".to_string(),
        "--remove".to_string(),
        format!("tcp:{}", l_port),
    ];
    let _ = execute_adb_with_recovery(&app, Some(&device), args).await;
    Ok(())
}

#[command]
pub async fn launch_companion_app(app: AppHandle, device: String) -> AppResult<()> {
    let args = vec![
        "shell".to_string(),
        "am".to_string(),
        "start".to_string(),
        "-n".to_string(),
        "com.robotrunner.companion/.MainActivity".to_string(),
    ];
    eprintln!("[Companion Rust] Launching intent: adb -s {} am start...", device);
    let output = execute_adb_with_recovery(&app, Some(&device), args).await?;
    if output.status.success() {
        Ok(())
    } else {
        Err(AppError::AdbError(format!(
            "Failed to launch Companion App: {}",
            String::from_utf8_lossy(&output.stderr)
        )))
    }
}

#[command]
pub async fn enable_companion_accessibility(app: AppHandle, device: String) -> AppResult<()> {
    let args = vec![
        "shell".to_string(),
        "settings".to_string(),
        "put".to_string(),
        "secure".to_string(),
        "enabled_accessibility_services".to_string(),
        "com.robotrunner.companion/.service.CompanionAccessibilityService".to_string(),
    ];
    eprintln!("[Companion Rust] Enabling accessibility service via ADB on {}", device);
    let output = execute_adb_with_recovery(&app, Some(&device), args).await?;
    if output.status.success() {
        Ok(())
    } else {
        Err(AppError::AdbError(format!(
            "Failed to enable accessibility service: {}",
            String::from_utf8_lossy(&output.stderr)
        )))
    }
}

#[command]
pub async fn fetch_companion_info(port: Option<u16>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/device-info", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(3000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to fetch companion info: {}", e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}

#[command]
pub async fn fetch_companion_ui_tree(port: Option<u16>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/ui-tree", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(3000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to fetch companion UI tree: {}", e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}

#[command]
pub async fn fetch_companion_events(port: Option<u16>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/events/recent", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(3000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to fetch companion events: {}", e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}

#[command]
pub async fn run_companion_standalone_checkup(port: Option<u16>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/checkup/run", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(5000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to run companion checkup: {}", e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}

#[command]
pub async fn generate_companion_pdf_report(port: Option<u16>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/checkup/pdf", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(6000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to generate companion PDF report: {}", e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}

#[command]
pub async fn trigger_companion_action(
    port: Option<u16>,
    endpoint: String,
    payload: Option<String>,
) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let clean_endpoint = if endpoint.starts_with('/') { endpoint } else { format!("/{}", endpoint) };
    let url = format!("http://127.0.0.1:{}{}", p, clean_endpoint);
    eprintln!("[Companion Rust] Triggering action at {}", url);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(4000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let req_builder = if let Some(body) = payload {
        client.post(&url).header("Content-Type", "application/json").body(body)
    } else {
        client.post(&url)
    };

    let resp = req_builder
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to trigger action {}: {}", clean_endpoint, e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}
