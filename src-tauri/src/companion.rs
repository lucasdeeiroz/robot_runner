//! Robot Runner Companion gateway.
//!
//! Every HTTP exchange with the Companion app MUST go through [`companion_request`] /
//! [`companion_request_bytes`] (or [`companion_open_stream`] for streaming endpoints).
//! The gateway owns, per device:
//! - a dedicated local port (`adb -s <udid> forward tcp:<local> tcp:9876`), so devices never
//!   share or steal each other's forward;
//! - an in-memory auth token delivered through the `START_SERVER` broadcast and sent on every
//!   request as `X-RR-Token` (only `GET /ping` is unauthenticated);
//! - the `adb shell nc` tunnel fallback, used ONLY when the TCP connection itself cannot be
//!   established (never on HTTP status errors or read timeouts, so non-idempotent requests are
//!   never executed twice).

use crate::adb::shell::execute_adb_with_recovery;
use crate::errors::{AppError, AppResult};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{command, AppHandle};

pub const COMPANION_PACKAGE: &str = "com.lucasdeeiroz.robotrunner";
/// Port the Companion server listens on (device loopback only).
pub const COMPANION_REMOTE_PORT: u16 = 9876;
/// First local port used for per-device forwards. Range: [19876, 19975].
const LOCAL_PORT_BASE: u16 = 19876;
const LOCAL_PORT_SPAN: u16 = 100;
const COMPANION_RECEIVER: &str = "com.lucasdeeiroz.robotrunner/.receiver.CompanionCommandReceiver";
const ACTION_START_SERVER: &str = "com.lucasdeeiroz.robotrunner.START_SERVER";
const ACTION_STOP_SERVER: &str = "com.lucasdeeiroz.robotrunner.STOP_SERVER";
const ACCESSIBILITY_COMPONENT: &str =
    "com.lucasdeeiroz.robotrunner/.service.CompanionAccessibilityService";
const DEFAULT_IDLE_TIMEOUT_SECS: u32 = 300;
const TOKEN_HEADER: &str = "X-RR-Token";
/// Fail fast when the bridge is down (companion-integration rule §2).
const CONNECT_TIMEOUT: Duration = Duration::from_millis(1000);
/// After an `adb forward` failure, wait this long before trying to create it again.
const FORWARD_RETRY_COOLDOWN: Duration = Duration::from_secs(15);
/// Minimum interval between automatic START_SERVER re-sends caused by refused connections
/// (pollers hit the gateway every 1-3s; do not broadcast on every tick).
const RESTART_COOLDOWN: Duration = Duration::from_secs(10);
/// After a failed nc tunnel, skip the tunnel for this long.
const TUNNEL_RETRY_COOLDOWN: Duration = Duration::from_secs(15);

/// Total timeout for regular (fast) Companion endpoints.
pub const TIMEOUT_SHORT: Duration = Duration::from_millis(5000);
/// Total timeout for medium payloads (app lists, screenshots, artifact sync).
pub const TIMEOUT_MEDIUM: Duration = Duration::from_millis(15000);
/// Total timeout for genuinely long operations (checkup run, PDF generation).
pub const TIMEOUT_LONG: Duration = Duration::from_millis(60000);

// ---------------------------------------------------------------------------
// Session state (per device)
// ---------------------------------------------------------------------------

struct CompanionSession {
    local_port: u16,
    token: String,
    forward_ready: bool,
    forward_failed_at: Option<Instant>,
    token_delivered: bool,
    /// Last automatic START_SERVER re-send triggered by a refused/reset connection.
    restart_attempt_at: Option<Instant>,
    /// Last failed `adb shell nc` tunnel attempt (avoids spawning adb on every poll).
    tunnel_failed_at: Option<Instant>,
}

#[derive(Clone, Copy)]
struct ForwardState {
    port: u16,
    ready: bool,
}

fn sessions() -> &'static Mutex<HashMap<String, CompanionSession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, CompanionSession>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_sessions() -> AppResult<std::sync::MutexGuard<'static, HashMap<String, CompanionSession>>> {
    sessions()
        .lock()
        .map_err(|e| AppError::StringError(format!("Companion session lock poisoned: {}", e)))
}

/// Per-device async lock serializing forward/token setup (avoids duplicated broadcasts).
fn device_setup_lock(device: &str) -> Arc<tokio::sync::Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> = OnceLock::new();
    let locks = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    match locks.lock() {
        Ok(mut map) => map
            .entry(device.to_string())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone(),
        Err(_) => Arc::new(tokio::sync::Mutex::new(())),
    }
}

/// 64 hex chars (256 bits) from the thread-local CSPRNG (ChaCha seeded by the OS).
fn generate_token() -> String {
    let bytes: [u8; 32] = rand::random();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn validate_device(device: &str) -> AppResult<()> {
    let d = device.trim();
    if d.is_empty() || d.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(AppError::AdbError("A valid Companion device serial is required".into()));
    }
    Ok(())
}

