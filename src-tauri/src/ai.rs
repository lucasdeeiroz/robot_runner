use crate::errors::{AppResult, AppError};
use tauri::command;
use std::process::Stdio;

#[command]
pub async fn call_claude_code_cli(
    prompt: String, 
    project_root: String, 
    token: Option<String>,
    image_base_64: Option<String>,
    allowed_tools: Option<Vec<String>>,
    json_schema: Option<String>,
    resume_session_id: Option<String>
) -> AppResult<String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = crate::cmd_utils::new_tokio_command("cmd");
        cmd.args(&["/C", "claude.cmd"]);
        cmd
    };
    #[cfg(not(target_os = "windows"))]
    let mut command = crate::cmd_utils::new_tokio_command("claude");

    // -p is the programmatic mode
    command.arg("-p");
    command.args(&["--output-format", "json"]);

    // Feature: Allowed Tools
    if let Some(tools) = allowed_tools {
        if !tools.is_empty() {
            command.arg("--allowedTools");
            command.arg(tools.join(","));
        }
    }

    // Feature: JSON Schema for structured output
    if let Some(schema) = json_schema {
        if !schema.is_empty() {
            command.arg("--json-schema");
            command.arg(schema);
        }
    }

    // Feature: Session Continuity
    if let Some(session_id) = resume_session_id {
        if !session_id.is_empty() {
            command.arg("--resume");
            command.arg(session_id);
        }
    }

    
    // Authentication
    if let Some(ref t) = token {
        let trimmed_token = t.trim();
        if !trimmed_token.is_empty() {
            command.env("CLAUDE_CODE_OAUTH_TOKEN", trimmed_token);
            command.env("CLAUDE_CODE_TOKEN", trimmed_token);
            command.env("ANTHROPIC_OAUTH_TOKEN", trimmed_token);
            
            if !trimmed_token.starts_with("sk-ant-oat01-") {
                command.env("ANTHROPIC_API_KEY", trimmed_token);
            }
        }
    }
    
    if !project_root.is_empty() {
        command.current_dir(project_root);
    }

    command.stdin(Stdio::piped());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|e| AppError::ProcessError(format!("Failed to start Claude CLI: {}. Make sure 'claude' is installed and in your PATH.", e)))?;
    
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        
        let mut full_prompt = prompt.clone();
        if let Some(b64) = image_base_64 {
            if !b64.is_empty() {
                full_prompt = format!(
                    "{}\n\n[VISUAL CONTEXT]: The following is a base64 encoded screenshot of the current screen. Please use it for visual analysis:\n\n<screenshot_base64>\n{}\n</screenshot_base64>",
                    full_prompt,
                    b64
                );
            }
        }

        stdin.write_all(full_prompt.as_bytes()).await.map_err(|e| AppError::ProcessError(format!("Failed to write to Claude CLI stdin: {}", e)))?;
        drop(stdin);
    }

    let output = child.wait_with_output().await.map_err(|e| AppError::ProcessError(format!("Failed to wait for Claude CLI: {}", e)))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    if output.status.success() {
        Ok(stdout)
    } else {
        let mut error_msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Claude CLI exited with error but no message was provided.".to_string()
        };

        if (error_msg.contains("Not logged in") || error_msg.contains("/login")) && token.is_some() && !token.as_ref().unwrap().trim().is_empty() {
             error_msg = format!("{} (Token was provided in settings, it might be invalid or expired)", error_msg);
        }
        
        Err(AppError::ProcessError(format!("Claude CLI error: {}", error_msg)))
    }
}
