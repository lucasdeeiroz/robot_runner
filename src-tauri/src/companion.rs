use crate::adb::shell::execute_adb_with_recovery;
use crate::errors::{AppError, AppResult};
use std::time::Duration;
use tauri::{command, AppHandle};

static ACTIVE_COMPANION_DEVICE: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

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

static FORWARDED_COMPANION_STATE: std::sync::Mutex<Option<(String, u16, u16)>> = std::sync::Mutex::new(None);

#[command]
pub async fn start_companion_forward(
    app: AppHandle,
    device: String,
    local_port: Option<u16>,
    remote_port: Option<u16>,
) -> AppResult<u16> {
    let l_port = local_port.unwrap_or(9876);
    let r_port = remote_port.unwrap_or(9876);

    // If already forwarded/prepared for this device and ports, avoid redundant execution
    if let Ok(fwd_guard) = FORWARDED_COMPANION_STATE.lock() {
        if let Some((ref dev, lp, rp)) = *fwd_guard {
            if dev == &device && lp == l_port && rp == r_port {
                return Ok(l_port);
            }
        }
    }

    // Save active device for transparent ADB Shell fallback
    if let Ok(mut dev_guard) = ACTIVE_COMPANION_DEVICE.lock() {
        *dev_guard = Some(device.clone());
    }

    let args = vec![
        "forward".to_string(),
        format!("tcp:{}", l_port),
        format!("tcp:{}", r_port),
    ];

    eprintln!("[Companion Rust] ADB forward: adb -s {} forward tcp:{} tcp:{}", device, l_port, r_port);
    let output = execute_adb_with_recovery(&app, Some(&device), args).await;
    
    if let Ok(mut fwd_guard) = FORWARDED_COMPANION_STATE.lock() {
        *fwd_guard = Some((device.clone(), l_port, r_port));
    }

    match output {
        Ok(out) if out.status.success() => {
            eprintln!("[Companion Rust] ADB port forward established on port: {}", l_port);
            Ok(l_port)
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            eprintln!(
                "[Companion Rust] ADB forward returned non-zero status (stdout: '{}', stderr: '{}'). Enabling ADB Shell Tunneling fallback.",
                stdout.trim(),
                stderr.trim()
            );
            Ok(l_port)
        }
        Err(e) => {
            eprintln!("[Companion Rust] ADB forward command failed: {}. Enabling ADB Shell Tunneling fallback.", e);
            Ok(l_port)
        }
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
    // 1. Try starting the background CompanionServerService directly (so HTTP server starts immediately)
    let srv_args = vec![
        "shell".to_string(),
        "am".to_string(),
        "start-foreground-service".to_string(),
        "-n".to_string(),
        "com.lucasdeeiroz.robotrunner/.CompanionServerService".to_string(),
    ];
    let _ = execute_adb_with_recovery(&app, Some(&device), srv_args).await;

    let srv_args_legacy = vec![
        "shell".to_string(),
        "am".to_string(),
        "startservice".to_string(),
        "-n".to_string(),
        "com.lucasdeeiroz.robotrunner/.CompanionServerService".to_string(),
    ];
    let _ = execute_adb_with_recovery(&app, Some(&device), srv_args_legacy).await;

    // 2. Start MainActivity
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
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
        "android.permission.NEARBY_WIFI_DEVICES",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.BLUETOOTH",
        "android.permission.INTERNET",
        "android.permission.BATTERY_STATS",
        "android.permission.PACKAGE_USAGE_STATS",
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

async fn execute_adb_with_piped_stdin(
    app: &AppHandle,
    device: Option<&str>,
    args: Vec<String>,
    stdin_data: &[u8],
) -> AppResult<std::process::Output> {
    use crate::cmd_utils::{get_adb_program, new_tokio_command};
    use tokio::io::AsyncWriteExt;

    let program = get_adb_program(app);
    let mut cmd = new_tokio_command(&program);
    if let Some(d) = device {
        cmd.arg("-s").arg(d);
    }
    cmd.args(&args);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::AdbError(format!("Failed to spawn {}: {}", program, e)))?;

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(stdin_data).await;
        let _ = stdin.shutdown().await;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| AppError::AdbError(format!("Failed to wait for {}: {}", program, e)))?;

    Ok(output)
}