fn require_device(device: Option<String>) -> AppResult<String> {
    let d = device.unwrap_or_default();
    validate_device(&d)?;
    Ok(d)
}

fn normalize_method(method: &str) -> AppResult<String> {
    let m = method.trim().to_uppercase();
    match m.as_str() {
        "GET" | "POST" | "PUT" | "DELETE" => Ok(m),
        _ => Err(AppError::NetworkError(format!("Unsupported Companion HTTP method: {}", method))),
    }
}

fn validate_endpoint(endpoint: &str) -> AppResult<()> {
    if !endpoint.starts_with('/')
        || endpoint.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(AppError::NetworkError(format!("Invalid Companion endpoint: {:?}", endpoint)));
    }
    Ok(())
}

fn endpoint_path(endpoint: &str) -> &str {
    endpoint.split('?').next().unwrap_or(endpoint)
}

/// Picks a total timeout for an endpoint (short by default, longer only for heavy operations).
pub fn timeout_for_endpoint(endpoint: &str) -> Duration {
    let path = endpoint_path(endpoint);
    if path.starts_with("/checkup/run") || path.starts_with("/checkup/pdf") || path.starts_with("/rrt/") {
        TIMEOUT_LONG
    } else if path.starts_with("/apps")
        || path.starts_with("/screenshot")
        || path.starts_with("/sync/push")
        || path.starts_with("/sync/artifacts")
        || path.starts_with("/performance/")
    {
        TIMEOUT_MEDIUM
    } else {
        TIMEOUT_SHORT
    }
}

fn find_free_local_port(map: &HashMap<String, CompanionSession>) -> AppResult<u16> {
    for offset in 0..LOCAL_PORT_SPAN {
        let port = LOCAL_PORT_BASE + offset;
        if map.values().any(|s| s.local_port == port) {
            continue;
        }
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err(AppError::NetworkError(format!(
        "No free local port available for Companion forward in range {}-{}",
        LOCAL_PORT_BASE,
        LOCAL_PORT_BASE + LOCAL_PORT_SPAN - 1
    )))
}

/// Looks for a forward created by a previous app session for this device (`adb forward --list`).
async fn find_existing_forward(app: &AppHandle, device: &str) -> Option<u16> {
    let out = execute_adb_with_recovery(app, None, vec!["forward".into(), "--list".into()]).await.ok()?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let remote = format!("tcp:{}", COMPANION_REMOTE_PORT);
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() == 3 && parts[0] == device && parts[2] == remote {
            if let Some(p) = parts[1].strip_prefix("tcp:").and_then(|p| p.parse::<u16>().ok()) {
                if (LOCAL_PORT_BASE..LOCAL_PORT_BASE + LOCAL_PORT_SPAN).contains(&p) {
                    return Some(p);
                }
            }
        }
    }
    None
}

/// Creates (or reuses) the per-device `adb forward tcp:<local> tcp:9876`.
async fn ensure_forward(app: &AppHandle, device: &str, force: bool) -> AppResult<ForwardState> {
    validate_device(device)?;
    let lock = device_setup_lock(device);
    let _guard = lock.lock().await;

    let existing_port = {
        let map = lock_sessions()?;
        if let Some(s) = map.get(device) {
            if s.forward_ready && !force {
                return Ok(ForwardState { port: s.local_port, ready: true });
            }
            if !s.forward_ready {
                if let Some(failed_at) = s.forward_failed_at {
                    if failed_at.elapsed() < FORWARD_RETRY_COOLDOWN {
                        return Ok(ForwardState { port: s.local_port, ready: false });
                    }
                }
            }
            Some(s.local_port)
        } else {
            None
        }
    };

    let port = match existing_port {
        Some(p) => p,
        None => {
            let reused = find_existing_forward(app, device).await;
            let mut map = lock_sessions()?;
            let p = match reused {
                Some(p) if !map.values().any(|s| s.local_port == p) => p,
                _ => find_free_local_port(&map)?,
            };
            map.insert(
                device.to_string(),
                CompanionSession {
                    local_port: p,
                    token: generate_token(),
                    forward_ready: false,
                    forward_failed_at: None,
                    token_delivered: false,
                    restart_attempt_at: None,
                    tunnel_failed_at: None,
                },
            );
            p
        }
    };

    let args = vec![
        "forward".to_string(),
        format!("tcp:{}", port),
        format!("tcp:{}", COMPANION_REMOTE_PORT),
    ];
    let ok = match execute_adb_with_recovery(app, Some(device), args).await {
        Ok(out) if out.status.success() => true,
        Ok(out) => {
            eprintln!(
                "[Companion] adb forward tcp:{} failed for {}: {}",
                port,
                device,
                String::from_utf8_lossy(&out.stderr).trim()
            );
            false
        }
        Err(e) => {
            eprintln!("[Companion] adb forward tcp:{} failed for {}: {}", port, device, e);
            false
        }
    };

    let mut map = lock_sessions()?;
    if let Some(s) = map.get_mut(device) {
        s.forward_ready = ok;
        s.forward_failed_at = if ok { None } else { Some(Instant::now()) };
    }
    Ok(ForwardState { port, ready: ok })
}

