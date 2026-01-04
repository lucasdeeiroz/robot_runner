use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::sync::Mutex;
use tauri::{command, State};

// Constants
#[cfg(target_os = "windows")]
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
             #[cfg(target_os = "windows")]
             cmd.creation_flags(CREATE_NO_WINDOW);
             let _ = cmd.output().map_err(|e| format!("Failed to set authtoken: {}", e))?;
        }
    }

    // 2. Stop existing if any (using the state)
    {
        let mut lock = state.0.lock().map_err(|_| "Failed to lock mutex")?;
        if let Some(pid) = *lock {
             #[cfg(target_os = "windows")]
             {
                let mut cmd = Command::new("taskkill");
                cmd.args(&["/F", "/PID", &pid.to_string()]);
                cmd.creation_flags(CREATE_NO_WINDOW);
                let _ = cmd.output();
             }
             #[cfg(not(target_os = "windows"))]
             {
                let _ = Command::new("kill")
                    .arg(pid.to_string())
                    .output();
             }
             *lock = None;
        }
    }

    // 3. Start ngrok tcp <port>
    let mut child_cmd = Command::new("ngrok");
    child_cmd.args(&["tcp", &port.to_string(), "--log=stdout"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    #[cfg(target_os = "windows")]
    child_cmd.creation_flags(CREATE_NO_WINDOW);
    
    let mut child = child_cmd.spawn()
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
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(&["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
        #[cfg(not(target_os = "windows"))]
        {
             let _ = Command::new("kill")
                .arg(pid.to_string())
                .output();
        }
        *lock = None;
    }
    
    // Safety net
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(&["/F", "/IM", "ngrok.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("pkill")
            .arg("ngrok")
            .output();
    }
        
    Ok(())
}
