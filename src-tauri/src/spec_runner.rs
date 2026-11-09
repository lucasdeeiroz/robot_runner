use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpecFolderInfo {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub full_path: String,
    pub has_spec_md: bool,
    pub has_scenarios_md: bool,
    pub has_results_md: bool,
}

#[command]
pub async fn find_spec_directories(
    root_path: String,
    base_specs_dir: Option<String>,
) -> Result<Vec<SpecFolderInfo>, String> {
    let base_name = base_specs_dir.unwrap_or_else(|| "specs".to_string());
    let target_dir = Path::new(&root_path).join(&base_name);

    if !target_dir.exists() || !target_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut specs = Vec::new();

    let entries = fs::read_dir(&target_dir)
        .map_err(|e| format!("Failed to read specs directory '{}': {}", target_dir.display(), e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let folder_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            if folder_name.starts_with('.') {
                continue;
            }

            let has_spec = path.join("spec.md").exists();
            let has_scenarios = path.join("testes").join("cenarios-de-teste.md").exists()
                || path.join("cenarios-de-teste.md").exists();
            let has_results = path.join("testes").join("resultados.md").exists()
                || path.join("resultados.md").exists();

            specs.push(SpecFolderInfo {
                id: folder_name.clone(),
                name: folder_name.clone(),
                relative_path: format!("{}/{}", base_name, folder_name),
                full_path: path.to_string_lossy().to_string(),
                has_spec_md: has_spec,
                has_scenarios_md: has_scenarios,
                has_results_md: has_results,
            });
        }
    }

    // Sort alphabetically/numerically
    specs.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(specs)
}

#[command]
pub async fn read_spec_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read spec file '{}': {}", file_path, e))
}

#[command]
pub async fn write_spec_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory '{}': {}", parent.display(), e))?;
    }

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write spec file '{}': {}", file_path, e))
}

#[command]
pub async fn save_spec_evidence_screenshot(
    target_dir: String,
    filename: String,
    base64_data: String,
) -> Result<String, String> {
    use base64::Engine;
    let clean_base64 = base64_data
        .trim_start_matches("data:image/png;base64,")
        .trim_start_matches("data:image/jpeg;base64,");

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(clean_base64)
        .map_err(|e| format!("Failed to decode base64 screenshot: {}", e))?;

    let dir = PathBuf::from(&target_dir);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create evidence directory '{}': {}", dir.display(), e))?;

    let dest_file = dir.join(&filename);
    fs::write(&dest_file, decoded)
        .map_err(|e| format!("Failed to save evidence screenshot '{}': {}", dest_file.display(), e))?;

    Ok(dest_file.to_string_lossy().to_string())
}