/// Returns true (and records the attempt) when an automatic restart is allowed now.
fn take_restart_slot(device: &str) -> bool {
    let Ok(mut map) = lock_sessions() else { return false };
    let Some(s) = map.get_mut(device) else { return false };
    if s.restart_attempt_at.map_or(false, |t| t.elapsed() < RESTART_COOLDOWN) {
        return false;
    }
    s.restart_attempt_at = Some(Instant::now());
    true
}

fn tunnel_in_cooldown(device: &str) -> bool {
    lock_sessions()
        .ok()
        .and_then(|m| m.get(device).and_then(|s| s.tunnel_failed_at))
        .map_or(false, |t| t.elapsed() < TUNNEL_RETRY_COOLDOWN)
}

fn record_tunnel_result(device: &str, ok: bool) {
    if let Ok(mut map) = lock_sessions() {
        if let Some(s) = map.get_mut(device) {
            s.tunnel_failed_at = if ok { None } else { Some(Instant::now()) };
        }
    }
}

fn session_token(device: &str) -> AppResult<String> {
    let map = lock_sessions()?;
    map.get(device)
        .map(|s| s.token.clone())
        .ok_or_else(|| AppError::NetworkError(format!("No Companion session for {}", device)))
}

async fn send_start_broadcast(app: &AppHandle, device: &str, token: &str, idle_timeout: u32) -> AppResult<()> {
    let idle = idle_timeout.clamp(60, 3600);
    let args = vec![
        "shell".to_string(),
        "am".to_string(),
        "broadcast".to_string(),
        "-a".to_string(),
        ACTION_START_SERVER.to_string(),
        "-n".to_string(),
        COMPANION_RECEIVER.to_string(),
        "--es".to_string(),
        "AUTH_TOKEN".to_string(),
        token.to_string(),
        "--ei".to_string(),
        "IDLE_TIMEOUT_SECONDS".to_string(),
        idle.to_string(),
    ];
    let out = execute_adb_with_recovery(app, Some(device), args).await?;
    if !out.status.success() {
        return Err(AppError::AdbError(format!(
            "Companion START_SERVER broadcast failed: {}",
            crate::cmd_utils::format_adb_error(&out)
        )));
    }
    Ok(())
}

/// Delivers the session token (starting the server if needed). Returns `true` when a broadcast
/// was sent during this call.
async fn ensure_token(app: &AppHandle, device: &str, force: bool, idle_timeout: u32) -> AppResult<bool> {
    let lock = device_setup_lock(device);
    let _guard = lock.lock().await;

    let token = {
        let map = lock_sessions()?;
        let s = map
            .get(device)
            .ok_or_else(|| AppError::NetworkError(format!("No Companion session for {}", device)))?;
        if s.token_delivered && !force {
            return Ok(false);
        }
        s.token.clone()
    };

    let result = send_start_broadcast(app, device, &token, idle_timeout).await;
    // Mark as delivered even on failure to avoid a broadcast storm; a 401 forces a new one.
    if let Ok(mut map) = lock_sessions() {
        if let Some(s) = map.get_mut(device) {
            s.token_delivered = true;
        }
    }
    result.map(|_| true)
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

fn companion_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .pool_idle_timeout(Duration::from_secs(30))
            .tcp_keepalive(Some(Duration::from_secs(15)))
            .no_proxy()
            .build()
            .unwrap_or_default()
    })
}

enum SendError {
    /// The TCP connection could not be established (request never reached the server).
    Connect(String),
    /// The forward accepted the connection but it was refused/reset/closed before ANY response
    /// byte arrived. With `adb forward` this is what a stopped Companion server looks like
    /// (adb accepts locally, then drops the socket because nothing listens on the device).
    Closed(String),
    Other(AppError),
}

/// True when the error chain says the peer closed/reset the connection without a response.
fn is_closed_without_response(e: &reqwest::Error) -> bool {
    let mut chain = e.to_string().to_lowercase();
    let mut src: Option<&dyn std::error::Error> = std::error::Error::source(e);
    while let Some(s) = src {
        chain.push(' ');
        chain.push_str(&s.to_string().to_lowercase());
        src = s.source();
    }
    chain.contains("connection closed before message completed")
        || chain.contains("connection reset")
        || chain.contains("connection refused")
        || chain.contains("connection was reset")
        || chain.contains("os error 10054")
        || chain.contains("os error 10061")
        || chain.contains("os error 104")
        || chain.contains("os error 111")
        || chain.contains("broken pipe")
}

