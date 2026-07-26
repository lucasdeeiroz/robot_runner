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
        let mut c = crate::cmd_utils::new_tokio_command("cmd");
        c.arg("/c").arg("claude");
        c
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
        let expanded = crate::cmd_utils::expand_env_vars(&project_root);
        let path = std::path::Path::new(&expanded);
        if path.exists() && path.is_dir() {
            command.current_dir(expanded);
        }
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
    
    let trimmed_stdout = stdout.trim();
    let is_stdout_json = !trimmed_stdout.is_empty() && (
        trimmed_stdout.contains("\"reply\"") || 
        trimmed_stdout.contains("\"actions\"") || 
        trimmed_stdout.contains("\"result\"") || 
        trimmed_stdout.contains("\"type\"") ||
        (trimmed_stdout.starts_with('{') && trimmed_stdout.ends_with('}'))
    );

    if output.status.success() || is_stdout_json {
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

fn read_varint(buffer: &[u8], mut offset: usize) -> Option<(u64, usize)> {
    let mut result = 0u64;
    let mut shift = 0;
    while offset < buffer.len() {
        let b = buffer[offset];
        offset += 1;
        result |= ((b & 0x7F) as u64) << shift;
        if (b & 0x80) == 0 {
            return Some((result, offset));
        }
        shift += 7;
        if shift >= 64 {
            return None; // Varint too long
        }
    }
    None
}

fn find_field_bytes(buffer: &[u8], target_field: u32) -> Option<Vec<u8>> {
    let mut pos = 0;
    while pos < buffer.len() {
        let (tag, bytes_read) = read_varint(buffer, pos)?;
        pos = bytes_read;

        let wire_type = tag & 0x7;
        let field_num = (tag >> 3) as u32;

        if wire_type == 2 { // length-delimited
            let (len, bytes_read_len) = read_varint(buffer, pos)?;
            pos = bytes_read_len;
            let len = len as usize;

            if pos + len <= buffer.len() {
                let slice = &buffer[pos..(pos + len)];
                if field_num == target_field {
                    return Some(slice.to_vec());
                }
                pos += len;
            } else {
                break;
            }
        } else if wire_type == 0 { // varint
            let (_, bytes_read_var) = read_varint(buffer, pos)?;
            pos = bytes_read_var;
        } else if wire_type == 1 { // 64-bit
            pos += 8;
        } else if wire_type == 5 { // 32-bit
            pos += 4;
        } else {
            break;
        }
    }
    None
}

fn extract_protobuf_response(payload: &[u8], fallback_session_id: &str) -> Option<(String, String)> {
    // Try field 30 -> 4 first (final response in type 23 steps)
    if let Some(submessage_30) = find_field_bytes(payload, 30) {
        if let Some(response_text) = find_field_bytes(&submessage_30, 4) {
            if let Ok(text_str) = String::from_utf8(response_text) {
                if !text_str.trim().is_empty() {
                    return Some((text_str, fallback_session_id.to_string()));
                }
            }
        }
    }

    // Try field 20 -> 1 or 8 (reasoning/response in type 15 steps)
    if let Some(submessage_20) = find_field_bytes(payload, 20) {
        if let Some(response_text) = find_field_bytes(&submessage_20, 1)
            .or_else(|| find_field_bytes(&submessage_20, 8))
        {
            if let Ok(text_str) = String::from_utf8(response_text) {
                let session_id_str = find_field_bytes(&submessage_20, 6)
                    .and_then(|b| String::from_utf8(b).ok())
                    .unwrap_or_else(|| fallback_session_id.to_string());
                
                if !text_str.trim().is_empty() {
                    return Some((text_str, session_id_str));
                }
            }
        }
    }

    None
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
            use base64::Engine;
            let temp_dir = std::env::temp_dir();
            let timestamp = chrono::Local::now().timestamp_micros();
            let file_name = format!("agy_screenshot_{}.png", timestamp);
            let file_path = temp_dir.join(file_name);
            
            if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
                if std::fs::write(&file_path, decoded).is_ok() {
                    full_prompt = format!(
                        "{}\n\n[VISUAL CONTEXT]: The screenshot of the current screen/state is saved at: {}\nIf you need to analyze it, you can view this file using your tools.",
                        full_prompt,
                        file_path.to_string_lossy()
                    );
                }
            }
        }
    }

    // Windows cmd.exe has a hard limit of 8191 characters for command line arguments.
    // Since 'agy' is a .cmd script on Windows, any prompt exceeding this limit will cause 'os error 206'.
    // We bypass this by writing large prompts to a temporary file and asking the CLI to read it.
    let prompt_to_pass = if full_prompt.len() > 7500 {
        let temp_dir = std::env::temp_dir();
        let timestamp = chrono::Local::now().timestamp_micros();
        let file_name = format!("agy_prompt_{}.txt", timestamp);
        let file_path = temp_dir.join(file_name);
        
        match std::fs::write(&file_path, &full_prompt) {
            Ok(_) => {
                format!(
                    "Read the text file at '{}' using your file reading tools. It contains the system instructions and the user query you must execute. Respond directly with the requested output format and nothing else.",
                    file_path.to_string_lossy()
                )
            },
            Err(_) => full_prompt // fallback
        }
    } else {
        full_prompt
    };

    #[cfg(target_os = "windows")]
    let mut command = crate::cmd_utils::new_tokio_command("agy");
    #[cfg(not(target_os = "windows"))]
    let mut command = crate::cmd_utils::new_tokio_command("agy");

    // Headless/Programmatic mode
    command.arg("--print");
    command.arg(&prompt_to_pass);
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
        let expanded = crate::cmd_utils::expand_env_vars(&project_root);
        command.current_dir(&expanded);
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
                    let db_file_name = db_path.file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();

                    if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                        let stmt_res = conn.prepare("SELECT idx, step_payload FROM steps ORDER BY idx DESC");
                        if let Ok(mut stmt) = stmt_res {
                            if let Ok(mut rows) = stmt.query([]) {
                                while let Ok(Some(row)) = rows.next() {
                                    let payload_res = row.get::<_, Vec<u8>>(1);

                                    if let Ok(payload) = payload_res {
                                        // 1. Try Protobuf extraction
                                        if let Some((text_str, session_id_str)) = extract_protobuf_response(&payload, &db_file_name) {
                                            let response_json = serde_json::from_str::<serde_json::Value>(&text_str)
                                                .unwrap_or_else(|_| serde_json::Value::String(text_str));
                                            stdout = serde_json::json!({
                                                "response": response_json,
                                                "session_id": session_id_str
                                            }).to_string();
                                            break;
                                        }

                                        // 2. Try Balanced Braces scan fallback on this payload
                                        let mut best_json: Option<serde_json::Value> = None;
                                        let mut best_len: usize = 0;
                                        let mut search_start = 0;

                                        while let Some(rel_pos) = payload[search_start..].iter().position(|&b| b == b'{') {
                                            let fb = search_start + rel_pos;
                                            let mut depth: i32 = 0;
                                            let mut matched_end = None;

                                            for (i, &b) in payload.iter().enumerate().skip(fb) {
                                                match b {
                                                    b'{' => depth += 1,
                                                    b'}' => {
                                                        depth -= 1;
                                                        if depth == 0 {
                                                            matched_end = Some(i);
                                                            break;
                                                        }
                                                    }
                                                    _ => {}
                                                }
                                            }

                                            if let Some(lb) = matched_end {
                                                let candidate = &payload[fb..=lb];
                                                let mut parsed_ok = false;
                                                if let Ok(candidate_str) = std::str::from_utf8(candidate) {
                                                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(candidate_str) {
                                                        let candidate_len = lb - fb + 1;
                                                        if candidate_len > best_len {
                                                            best_len = candidate_len;
                                                            best_json = Some(parsed);
                                                        }
                                                        parsed_ok = true;
                                                    }
                                                }
                                                if parsed_ok {
                                                    search_start = lb + 1;
                                                } else {
                                                    search_start = fb + 1;
                                                }
                                            } else {
                                                search_start = fb + 1;
                                            }

                                            if search_start >= payload.len() {
                                                break;
                                            }
                                        }

                                        if let Some(response_val) = best_json {
                                            stdout = serde_json::json!({
                                                "response": response_val,
                                                "session_id": db_file_name
                                            }).to_string();
                                            break;
                                        }
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
