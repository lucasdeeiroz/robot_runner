use crate::cmd_utils::new_tokio_command;
use crate::errors::{AppResult, AppError};
use tauri::command;
use std::process::Stdio;

#[command]
pub async fn call_claude_code_cli(
    prompt: String, 
    project_root: String, 
    token: Option<String>,
    _screenshot_path: Option<String>
) -> AppResult<String> {
    // Run: claude --output-format json --bare
    // --bare avoids loading plugins/MCPs for speed in automated calls
    #[cfg(target_os = "windows")]
    let mut command = new_tokio_command("claude.cmd");
    #[cfg(not(target_os = "windows"))]
    let mut command = new_tokio_command("claude");

    command.args(&["--output-format", "json", "--bare"]);
    
    if let Some(ref t) = token {
        let trimmed_token = t.trim();
        if !trimmed_token.is_empty() {
            command.env("CLAUDE_CODE_OAUTH_TOKEN", trimmed_token);
        }
    }
    
    if !project_root.is_empty() {
        command.current_dir(project_root);
    }

    command.stdin(Stdio::piped());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|e| AppError::ProcessError(format!("Failed to start Claude CLI: {}. Make sure 'claude' is installed and in your PATH.", e)))?;
    
    // Write prompt to stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(prompt.as_bytes()).await.map_err(|e| AppError::ProcessError(format!("Failed to write to Claude CLI stdin: {}", e)))?;
        drop(stdin); // Close stdin so Claude knows we are done
    }

    let output = child.wait_with_output().await.map_err(|e| AppError::ProcessError(format!("Failed to wait for Claude CLI: {}", e)))?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        
        let mut error_msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Claude CLI exited with error but no message was provided.".to_string()
        };

        // If it's a login error and we passed a token, mention it
        if (error_msg.contains("Not logged in") || error_msg.contains("/login")) && token.is_some() && !token.as_ref().unwrap().trim().is_empty() {
             error_msg = format!("{} (Token was provided in settings, it might be invalid or expired)", error_msg);
        }
        
        Err(AppError::ProcessError(format!("Claude CLI error: {}", error_msg)))
    }
}