fn build_request(
    port: u16,
    method: &str,
    endpoint: &str,
    body: Option<&str>,
    token: Option<&str>,
) -> AppResult<reqwest::RequestBuilder> {
    let url = format!("http://127.0.0.1:{}{}", port, endpoint);
    let m = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| AppError::NetworkError(format!("Invalid HTTP method: {}", e)))?;
    let mut req = companion_client().request(m, &url);
    if let Some(t) = token {
        req = req.header(TOKEN_HEADER, t);
    }
    if let Some(b) = body {
        req = req.header("Content-Type", "application/json").body(b.to_string());
    }
    Ok(req)
}

async fn http_once(
    port: u16,
    method: &str,
    endpoint: &str,
    body: Option<&str>,
    token: Option<&str>,
    timeout: Duration,
) -> Result<(u16, Vec<u8>), SendError> {
    let req = build_request(port, method, endpoint, body, token).map_err(SendError::Other)?;
    let resp = req.timeout(timeout).send().await.map_err(classify_reqwest_error)?;
    let status = resp.status().as_u16();
    let bytes = resp.bytes().await.map_err(|e| {
        SendError::Other(AppError::NetworkError(format!("Failed to read Companion response: {}", e)))
    })?;
    Ok((status, bytes.to_vec()))
}

fn classify_reqwest_error(e: reqwest::Error) -> SendError {
    // Note: connect timeouts report both is_connect() and is_timeout(); check connect first.
    if e.is_connect() {
        SendError::Connect(e.to_string())
    } else if e.is_timeout() {
        // Read timeouts are never retried: the server may have executed the request.
        SendError::Other(AppError::NetworkError(format!("Companion request timed out: {}", e)))
    } else if is_closed_without_response(&e) {
        SendError::Closed(e.to_string())
    } else {
        SendError::Other(AppError::NetworkError(format!("Companion request failed: {}", e)))
    }
}

async fn execute_adb_with_piped_stdin(
    app: &AppHandle,
    device: &str,
    args: Vec<String>,
    stdin_data: &[u8],
    timeout: Duration,
) -> AppResult<std::process::Output> {
    use crate::cmd_utils::{get_adb_program, new_tokio_command};
    use tokio::io::AsyncWriteExt;

    let program = get_adb_program(app);
    let mut cmd = new_tokio_command(&program);
    cmd.arg("-s").arg(device);
    cmd.args(&args);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    cmd.kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::AdbError(format!("Failed to spawn {}: {}", program, e)))?;

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(stdin_data).await;
        let _ = stdin.shutdown().await;
    }

    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(res) => res.map_err(|e| AppError::AdbError(format!("Failed to wait for {}: {}", program, e))),
        Err(_) => Err(AppError::NetworkError("Companion ADB tunnel timed out".into())),
    }
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn decode_chunked(body: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(body.len());
    let mut rest = body;
    loop {
        let Some(line_end) = find_subslice(rest, b"\r\n") else { break };
        let size_str = String::from_utf8_lossy(&rest[..line_end]);
        let size_hex = size_str.split(';').next().unwrap_or("").trim();
        let Ok(size) = usize::from_str_radix(size_hex, 16) else { break };
        rest = &rest[line_end + 2..];
        if size == 0 || rest.len() < size {
            if size > 0 {
                out.extend_from_slice(rest);
            }
            break;
        }
        out.extend_from_slice(&rest[..size]);
        rest = &rest[size..];
        if rest.starts_with(b"\r\n") {
            rest = &rest[2..];
        }
    }
    out
}

fn parse_raw_http_response(raw: &[u8]) -> Option<(u16, Vec<u8>)> {
    let (head_end, sep_len) = match find_subslice(raw, b"\r\n\r\n") {
        Some(i) => (i, 4),
        None => (find_subslice(raw, b"\n\n")?, 2),
    };
    let head = String::from_utf8_lossy(&raw[..head_end]);
    let mut lines = head.lines();
    let status_line = lines.next()?;
    if !status_line.starts_with("HTTP/") {
        return None;
    }
    let status = status_line.split_whitespace().nth(1)?.parse::<u16>().ok()?;
    let chunked = lines.any(|l| {
        let l = l.to_ascii_lowercase();
        l.starts_with("transfer-encoding:") && l.contains("chunked")
    });
    let body = &raw[head_end + sep_len..];
    Some((status, if chunked { decode_chunked(body) } else { body.to_vec() }))
}

