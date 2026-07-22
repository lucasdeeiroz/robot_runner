use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use tokio::process::Command;
use walkdir::WalkDir;
use tauri::{AppHandle, Emitter};
use crate::errors::{AppResult, AppError};
use tokio::io::{AsyncBufReadExt, BufReader};
use std::process::Stdio;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvStatus {
    pub has_requirements: bool,
    pub requirements_files: Vec<String>,
    pub has_venv: bool,
    pub venv_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvInstallEvent {
    pub r#type: String, // "stdout", "stderr", "exit", "error"
    pub data: String,
}

// Emite eventos de log para o frontend (Tauri)
fn emit_env_event(app: &AppHandle, event_type: &str, data: &str) {
    let event = EnvInstallEvent {
        r#type: event_type.to_string(),
        data: data.to_string(),
    };
    let _ = app.emit("env-install-log", event);
}

#[tauri::command]
pub async fn check_environment(project_path: String) -> AppResult<EnvStatus> {
    let expanded_path = crate::cmd_utils::expand_env_vars(&project_path);
    let root = Path::new(&expanded_path);
    let mut requirements_files = Vec::new();
    
    if root.exists() {
        // Varredura de diretório (raiz e nível 1)
        for entry in WalkDir::new(root).max_depth(2).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.contains("requirements") && name.ends_with(".txt") {
                        requirements_files.push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    let venv_dir = root.join(".venv");
    let has_venv = venv_dir.exists() && venv_dir.is_dir();
    
    Ok(EnvStatus {
        has_requirements: !requirements_files.is_empty(),
        requirements_files,
        has_venv,
        venv_path: if has_venv { Some(venv_dir.to_string_lossy().to_string()) } else { None },
    })
}

#[tauri::command]
pub async fn create_venv(app: AppHandle, project_path: String) -> AppResult<bool> {
    emit_env_event(&app, "stdout", "Iniciando criação do ambiente virtual...");
    
    let expanded_path = crate::cmd_utils::expand_env_vars(&project_path);
    let root = PathBuf::from(&expanded_path);
    
    let mut cmd = Command::new("python");
    cmd.arg("-m").arg("venv").arg(".venv");
    cmd.current_dir(&root);
    
    match cmd.output().await {
        Ok(output) => {
            if output.status.success() {
                emit_env_event(&app, "stdout", "Ambiente virtual criado com sucesso.");
                Ok(true)
            } else {
                let err = String::from_utf8_lossy(&output.stderr).to_string();
                emit_env_event(&app, "stderr", &format!("Erro ao criar venv: {}", err));
                Err(AppError::StringError(format!("Falha ao criar venv: {}", err)))
            }
        }
        Err(e) => {
            emit_env_event(&app, "error", &format!("Falha ao executar python -m venv: {}", e));
            Err(AppError::StringError(format!("Falha ao executar comando: {}", e)))
        }
    }
}

pub fn get_venv_python_path(project_path: &Path) -> Option<PathBuf> {
    let venv_dir = project_path.join(".venv");
    if !venv_dir.exists() {
        return None;
    }
    
    #[cfg(target_os = "windows")]
    let python_path = venv_dir.join("Scripts").join("python.exe");
    
    #[cfg(not(target_os = "windows"))]
    let python_path = venv_dir.join("bin").join("python");
    
    if !python_path.exists() {
        return None;
    }

    // Check if robot framework is installed in this venv; if not, fall back to global python
    let mut check_cmd = std::process::Command::new(&python_path);
    check_cmd.args(&["-m", "robot", "--version"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        check_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    if let Ok(output) = check_cmd.output() {
        if output.status.success() {
            return Some(python_path);
        }
    }

    None
}

#[tauri::command]
pub async fn install_requirements(app: AppHandle, project_path: String, requirements_file: String) -> AppResult<bool> {
    emit_env_event(&app, "stdout", &format!("Iniciando instalação de dependências: {}", requirements_file));
    
    let expanded_path = crate::cmd_utils::expand_env_vars(&project_path);
    let root = PathBuf::from(&expanded_path);
    
    let python_path = match get_venv_python_path(&root) {
        Some(p) => p,
        None => {
            emit_env_event(&app, "error", "Ambiente virtual (.venv) não encontrado.");
            return Err(AppError::StringError("Ambiente virtual não encontrado. Crie o .venv primeiro.".to_string()));
        }
    };

    let mut cmd = Command::new(python_path);
    cmd.arg("-m")
       .arg("pip")
       .arg("install")
       .arg("-r")
       .arg(&requirements_file)
       .current_dir(&root)
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            emit_env_event(&app, "error", &format!("Falha ao iniciar processo pip: {}", e));
            return Err(AppError::StringError(e.to_string()));
        }
    };

    let stdout = child.stdout.take().expect("Falha ao capturar stdout");
    let stderr = child.stderr.take().expect("Falha ao capturar stderr");

    let app_clone1 = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            emit_env_event(&app_clone1, "stdout", &line);
        }
    });

    let app_clone2 = app.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            emit_env_event(&app_clone2, "stderr", &line);
        }
    });

    let _ = tokio::join!(stdout_task, stderr_task);

    match child.wait().await {
        Ok(status) => {
            if status.success() {
                emit_env_event(&app, "exit", "Instalação concluída com sucesso.");
                Ok(true)
            } else {
                emit_env_event(&app, "exit", &format!("Instalação falhou com código: {}", status));
                Err(AppError::StringError(format!("Processo pip retornou erro: {}", status)))
            }
        }
        Err(e) => {
            emit_env_event(&app, "error", &format!("Erro ao aguardar processo pip: {}", e));
            Err(AppError::StringError(e.to_string()))
        }
    }
}