async fn send_companion_http_request(
    app: &AppHandle,
    device: Option<String>,
    port: Option<u16>,
    endpoint: &str,
    method: &str,
    payload: Option<&str>,
    timeout_ms: u64,
) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let clean_endpoint = if endpoint.starts_with('/') { endpoint.to_string() } else { format!("/{}", endpoint) };
    let url = format!("http://127.0.0.1:{}{}", p, clean_endpoint);
    let m = method.to_uppercase();

    // 1. Try Direct HTTP via reqwest
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build();

    if let Ok(c) = client {
        let req_builder = match m.as_str() {
            "GET" => c.get(&url),
            "PUT" => if let Some(body) = payload { c.put(&url).header("Content-Type", "application/json").body(body.to_string()) } else { c.put(&url) },
            "DELETE" => c.delete(&url),
            _ => if let Some(body) = payload { c.post(&url).header("Content-Type", "application/json").body(body.to_string()) } else { c.post(&url) }
        };

        if let Ok(resp) = req_builder.send().await {
            if let Ok(text) = resp.text().await {
                if !text.trim().is_empty() {
                    return Ok(text);
                }
            }
        }
    }

    // 2. Fallback: ADB Shell Tunneling via toybox nc / nc (for POS terminals or blocked forwards)
    let target_dev = device.or_else(|| {
        ACTIVE_COMPANION_DEVICE.lock().ok().and_then(|g| g.clone())
    });

    if let Some(dev) = target_dev {
        let http_payload = if let Some(body) = payload {
            format!(
                "{} {} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                m, clean_endpoint, body.len(), body
            )
        } else {
            format!(
                "{} {} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
                m, clean_endpoint
            )
        };

        let shell_cmd = format!(
            "toybox nc -w 3 127.0.0.1 {} || nc -w 3 127.0.0.1 {}",
            p, p
        );

        let args = vec![
            "shell".to_string(),
            shell_cmd,
        ];

        let output = execute_adb_with_piped_stdin(app, Some(&dev), args, http_payload.as_bytes()).await?;
        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        let normalized = raw_stdout.replace("\r", "");

        if let Some(body_start) = normalized.find("\n\n") {
            let body = normalized[body_start + 2..].trim();
            if !body.is_empty() {
                return Ok(body.to_string());
            }
        }
        
        if let Some(first_brace) = raw_stdout.find('{') {
            if let Some(last_brace) = raw_stdout.rfind('}') {
                if last_brace >= first_brace {
                    return Ok(raw_stdout[first_brace..=last_brace].trim().to_string());
                }
            }
        } else if let Some(first_bracket) = raw_stdout.find('[') {
            if let Some(last_bracket) = raw_stdout.rfind(']') {
                if last_bracket >= first_bracket {
                    return Ok(raw_stdout[first_bracket..=last_bracket].trim().to_string());
                }
            }
        } else if output.status.success() && !raw_stdout.trim().is_empty() {
            return Ok(raw_stdout.trim().to_string());
        }
    }

    Err(AppError::FileSystemError(format!(
        "Failed to communicate with Companion on port {} (endpoint {})",
        p, clean_endpoint
    )))
}

#[command]
pub async fn fetch_companion_info(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    send_companion_http_request(&app, device, port, "/device-info", "GET", None, 3000).await
}

#[command]
pub async fn fetch_companion_ui_tree(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    send_companion_http_request(&app, device, port, "/ui-tree", "GET", None, 1500).await
}