/// Raw HTTP over `adb shell nc` to the device loopback. Only used when the forward is unusable.
async fn tunnel_once(
    app: &AppHandle,
    device: &str,
    method: &str,
    endpoint: &str,
    body: Option<&str>,
    token: Option<&str>,
    timeout: Duration,
) -> AppResult<(u16, Vec<u8>)> {
    // Defensive re-validation: these values are written verbatim into the raw request.
    let method = normalize_method(method)?;
    validate_endpoint(endpoint)?;
    if let Some(t) = token {
        if !t.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            return Err(AppError::NetworkError("Invalid Companion token".into()));
        }
    }

    let mut request = format!("{} {} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n", method, endpoint);
    if let Some(t) = token {
        request.push_str(&format!("{}: {}\r\n", TOKEN_HEADER, t));
    }
    match body {
        Some(b) => request.push_str(&format!(
            "Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            b.len(),
            b
        )),
        None => request.push_str("\r\n"),
    }

    let wait_secs = timeout.as_secs().clamp(3, 120);
    let shell_cmd = format!(
        "toybox nc -w {w} 127.0.0.1 {p} || nc -w {w} 127.0.0.1 {p}",
        w = wait_secs,
        p = COMPANION_REMOTE_PORT
    );
    let output = execute_adb_with_piped_stdin(
        app,
        device,
        vec!["shell".to_string(), shell_cmd],
        request.as_bytes(),
        timeout + Duration::from_secs(2),
    )
    .await?;

    parse_raw_http_response(&output.stdout).ok_or_else(|| {
        AppError::NetworkError(format!(
            "Companion ADB tunnel returned no valid HTTP response for {} {}",
            method, endpoint
        ))
    })
}

/// Sends one logical request:
/// 1. HTTP via the per-device forward;
/// 2. on connect failure: re-create the forward once and retry;
/// 3. on refused/reset/closed-without-response (server stopped, token cleared by the app):
///    re-send START_SERVER with the token once, wait ~700ms and retry;
/// 4. only if the connection still cannot be established: `adb shell nc` tunnel.
/// HTTP status errors and read timeouts are returned as-is (never re-sent).
async fn send_with_fallback(
    app: &AppHandle,
    device: &str,
    fwd: ForwardState,
    method: &str,
    endpoint: &str,
    body: Option<&str>,
    needs_token: bool,
    timeout: Duration,
) -> AppResult<(u16, Vec<u8>)> {
    let mut port = fwd.port;
    let mut forward_ok = fwd.ready;
    let mut reforwarded = false;
    let mut restarted = false;

    while forward_ok {
        let token = if needs_token { Some(session_token(device)?) } else { None };
        match http_once(port, method, endpoint, body, token.as_deref(), timeout).await {
            Ok(r) => return Ok(r),
            Err(SendError::Other(e)) => return Err(e),
            Err(SendError::Connect(reason)) if !reforwarded => {
                eprintln!("[Companion] Connection to forward failed for {}: {}. Re-forwarding.", device, reason);
                reforwarded = true;
                let refwd = ensure_forward(app, device, true).await?;
                port = refwd.port;
                forward_ok = refwd.ready;
            }
            Err(SendError::Closed(reason)) if !restarted && needs_token && take_restart_slot(device) => {
                eprintln!("[Companion] Server unreachable behind forward for {}: {}. Re-sending START_SERVER.", device, reason);
                restarted = true;
                if let Err(e) = ensure_token(app, device, true, DEFAULT_IDLE_TIMEOUT_SECS).await {
                    eprintln!("[Companion] START_SERVER re-broadcast failed for {}: {}", device, e);
                }
                tokio::time::sleep(Duration::from_millis(700)).await;
            }
            Err(SendError::Connect(_)) | Err(SendError::Closed(_)) => break,
        }
    }

    if tunnel_in_cooldown(device) {
        return Err(AppError::NetworkError(format!(
            "Companion unreachable on {} (forward and ADB tunnel unavailable)",
            device
        )));
    }
    let token = if needs_token { Some(session_token(device)?) } else { None };
    let result = tunnel_once(app, device, method, endpoint, body, token.as_deref(), timeout).await;
    record_tunnel_result(device, result.is_ok());
    result
}

// ---------------------------------------------------------------------------
// Public gateway API
// ---------------------------------------------------------------------------

/// Single gateway for Companion HTTP calls. Returns `(status, raw body bytes)`.
pub async fn companion_request_bytes(
    app: &AppHandle,
    device: &str,
    method: &str,
    endpoint: &str,
    body: Option<String>,
    timeout: Duration,
) -> AppResult<(u16, Vec<u8>)> {
    validate_device(device)?;
    let method = normalize_method(method)?;
    validate_endpoint(endpoint)?;

    let fwd = ensure_forward(app, device, false).await?;
    let needs_token = endpoint_path(endpoint) != "/ping";
    if needs_token {
        if let Err(e) = ensure_token(app, device, false, DEFAULT_IDLE_TIMEOUT_SECS).await {
            eprintln!("[Companion] Token delivery failed for {}: {}", device, e);
        }
    }

    let body_ref = body.as_deref();
    let result = send_with_fallback(app, device, fwd, &method, endpoint, body_ref, needs_token, timeout).await;

    match result {
        // 401 means the server rejected the request without executing it: safe to retry once.
        Ok((401, _)) if needs_token => {
            ensure_token(app, device, true, DEFAULT_IDLE_TIMEOUT_SECS).await?;
            let fwd = ensure_forward(app, device, false).await?;
            send_with_fallback(app, device, fwd, &method, endpoint, body_ref, needs_token, timeout).await
        }
        other => other,
    }
}

