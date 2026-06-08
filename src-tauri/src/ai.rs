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

#[command]
pub async fn call_antigravity_cli(
    prompt: String,
    project_root: String,
    api_key: Option<String>,
    system_instruction: Option<String>,
    image_base_64: Option<String>,
    _json_schema: Option<String>,
    resume_session_id: Option<String>
) -> AppResult<String> {
    let mut full_prompt = String::new();
    
    // Add System Instruction if present
    if let Some(ref sys) = system_instruction {
        if !sys.is_empty() {
            full_prompt.push_str("### SYSTEM INSTRUCTION ###\n");
            full_prompt.push_str(sys);
            full_prompt.push_str("\n\n### USER QUERY ###\n");
        }
    }
    
    full_prompt.push_str(&prompt);

    if let Some(b64) = image_base_64 {
        if !b64.is_empty() {
            full_prompt = format!(
                "{}\n\n[VISUAL CONTEXT]: <screenshot_base64>\n{}\n</screenshot_base64>",
                full_prompt,
                b64
            );
        }
    }

    #[cfg(target_os = "windows")]
    let mut command = crate::cmd_utils::new_tokio_command("agy");
    #[cfg(not(target_os = "windows"))]
    let mut command = crate::cmd_utils::new_tokio_command("agy");

    // Headless/Programmatic mode
    command.arg("--print");
    command.arg(&full_prompt);
    command.arg("--dangerously-skip-permissions");

    // Session Continuity
    if let Some(ref session_id) = resume_session_id {
        if !session_id.is_empty() {
            command.arg("--conversation");
            command.arg(session_id);
        }
    }

    // Authentication
    if let Some(ref key) = api_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            command.env("GEMINI_API_KEY", trimmed);
            command.env("ANTIGRAVITY_API_KEY", trimmed);
        }
    }

    if !project_root.is_empty() {
        command.current_dir(&project_root);
    }

    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let child = command.spawn().map_err(|e| AppError::ProcessError(format!("Failed to start Antigravity CLI: {}. Make sure 'agy' is installed and in your PATH.", e)))?;

    let output = child.wait_with_output().await.map_err(|e| AppError::ProcessError(format!("Failed to wait for Antigravity CLI: {}", e)))?;
    
    let mut stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Fallback: If stdout is empty but execution succeeded, try to read the latest response from the SQLite conversation DB.
    if output.status.success() && stdout.trim().is_empty() {
        if let Some(user_profile) = std::env::var_os("USERPROFILE") {
            let user_profile_str = user_profile.to_string_lossy();
            let conversations_dir = std::path::Path::new(&*user_profile_str)
                .join(".gemini")
                .join("antigravity-cli")
                .join("conversations");
            
            if conversations_dir.exists() {
                // Find either the database specified by resume_session_id or the most recently modified .db file
                let mut target_db_path = None;
                if let Some(ref session_id) = resume_session_id {
                    let specific_db = conversations_dir.join(format!("{}.db", session_id));
                    if specific_db.exists() {
                        target_db_path = Some(specific_db);
                    }
                }

                if target_db_path.is_none() {
                    // Fall back to finding the most recently modified .db file in the directory
                    if let Ok(entries) = std::fs::read_dir(&conversations_dir) {
                        let mut db_files: Vec<_> = entries
                            .filter_map(|e| e.ok())
                            .filter(|e| e.path().extension().map_or(false, |ext| ext == "db"))
                            .collect();
                        
                        db_files.sort_by(|a, b| {
                            let a_metadata = a.metadata().ok();
                            let b_metadata = b.metadata().ok();
                            let a_time = a_metadata.and_then(|m| m.modified().ok());
                            let b_time = b_metadata.and_then(|m| m.modified().ok());
                            b_time.cmp(&a_time) // Descending order (newest first)
                        });

                        if let Some(newest_db) = db_files.first() {
                            target_db_path = Some(newest_db.path());
                        }
                    }
                }

                if let Some(ref db_path) = target_db_path {
                    if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                        // Retrieve the latest step payload (BLOB)
                        let stmt_res = conn.prepare("SELECT idx, step_payload FROM steps ORDER BY idx DESC LIMIT 1");
                        if let Ok(mut stmt) = stmt_res {
                            let step_query = stmt.query_row([], |row| {
                                let idx: i32 = row.get(0)?;
                                let payload: Vec<u8> = row.get(1)?;
                                Ok((idx, payload))
                            });

                            if let Ok((_idx, payload)) = step_query {
                                // Extract the JSON/text content from the protobuf-like binary step_payload.
                                // We scan the binary blob to find the JSON structure corresponding to the model response.
                                // The model response JSON is a standalone '{ ... }' block. We find the first '{',
                                // then find its matching closing '}' by tracking the brace nesting depth.
                                if let Some(fb) = payload.iter().position(|&b| b == b'{') {
                                    let mut depth = 0;
                                    let mut matched_end = None;
                                    for (i, &b) in payload.iter().enumerate().skip(fb) {
                                        if b == b'{' {
                                            depth += 1;
                                        } else if b == b'}' {
                                            depth -= 1;
                                            if depth == 0 {
                                                matched_end = Some(i);
                                                break;
                                            }
                                        }
                                    }

                                    if let Some(lb) = matched_end {
                                        let json_slice = &payload[fb..=lb];
                                        let json_str = String::from_utf8_lossy(json_slice).into_owned();
                                        
                                        // Try parsing it as JSON first to avoid double serialization
                                        let response_val: serde_json::Value = serde_json::from_str(&json_str).unwrap_or(serde_json::Value::String(json_str));
                                        
                                        // Wrap it in the format the frontend expects: { "response": <extracted_json>, "session_id": "<uuid>" }
                                        let db_file_name = db_path.file_stem()
                                            .map(|s| s.to_string_lossy().to_string())
                                            .unwrap_or_default();
                                        
                                        let wrapper = serde_json::json!({
                                            "response": response_val,
                                            "session_id": db_file_name
                                        });
                                        stdout = wrapper.to_string();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    if output.status.success() {
        Ok(stdout)
    } else {
        let error_msg = if !stderr.is_empty() { stderr } else if !stdout.is_empty() { stdout } else { "Antigravity CLI exited with error but no message was provided.".to_string().into() };
        Err(AppError::ProcessError(format!("Antigravity CLI error: {}", error_msg)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_antigravity_cli_exec() {
        unsafe { std::env::set_var("USERNAME", "lucas"); }
        
        let encrypted_key = "1uk+e9L+fRzvXZZ4U66ZDyLzwD0TNX10eL28JOCr8FsHrHXoOKy94/A8kcLN8VDE6kl1X2IR4rJaEzAPyoWP1MVxCA==".to_string();
        let decrypted = crate::security::decrypt_secret(encrypted_key).await.unwrap();
        println!("Decrypted key length: {}", decrypted.len());
        
        let mut command = std::process::Command::new("agy");
        command.arg("--print");
        command.arg("Respond with exactly the word SUCCESS.");
        command.arg("--dangerously-skip-permissions");
        command.env("GEMINI_API_KEY", &decrypted);
        command.env("ANTIGRAVITY_API_KEY", &decrypted);
        
        let output = command.output().unwrap();
        println!("Test Status: {:?}", output.status);
        println!("Test Stdout: {:?}", String::from_utf8_lossy(&output.stdout));
        println!("Test Stderr: {:?}", String::from_utf8_lossy(&output.stderr));
        assert!(false); // Force failure to view captured stdout/stderr
    }
}
