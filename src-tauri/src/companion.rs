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
        "com.lucasdeeiroz.robotrunner".to_string(),
    ];
    let output = execute_adb_with_recovery(&app, Some(&device), args).await?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let installed = stdout.contains("com.lucasdeeiroz.robotrunner");
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
        "com.lucasdeeiroz.robotrunner/.MainActivity".to_string(),
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
    let args1 = vec![
        "shell".to_string(),
        "settings".to_string(),
        "put".to_string(),
        "secure".to_string(),
        "enabled_accessibility_services".to_string(),
        "com.lucasdeeiroz.robotrunner/.service.CompanionAccessibilityService".to_string(),
    ];
    let args2 = vec![
        "shell".to_string(),
        "settings".to_string(),
        "put".to_string(),
        "secure".to_string(),
        "accessibility_enabled".to_string(),
        "1".to_string(),
    ];
    eprintln!("[Companion Rust] Enabling accessibility service via ADB on {}", device);
    let _ = execute_adb_with_recovery(&app, Some(&device), args1).await;
    let output = execute_adb_with_recovery(&app, Some(&device), args2).await?;
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
pub async fn grant_companion_permissions(app: AppHandle, device: String) -> AppResult<()> {
    let pkg = "com.lucasdeeiroz.robotrunner";
    let permissions = vec![
        "android.permission.POST_NOTIFICATIONS",
        // "android.permission.USE_ICC_ID",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
        "android.permission.NEARBY_WIFI_DEVICES",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.BLUETOOTH",
        // "android.permission.ACCESS_SURFACE_FLINGER",
        "android.permission.INTERNET",
        "android.permission.BATTERY_STATS",
        "android.permission.PACKAGE_USAGE_STATS",
        // "android.permission.DREAM_SERVICE",
        "android.permission.READ_PHONE_STATE",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.CAMERA",
        "android.permission.READ_LOGS",
        "android.permission.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
        "android.permission.BLUETOOTH_ADVERTISE",
        "android.permission.VIBRATE",
        "android.permission.ACCESS_WIFI_STATE",
        "android.permission.QUERY_ALL_PACKAGES",
        "android.permission.RECORD_AUDIO",
        "android.permission.DUMP",
        "android.permission.WAKE_LOCK",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.FORCE_STOP_PACKAGES",
    ];
    
    eprintln!("[Companion Rust] Granting necessary permissions via ADB on {}", device);
    for perm in permissions {
        let args = vec![
            "shell".to_string(),
            "pm".to_string(),
            "grant".to_string(),
            pkg.to_string(),
            perm.to_string(),
        ];
        let _ = execute_adb_with_recovery(&app, Some(&device), args).await;
    }
    Ok(())
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
        .timeout(Duration::from_millis(1000))
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
    method: Option<String>,
) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let clean_endpoint = if endpoint.starts_with('/') { endpoint } else { format!("/{}", endpoint) };
    let url = format!("http://127.0.0.1:{}{}", p, clean_endpoint);
    let m = method.unwrap_or_else(|| "POST".to_string()).to_uppercase();
    eprintln!("[Companion Rust] Triggering action at {} with method {}", url, m);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(4000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let req_builder = match m.as_str() {
        "GET" => client.get(&url),
        "PUT" => if let Some(body) = payload { client.put(&url).header("Content-Type", "application/json").body(body) } else { client.put(&url) },
        "DELETE" => client.delete(&url),
        _ => if let Some(body) = payload { client.post(&url).header("Content-Type", "application/json").body(body) } else { client.post(&url) }
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

#[command]
pub async fn fetch_companion_screenshot(port: Option<u16>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/screenshot", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to fetch companion screenshot: {}", e)))?;

    if resp.status().is_success() {
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| AppError::FileSystemError(format!("Failed to read screenshot bytes: {}", e)))?;

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(format!("data:image/jpeg;base64,{}", b64))
    } else {
        Err(AppError::FileSystemError("Companion screenshot endpoint returned error status".into()))
    }
}

#[command]
pub async fn fetch_companion_fast_screenshot(port: Option<u16>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/screenshot/fast", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(600))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to fetch fast companion screenshot: {}", e)))?;

    if resp.status().is_success() {
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| AppError::FileSystemError(format!("Failed to read fast screenshot bytes: {}", e)))?;

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(format!("data:image/jpeg;base64,{}", b64))
    } else {
        Err(AppError::FileSystemError("Companion fast screenshot endpoint returned error status".into()))
    }
}

#[command]
pub async fn perform_companion_node_action(
    port: Option<u16>,
    resource_id: Option<String>,
    text: Option<String>,
    content_description: Option<String>,
    action: String,
    value: Option<String>,
) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/action/node-perform", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1500))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let payload = serde_json::json!({
        "resourceId": resource_id,
        "text": text,
        "contentDescription": content_description,
        "action": action,
        "value": value
    });

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(payload.to_string())
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to perform companion node action: {}", e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}

#[command]
pub async fn fetch_companion_artifacts(port: Option<u16>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/sync/artifacts", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(4000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to fetch companion artifacts: {}", e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}

#[command]
pub async fn fetch_companion_fleet_peers(port: Option<u16>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/fleet/peers", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(3000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to fetch companion fleet peers: {}", e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}

#[command]
pub async fn push_companion_payload(port: Option<u16>, payload: String) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/sync/push", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(5000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(payload)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to push payload to companion: {}", e)))?;

    let text = resp
        .text()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read response body: {}", e)))?;

    Ok(text)
}

#[derive(serde::Serialize)]
pub struct HostMetadata {
    pub hostname: String,
    pub os_name: String,
}

#[command]
pub async fn get_host_metadata() -> AppResult<HostMetadata> {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Unknown Host".to_string());
        
    let os_name = std::env::consts::OS.to_string();

    Ok(HostMetadata {
        hostname,
        os_name,
    })
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct PendingSnippetResponse {
    status: String,
    #[serde(rename = "hasSnippet")]
    has_snippet: bool,
    snippet: Option<String>,
}

#[command]
pub async fn fetch_companion_pending_snippet(port: Option<u16>) -> AppResult<Option<String>> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/inspector/pending-snippet", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(2000))
        .build()
        .map_err(|e| AppError::FileSystemError(format!("Reqwest client build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to fetch pending snippet: {}", e)))?;

    if resp.status().is_success() {
        let data: PendingSnippetResponse = resp
            .json()
            .await
            .map_err(|e| AppError::FileSystemError(format!("Failed to parse pending snippet response: {}", e)))?;

        if data.has_snippet {
            Ok(data.snippet)
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