/// Single gateway for Companion HTTP calls. Returns `(status, body as UTF-8 text)`.
pub async fn companion_request(
    app: &AppHandle,
    device: &str,
    method: &str,
    endpoint: &str,
    body: Option<String>,
    timeout: Duration,
) -> AppResult<(u16, String)> {
    let (status, bytes) = companion_request_bytes(app, device, method, endpoint, body, timeout).await?;
    Ok((status, String::from_utf8_lossy(&bytes).to_string()))
}

/// Like [`companion_request`] but fails on non-2xx status or empty body; returns the trimmed body.
pub async fn companion_request_ok(
    app: &AppHandle,
    device: &str,
    method: &str,
    endpoint: &str,
    body: Option<String>,
    timeout: Duration,
) -> AppResult<String> {
    let (status, text) = companion_request(app, device, method, endpoint, body, timeout).await?;
    let trimmed = text.trim();
    if !(200..300).contains(&status) {
        let snippet: String = trimmed.chars().take(300).collect();
        return Err(AppError::NetworkError(format!(
            "Companion {} {} returned HTTP {}: {}",
            method, endpoint, status, snippet
        )));
    }
    if trimmed.is_empty() {
        return Err(AppError::NetworkError(format!("Companion {} {} returned an empty body", method, endpoint)));
    }
    Ok(trimmed.to_string())
}

/// Convenience: GET + parse JSON, returning `None` on any failure or non-`"ok"` status.
pub async fn companion_get_json_ok(
    app: &AppHandle,
    device: &str,
    endpoint: &str,
    timeout: Duration,
) -> Option<serde_json::Value> {
    let text = companion_request_ok(app, device, "GET", endpoint, None, timeout).await.ok()?;
    let val = serde_json::from_str::<serde_json::Value>(&text).ok()?;
    if val.get("status").and_then(|s| s.as_str()) == Some("ok") {
        Some(val)
    } else {
        None
    }
}

/// Opens a streaming request (e.g. `/rrt/execute`) through the forward. No total timeout and no
/// nc tunnel fallback (streaming cannot be tunnelled); 401 triggers one token refresh + retry.
pub async fn companion_open_stream(
    app: &AppHandle,
    device: &str,
    method: &str,
    endpoint: &str,
    body: Option<String>,
) -> AppResult<reqwest::Response> {
    validate_device(device)?;
    let method = normalize_method(method)?;
    validate_endpoint(endpoint)?;

    let mut fwd = ensure_forward(app, device, false).await?;
    if !fwd.ready {
        fwd = ensure_forward(app, device, true).await?;
    }
    if !fwd.ready {
        return Err(AppError::NetworkError(format!(
            "ADB forward to the Companion is unavailable for {}",
            device
        )));
    }
    if let Err(e) = ensure_token(app, device, false, DEFAULT_IDLE_TIMEOUT_SECS).await {
        eprintln!("[Companion] Token delivery failed for {}: {}", device, e);
    }

    let mut attempt = 0;
    loop {
        attempt += 1;
        let token = session_token(device)?;
        let req = build_request(fwd.port, &method, endpoint, body.as_deref(), Some(&token))?;
        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) if e.is_connect() && attempt == 1 => {
                fwd = ensure_forward(app, device, true).await?;
                continue;
            }
            Err(e) if !e.is_timeout() && is_closed_without_response(&e) && attempt == 1 => {
                // Server stopped (token cleared by the app): restart it with our token, retry once.
                ensure_token(app, device, true, DEFAULT_IDLE_TIMEOUT_SECS).await?;
                tokio::time::sleep(Duration::from_millis(700)).await;
                continue;
            }
            Err(e) => return Err(AppError::NetworkError(format!("Companion stream request failed: {}", e))),
        };
        if resp.status().as_u16() == 401 && attempt == 1 {
            ensure_token(app, device, true, DEFAULT_IDLE_TIMEOUT_SECS).await?;
            continue;
        }
        return Ok(resp);
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[command]
pub async fn check_companion_installed(app: AppHandle, device: String) -> AppResult<bool> {
    let args = vec![
        "shell".to_string(),
        "pm".to_string(),
        "list".to_string(),
        "packages".to_string(),
        COMPANION_PACKAGE.to_string(),
    ];
    let output = execute_adb_with_recovery(&app, Some(&device), args).await?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().any(|l| l.trim() == format!("package:{}", COMPANION_PACKAGE)))
}

/// Kept for compatibility: ports are now allocated per device by the gateway; the requested
/// ports are ignored. Returns the local port bound to this device.
#[command]
pub async fn start_companion_forward(
    app: AppHandle,
    device: String,
    local_port: Option<u16>,
    remote_port: Option<u16>,
) -> AppResult<u16> {
    let _ = (local_port, remote_port);
    let fwd = ensure_forward(&app, &device, false).await?;
    Ok(fwd.port)
}

