use crate::cmd_utils::new_std_command;
use serde::Serialize;

#[derive(Serialize)]
pub struct GitStatusEntry {
    pub file_path: String,
    pub status: String, // "untracked" | "modified" | "staged" | "deleted"
}

#[tauri::command]
pub async fn get_git_status(repo_path: String) -> Result<Vec<GitStatusEntry>, String> {
    let mut cmd = new_std_command("git");
    cmd.arg("status").arg("--porcelain").current_dir(&repo_path);

    let output = cmd.output().map_err(|e| format!("Failed to execute git status: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Git status failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let prefix = &line[0..2];
        let file_path = line[3..].trim().trim_matches('"').to_string();

        let status = if prefix == "??" {
            "untracked"
        } else if prefix.starts_with('M') || prefix.starts_with('A') || prefix.starts_with('R') {
            if prefix.ends_with('M') {
                "modified"
            } else {
                "staged"
            }
        } else if prefix.ends_with('M') {
            "modified"
        } else if prefix.starts_with('D') || prefix.ends_with('D') {
            "deleted"
        } else {
            "modified"
        };

        entries.push(GitStatusEntry { file_path, status: status.to_string() });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn git_stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    let mut cmd = new_std_command("git");
    cmd.arg("add").arg(&file_path).current_dir(&repo_path);

    let output = cmd.output().map_err(|e| format!("Failed to execute git add: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Git add failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<(), String> {
    let mut cmd = new_std_command("git");
    cmd.arg("commit").arg("-m").arg(&message).current_dir(&repo_path);

    let output = cmd.output().map_err(|e| format!("Failed to execute git commit: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Git commit failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub async fn git_push(repo_path: String) -> Result<(), String> {
    let mut cmd = new_std_command("git");
    cmd.arg("push").current_dir(&repo_path);

    let output = cmd.output().map_err(|e| format!("Failed to execute git push: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Git push failed: {}", stderr));
    }

    Ok(())
}
