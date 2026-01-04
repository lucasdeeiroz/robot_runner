use std::process::{Command, Stdio};
use std::os::windows::process::CommandExt;
use std::sync::Mutex;
use tauri::{command, State};

// Constants
const CREATE_NO_WINDOW: u32 = 0x08000000;

// Wrapper for Tauri State management
pub struct NgrokState(pub Mutex<Option<u32>>);

#[command]
pub async fn start_ngrok(
    state: State<'_, NgrokState>,
    port: u16, 
    token: Option<String>
) -> Result<String, String> {
    // 1. Configure Auth Token if provided
    if let Some(auth_token) = &token {
        if !auth_token.is_empty() {
             let mut cmd = Command::new("ngrok");
             cmd.args(&["config", "add-authtoken", auth_token]);
             cmd.creation_flags(CREATE_NO_WINDOW);
             let _ = cmd.output().map_err(|e| format!("Failed to set authtoken: {}", e))?;
        }
    }

    // 2. Stop existing if any (using the state)
    // We can't call stop_ngrok directly easily if it requires State, 
    // so we just implement the logic inline or split logic.
    {
        let mut lock = state.0.lock().map_err(|_| "Failed to lock mutex")?;
        if let Some(pid) = *lock {
             let _ = Command::new("taskkill")
                .args(&["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
             *lock = None;
        }
    }

    // 3. Start ngrok tcp <port>
    let mut child = Command::new("ngrok")
        .args(&["tcp", &port.to_string(), "--log=stdout"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to start ngrok: {}", e))?;

    let child_id = child.id();
    {
        let mut lock = state.0.lock().map_err(|_| "Failed to lock mutex")?;
        *lock = Some(child_id);
    }

    // 4. Parse output for URL
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let reader = std::io::BufReader::new(stdout);
    use std::io::BufRead;

    let start = std::time::Instant::now();
    for line in reader.lines() {
        if start.elapsed().as_secs() > 10 {
            let _ = child.kill();
            return Err("Timed out waiting for ngrok URL".to_string());
        }

        if let Ok(l) = line {
            if let Some(idx) = l.find("url=") {
                let url = l[idx+4..].split_whitespace().next().unwrap_or("").to_string();
                if !url.is_empty() {
                     return Ok(url);
                }
            }
        }
    }

    Err("Ngrok started but no URL found".to_string())
}

#[command]
pub async fn stop_ngrok(state: State<'_, NgrokState>) -> Result<(), String> {
    let mut lock = state.0.lock().map_err(|_| "Failed to lock mutex")?;
    
    if let Some(pid) = *lock {
        let _ = Command::new("taskkill")
            .args(&["/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        *lock = None;
    }
    
    // Safety net
    let _ = Command::new("taskkill")
        .args(&["/F", "/IM", "ngrok.exe"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
        
    Ok(())
}