#[command]
pub async fn stop_companion_forward(app: AppHandle, device: String, local_port: Option<u16>) -> AppResult<()> {
    let _ = local_port;
    validate_device(&device)?;
    let port = {
        let mut map = lock_sessions()?;
        map.get_mut(&device).map(|s| {
            s.forward_ready = false;
            s.forward_failed_at = None;
            s.local_port
        })
    };
    if let Some(p) = port {
        let args = vec!["forward".to_string(), "--remove".to_string(), format!("tcp:{}", p)];
        let _ = execute_adb_with_recovery(&app, Some(&device), args).await;
    }
    Ok(())
}

#[command]
pub async fn start_companion_server(app: AppHandle, device: String, timeout_seconds: Option<u32>) -> AppResult<()> {
    let idle = timeout_seconds.unwrap_or(DEFAULT_IDLE_TIMEOUT_SECS).clamp(60, 3600);
    ensure_forward(&app, &device, false).await?;
    ensure_token(&app, &device, true, idle).await?;
    Ok(())
}

#[command]
pub async fn stop_companion_server(app: AppHandle, device: String) -> AppResult<()> {
    validate_device(&device)?;
    let args = vec![
        "shell".to_string(),
        "am".to_string(),
        "broadcast".to_string(),
        "-a".to_string(),
        ACTION_STOP_SERVER.to_string(),
        "-n".to_string(),
        COMPANION_RECEIVER.to_string(),
    ];
    let _ = execute_adb_with_recovery(&app, Some(&device), args).await;
    if let Ok(mut map) = lock_sessions() {
        if let Some(s) = map.get_mut(&device) {
            s.token_delivered = false;
        }
    }
    Ok(())
}

