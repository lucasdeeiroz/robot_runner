use crate::cmd_utils::{new_std_command, new_tokio_command};
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{command, State};
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};

// Wrapper for Tauri State management
pub struct NgrokState(pub Mutex<Option<u32>>);

#[command]
pub async fn start_ngrok(
    state: State<'_, NgrokState>,
    port: u16,
    token: Option<String>,
) -> Result<String, String> {
    // 1. Configure Auth Token if provided
    if let Some(auth_token) = &token {
        if !auth_token.is_empty() {
            let mut cmd = new_tokio_command("ngrok");
            cmd.args(&["config", "add-authtoken", auth_token]);
            let _ = cmd
                .output()
                .await
                .map_err(|e| format!("Failed to set authtoken: {}", e))?;
        }
    }

    // 2. Stop existing if any (using the state)
    let old_pid = {
        let mut lock = state.0.lock().map_err(|_| "Failed to lock mutex")?;
        lock.take()
    };

    if let Some(pid) = old_pid {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = new_tokio_command("taskkill");
            cmd.args(&["/F", "/PID", &pid.to_string()]);
            let _ = cmd.output().await;
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = new_tokio_command("kill")
                .arg(pid.to_string())
                .output()
                .await;
        }
    }

    // 3. Start ngrok tcp <port>
    let mut child_cmd = new_tokio_command("ngrok");
    child_cmd
        .args(&["tcp", &port.to_string(), "--log=stdout"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    let mut child = child_cmd
        .spawn()
        .map_err(|e| format!("Failed to start ngrok: {}", e))?;

    let child_id = child.id().ok_or("Failed to get ngrok PID")?;
    {
        let mut lock = state.0.lock().map_err(|_| "Failed to lock mutex")?;
        *lock = Some(child_id);
    }

    // 4. Parse output for URL (Async parsing)
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let mut reader = TokioBufReader::new(stdout).lines();

    let mut output_buffer = Vec::new();
    let start = std::time::Instant::now();

    loop {
        match reader.next_line().await {
            Ok(Some(l)) => {
                if start.elapsed().as_secs() > 10 {
                    let _ = child.kill().await;
                    let debug_log = output_buffer.join("\n");
                    return Err(format!(
                        "Timed out waiting for ngrok URL. Output:\n{}",
                        debug_log
                    ));
                }

                output_buffer.push(l.clone());
                // Keep buffer size reasonable
                if output_buffer.len() > 20 {
                    output_buffer.remove(0);
                }

                if let Some(idx) = l.find("url=") {
                    let url = l[idx + 4..]
                        .split_whitespace()
                        .next()
                        .unwrap_or("")
                        .to_string();
                    if !url.is_empty() {
                        return Ok(url);
                    }
                }
            }
            Ok(None) => break,
            Err(e) => {
                let _ = child.kill().await;
                return Err(format!(
                    "Error reading ngrok output: {}. Logs:\n{}",
                    e,
                    output_buffer.join("\n")
                ));
            }
        }
    }

    let debug_log = output_buffer.join("\n");
    Err(format!(
        "Ngrok process finished without URL. Output:\n{}",
        debug_log
    ))
}

#[command]
pub async fn stop_ngrok(state: State<'_, NgrokState>) -> Result<(), String> {
    let pid = {
        let mut lock = state.0.lock().map_err(|_| "Failed to lock mutex")?;
        lock.take()
    };

    if let Some(p) = pid {
        #[cfg(target_os = "windows")]
        {
            let _ = new_tokio_command("taskkill")
                .args(&["/F", "/PID", &p.to_string()])
                .output()
                .await;
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = new_tokio_command("kill").arg(p.to_string()).output().await;
        }
    }

    // Safety net
    #[cfg(target_os = "windows")]
    {
        let _ = new_tokio_command("taskkill")
            .args(&["/F", "/IM", "ngrok.exe"])
            .output()
            .await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = new_tokio_command("pkill").arg("ngrok").output().await;
    }

    Ok(())
}

pub fn shutdown_ngrok(state: &State<'_, NgrokState>) {
    if let Ok(mut lock) = state.0.lock() {
        if let Some(pid) = lock.take() {
            #[cfg(target_os = "windows")]
            {
                let _ = new_std_command("taskkill")
                    .args(&["/F", "/PID", &pid.to_string()])
                    .output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = new_std_command("kill").arg(pid.to_string()).output();
            }
        }
    }

    // Safety net: Kill by name
    #[cfg(target_os = "windows")]
    {
        let _ = new_std_command("taskkill")
            .args(&["/F", "/IM", "ngrok.exe"])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = new_std_command("pkill").arg("ngrok").output();
    }
}
