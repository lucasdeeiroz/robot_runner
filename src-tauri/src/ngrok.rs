use tauri::{command, State};
use std::process::{Command, Stdio, Child};
use std::sync::Mutex;
use std::io::{BufRead, BufReader};
use std::time::Duration;
use regex::Regex;
use std::thread;

pub struct NgrokState(pub Mutex<Option<Child>>);

#[command]
pub fn start_ngrok(state: State<'_, NgrokState>, port: u16, token: Option<String>) -> Result<String, String> {
    let mut state_lock = state.0.lock().map_err(|e| e.to_string())?;
    
    // Stop existing if any
    if let Some(mut child) = state_lock.take() {
        let _ = child.kill();
    }

    let mut cmd = Command::new("ngrok");
    cmd.arg("http").arg(port.to_string()).arg("--log=stdout");
    
    if let Some(t) = token {
        if !t.trim().is_empty() {
            cmd.arg("--authtoken").arg(t);
        }
    }

    // Windows: Create No Window
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); 
    }

    let mut child = cmd.stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start ngrok: {}. Make sure 'ngrok' is in PATH.", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    
    // Spawn thread to read URL? Or read blocking for a few seconds?
    // We need to return the URL. So we wait.
    
    let (tx, rx) = std::sync::mpsc::channel();
    
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let re = Regex::new(r"url=(https?://[^ ]+)").unwrap();
        
        for line in reader.lines() {
            if let Ok(l) = line {
                if let Some(caps) = re.captures(&l) {
                    if let Some(url) = caps.get(1) {
                        let _ = tx.send(url.as_str().to_string());
                        break;
                    }
                }
            } else {
                break;
            }
        }
    });

    // Wait for URL (timeout 10s)
    let url = rx.recv_timeout(Duration::from_secs(10))
        .map_err(|_| {
            let _ = child.kill(); // Kill if timeout
            "Timeout waiting for Ngrok URL. Check your token or network.".to_string()
        })?;

    *state_lock = Some(child);

    Ok(url)
}

#[command]
pub fn stop_ngrok(state: State<'_, NgrokState>) -> Result<(), String> {
    let mut state_lock = state.0.lock().map_err(|e| e.to_string())?;
    
    if let Some(mut child) = state_lock.take() {
        let _ = child.kill();
        Ok(())
    } else {
        Ok(()) // Already stopped
    }
}