/// Explicit user action only: starts the server (with token) and opens the Companion UI.
#[command]
pub async fn launch_companion_app(app: AppHandle, device: String) -> AppResult<()> {
    if let Err(e) = start_companion_server(app.clone(), device.clone(), Some(DEFAULT_IDLE_TIMEOUT_SECS)).await {
        eprintln!("[Companion] START_SERVER broadcast failed before launch on {}: {}", device, e);
    }

    let args = vec![
        "shell".to_string(),
        "am".to_string(),
        "start".to_string(),
        "-n".to_string(),
        format!("{}/.MainActivity", COMPANION_PACKAGE),
        "--ez".to_string(),
        "START_SERVER".to_string(),
        "true".to_string(),
        "--ei".to_string(),
        "IDLE_TIMEOUT_SECONDS".to_string(),
        DEFAULT_IDLE_TIMEOUT_SECS.to_string(),
    ];
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

/// Appends the Companion accessibility service to `enabled_accessibility_services` without
/// removing other services (TalkBack, etc.).
#[command]
pub async fn enable_companion_accessibility(app: AppHandle, device: String) -> AppResult<()> {
    validate_device(&device)?;
    let get_args = vec![
        "shell".to_string(),
        "settings".to_string(),
        "get".to_string(),
        "secure".to_string(),
        "enabled_accessibility_services".to_string(),
    ];
    let out = execute_adb_with_recovery(&app, Some(&device), get_args).await?;
    if !out.status.success() {
        return Err(AppError::AdbError(format!(
            "Failed to read accessibility services: {}",
            crate::cmd_utils::format_adb_error(&out)
        )));
    }
    let current_raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let current = if current_raw.is_empty() || current_raw == "null" { String::new() } else { current_raw };

    let full_component = format!("{}/{}.service.CompanionAccessibilityService", COMPANION_PACKAGE, COMPANION_PACKAGE);
    let mut services: Vec<String> = current
        .split(':')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let already_enabled = services
        .iter()
        .any(|s| s.eq_ignore_ascii_case(ACCESSIBILITY_COMPONENT) || s.eq_ignore_ascii_case(&full_component));

    if !already_enabled {
        services.push(ACCESSIBILITY_COMPONENT.to_string());
        let new_value = services.join(":");
        // Passed as a single shell argument; quote it so ':' / '$' are never interpreted.
        let put_args = vec![
            "shell".to_string(),
            format!("settings put secure enabled_accessibility_services '{}'", new_value.replace('\'', "")),
        ];
        let put_out = execute_adb_with_recovery(&app, Some(&device), put_args).await?;
        if !put_out.status.success() {
            return Err(AppError::AdbError(format!(
                "Failed to enable accessibility service: {}",
                crate::cmd_utils::format_adb_error(&put_out)
            )));
        }
    }

    let args2 = vec![
        "shell".to_string(),
        "settings".to_string(),
        "put".to_string(),
        "secure".to_string(),
        "accessibility_enabled".to_string(),
        "1".to_string(),
    ];
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
    let permissions = [
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

    for perm in permissions {
        let args = vec![
            "shell".to_string(),
            "pm".to_string(),
            "grant".to_string(),
            COMPANION_PACKAGE.to_string(),
            perm.to_string(),
        ];
        let _ = execute_adb_with_recovery(&app, Some(&device), args).await;
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct CompanionHttpResponse {
    pub status: u16,
    pub body: String,
}

/// Generic Companion request from the webview (replaces direct `fetch('http://127.0.0.1:9876')`).
#[command]
pub async fn companion_http_request(
    app: AppHandle,
    device: String,
    method: String,
    endpoint: String,
    body: Option<String>,
) -> AppResult<CompanionHttpResponse> {
    let timeout = timeout_for_endpoint(&endpoint);
    let (status, body) = companion_request(&app, &device, &method, &endpoint, body, timeout).await?;
    Ok(CompanionHttpResponse { status, body })
}

#[command]
pub async fn fetch_companion_info(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    companion_request_ok(&app, &device, "GET", "/device-info", None, TIMEOUT_SHORT).await
}

#[command]
pub async fn fetch_companion_ui_tree(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    companion_request_ok(&app, &device, "GET", "/ui-tree", None, Duration::from_millis(2500)).await
}

#[command]
pub async fn fetch_companion_events(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    companion_request_ok(&app, &device, "GET", "/events/recent", None, TIMEOUT_SHORT).await
}

#[command]
pub async fn run_companion_standalone_checkup(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    companion_request_ok(&app, &device, "GET", "/checkup/run", None, TIMEOUT_LONG).await
}

#[command]
pub async fn generate_companion_pdf_report(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    companion_request_ok(&app, &device, "GET", "/checkup/pdf", None, TIMEOUT_LONG).await
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
    let _ = port;
    let device = require_device(device)?;
    let m = method.unwrap_or_else(|| "POST".to_string());
    let timeout = timeout_for_endpoint(&endpoint);
    companion_request_ok(&app, &device, &m, &endpoint, payload, timeout).await
}

async fn fetch_screenshot_from(app: &AppHandle, device: &str, endpoint: &str) -> AppResult<String> {
    let companion = companion_request_bytes(app, device, "GET", endpoint, None, TIMEOUT_MEDIUM).await;
    if let Ok((status, bytes)) = companion {
        if (200..300).contains(&status) && bytes.len() > 100 {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return Ok(format!("data:image/jpeg;base64,{}", b64));
        }
    }

    // Silent ADB fallback (Companion absent or bridge down)
    let args = vec!["shell".to_string(), "screencap -p | base64".to_string()];
    let output = execute_adb_with_recovery(app, Some(device), args).await?;
    if output.status.success() {
        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        let clean_b64: String = raw_stdout.chars().filter(|c| !c.is_whitespace()).collect();
        if clean_b64.len() > 100 {
            return Ok(format!("data:image/png;base64,{}", clean_b64));
        }
    }
    Err(AppError::NetworkError("Companion screenshot unavailable".into()))
}

#[command]
pub async fn fetch_companion_screenshot(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    fetch_screenshot_from(&app, &device, "/screenshot").await
}

#[command]
pub async fn fetch_companion_fast_screenshot(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    fetch_screenshot_from(&app, &device, "/screenshot/fast").await
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
    let _ = port;
    let device = require_device(device)?;
    let payload = serde_json::json!({
        "resourceId": resource_id,
        "text": text,
        "contentDescription": content_description,
        "action": action,
        "value": value
    });
    companion_request_ok(&app, &device, "POST", "/action/node-perform", Some(payload.to_string()), TIMEOUT_SHORT).await
}

#[command]
pub async fn fetch_companion_artifacts(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    companion_request_ok(&app, &device, "GET", "/sync/artifacts", None, TIMEOUT_MEDIUM).await
}

#[command]
pub async fn fetch_companion_fleet_peers(app: AppHandle, port: Option<u16>, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    companion_request_ok(&app, &device, "GET", "/fleet/peers", None, TIMEOUT_SHORT).await
}

#[command]
pub async fn push_companion_payload(app: AppHandle, port: Option<u16>, payload: String, device: Option<String>) -> AppResult<String> {
    let _ = port;
    let device = require_device(device)?;
    companion_request_ok(&app, &device, "POST", "/sync/push", Some(payload), TIMEOUT_MEDIUM).await
}

/// Live device telemetry used by device cards / fleet health. Pings first (unauthenticated)
/// so a stopped Companion server is not started just by listing devices.
pub async fn fetch_companion_device_info(app: &AppHandle, device: &str) -> Option<serde_json::Value> {
    let ping = companion_request(app, device, "GET", "/ping", None, Duration::from_millis(1500)).await.ok()?;
    if !(200..300).contains(&ping.0) {
        return None;
    }
    companion_get_json_ok(app, device, "/device/info", Duration::from_millis(2000)).await
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
    Ok(HostMetadata { hostname, os_name })
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
    let _ = port;
    let device = require_device(device)?;
    let raw = companion_request_ok(&app, &device, "GET", "/inspector/pending-snippet", None, Duration::from_millis(2000)).await;
    match raw {
        Ok(text) => match serde_json::from_str::<PendingSnippetResponse>(&text) {
            Ok(data) if data.has_snippet => Ok(data.snippet),
            _ => Ok(None),
        },
        Err(_) => Ok(None),
    }
}