#[command]
pub async fn fetch_companion_events(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    send_companion_http_request(&app, device, port, "/events/recent", "GET", None, 3000).await
}

#[command]
pub async fn run_companion_standalone_checkup(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    send_companion_http_request(&app, device, port, "/checkup/run", "GET", None, 6000).await
}

#[command]
pub async fn generate_companion_pdf_report(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    send_companion_http_request(&app, device, port, "/checkup/pdf", "GET", None, 6000).await
}

#[command]
pub async fn trigger_companion_action(
    app: AppHandle,
    port: Option<u16>,
    endpoint: String,
    payload: Option<String>,
    method: Option<String>,
    device: Option<String>,
) -> AppResult<String> {
    let m = method.unwrap_or_else(|| "POST".to_string());
    send_companion_http_request(&app, device, port, &endpoint, &m, payload.as_deref(), 4000).await
}

#[command]
pub async fn fetch_companion_screenshot(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let p = port.unwrap_or(9876);
    let url = format!("http://127.0.0.1:{}/screenshot", p);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1500))
        .build();

    if let Ok(c) = client {
        if let Ok(resp) = c.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    return Ok(format!("data:image/jpeg;base64,{}", b64));
                }
            }
        }
    }

    // Fallback: ADB screencap for POS terminal / blocked forward
    let target_dev = device.or_else(|| {
        ACTIVE_COMPANION_DEVICE.lock().ok().and_then(|g| g.clone())
    });

    if let Some(dev) = target_dev {
        let args = vec![
            "shell".to_string(),
            "screencap -p | base64".to_string(),
        ];
        let output = execute_adb_with_recovery(&app, Some(&dev), args).await?;
        if output.status.success() {
            let raw_stdout = String::from_utf8_lossy(&output.stdout);
            let clean_b64: String = raw_stdout.chars().filter(|c| !c.is_whitespace()).collect();
            if clean_b64.len() > 100 {
                return Ok(format!("data:image/png;base64,{}", clean_b64));
            }
        }
    }

    Err(AppError::FileSystemError("Companion screenshot endpoint returned error status".into()))
}

#[command]
pub async fn fetch_companion_fast_screenshot(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    fetch_companion_screenshot(app, port, device).await
}

#[command]
pub async fn perform_companion_node_action(
    app: AppHandle,
    port: Option<u16>,
    resource_id: Option<String>,
    text: Option<String>,
    content_description: Option<String>,
    action: String,
    value: Option<String>,
    device: Option<String>,
) -> AppResult<String> {
    let payload = serde_json::json!({
        "resourceId": resource_id,
        "text": text,
        "contentDescription": content_description,
        "action": action,
        "value": value
    });

    send_companion_http_request(
        &app,
        device,
        port,
        "/action/node-perform",
        "POST",
        Some(&payload.to_string()),
        2000,
    )
    .await
}

#[command]
pub async fn fetch_companion_artifacts(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    send_companion_http_request(&app, device, port, "/sync/artifacts", "GET", None, 4000).await
}

#[command]
pub async fn fetch_companion_fleet_peers(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    send_companion_http_request(&app, device, port, "/fleet/peers", "GET", None, 3000).await
}

#[command]
pub async fn push_companion_payload(app: AppHandle, port: Option<u16>, payload: String, device: Option<String>) -> AppResult<String> {
    send_companion_http_request(&app, device, port, "/sync/push", "POST", Some(&payload), 5000).await
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
pub async fn fetch_companion_pending_snippet(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<Option<String>> {
    let raw = send_companion_http_request(&app, device, port, "/inspector/pending-snippet", "GET", None, 2000).await;
    match raw {
        Ok(text) => {
            if let Ok(data) = serde_json::from_str::<PendingSnippetResponse>(&text) {
                if data.has_snippet {
                    Ok(data.snippet)
                } else {
                    Ok(None)
                }
            } else {
                Ok(None)
            }
        }
        Err(_) => Ok(None),
    }
}


