use crate::db::LogDb;
use crate::files::read_file_tail_internal;
use ignore::WalkBuilder;
use roxmltree;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use tauri::Manager;


#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub enum AiContextType {
    HistoryAnalysis,
    Exploration,
    ArtifactGeneration,
    FlowchartLayout,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AiContextParams {
    pub run_id: Option<String>,
    pub db_path: Option<String>,
    pub log_paths: Option<Vec<String>>,
    pub profile_id: Option<String>,
    pub current_xml: Option<String>,
    pub current_screenshot: Option<String>,
    pub failures_limit: Option<usize>,
    pub automation_root: Option<String>,
    pub custom_mappings_dir: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct AiContextResponse {
    pub context: String,
    pub metadata: serde_json::Value,
}

#[tauri::command]
pub async fn get_ai_context(
    app_handle: tauri::AppHandle,
    context_type: AiContextType,
    params: AiContextParams,
) -> Result<AiContextResponse, String> {
    match context_type {
        AiContextType::HistoryAnalysis => get_history_analysis_context(params),
        AiContextType::Exploration => get_exploration_context(params),
        AiContextType::ArtifactGeneration => get_artifact_generation_context(app_handle, params),
        AiContextType::FlowchartLayout => get_flowchart_layout_context(app_handle, params),
    }
}

fn get_history_analysis_context(params: AiContextParams) -> Result<AiContextResponse, String> {
    let db_path = params.db_path.ok_or("Missing db_path")?;
    let db_path = crate::cmd_utils::expand_env_vars(&db_path);
    let db = LogDb::new(&db_path).map_err(|e| e.to_string())?;

    let limit = params.failures_limit.unwrap_or(20);
    let mut failures = db.get_failures().map_err(|e| e.to_string())?;

    if failures.len() > limit {
        failures.truncate(limit);
    }

    let mut context = String::new();
    context.push_str("### FAILURE ANALYSIS CONTEXT\n\n");

    if failures.is_empty() {
        context.push_str("No failures found in the database.\n");
    } else {
        for (i, fail_json) in failures.iter().enumerate() {
            context.push_str(&format!("--- FAILURE {} ---\n", i + 1));

            // Token Optimization: Strip massive UI hierarchies or excessive raw logs
            if let Ok(mut parsed) = serde_json::from_str::<serde_json::Value>(fail_json) {
                if let Some(obj) = parsed.as_object_mut() {
                    obj.remove("children");
                    // Keep only the last 3 log messages to reduce token usage
                    if let Some(logs) = obj.get_mut("logs") {
                        if let Some(arr) = logs.as_array_mut() {
                            if arr.len() > 3 {
                                let start = arr.len() - 3;
                                *arr = arr[start..].to_vec();
                            }
                        }
                    }
                    // STRIP only if it looks like base64 data to save tokens, keep if it's a file path
                    if let Some(fail_detail) = obj.get_mut("failureDetail") {
                        if let Some(fd_obj) = fail_detail.as_object_mut() {
                            if let Some(val) = fd_obj.get("screenshotPath").and_then(|v| v.as_str()) {
                                if val.starts_with("data:") || val.len() > 1024 {
                                    fd_obj.remove("screenshotPath");
                                }
                            }
                            if let Some(val) = fd_obj.get("screenshot_path").and_then(|v| v.as_str()) {
                                if val.starts_with("data:") || val.len() > 1024 {
                                    fd_obj.remove("screenshot_path");
                                }
                            }
                        }
                    }
                    if let Some(fail_detail) = obj.get_mut("failure_detail") {
                        if let Some(fd_obj) = fail_detail.as_object_mut() {
                            if let Some(val) = fd_obj.get("screenshotPath").and_then(|v| v.as_str()) {
                                if val.starts_with("data:") || val.len() > 1024 {
                                    fd_obj.remove("screenshotPath");
                                }
                            }
                            if let Some(val) = fd_obj.get("screenshot_path").and_then(|v| v.as_str()) {
                                if val.starts_with("data:") || val.len() > 1024 {
                                    fd_obj.remove("screenshot_path");
                                }
                            }
                        }
                    }
                }
                context.push_str(&parsed.to_string());
            } else {
                context.push_str(fail_json);
            }
            context.push_str("\n\n");
        }
    }

    // Read performance CSVs if directory exists
    if let Some(db_p) = Path::new(&db_path).parent() {
        if let Ok(entries) = fs::read_dir(db_p) {
            context.push_str("### PERFORMANCE CONTEXT\n\n");
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("csv") {
                    if let Ok(tail) = read_file_tail_internal(&path.to_string_lossy(), 10000) {
                        context.push_str(&format!(
                            "Performance Data ({}):\n{}\n\n",
                            path.file_name().unwrap().to_string_lossy(),
                            tail
                        ));
                    }
                }
            }
        }
    }

    // Read relevant logs if available (e.g. system traces), but SKIP heavy XML or HTML files
    if let Some(log_paths) = params.log_paths {
        context.push_str("### SYSTEM LOGS (TAIL)\n\n");
        let mut log_count = 0;
        for path in log_paths {
            let path = crate::cmd_utils::expand_env_vars(&path);
            let extension = Path::new(&path)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            if extension == "xml" || extension == "html" {
                continue; // Skip execution artifacts that are already covered by DB or don't add value
            }
            if let Ok(tail) = read_file_tail_internal(&path, 5000) {
                // Limit to 5KB per extra log
                context.push_str(&format!(
                    "--- Log: {} ---\n",
                    Path::new(&path)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                ));
                context.push_str(&tail);
                context.push_str("\n\n");
                log_count += 1;
                // Only take traces from the first 3 relevant logs globally to avoid prompt explosion
                if log_count >= 3 {
                    break;
                }
            }
        }
    }

    let first_screenshot = failures.iter().find_map(|f| {
        let parsed: serde_json::Value = serde_json::from_str(f).ok()?;
        // Check multiple possible keys for screenshot path
        parsed.get("failureDetail")
            .and_then(|fd| fd.get("screenshotPath"))
            .and_then(|s| s.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                parsed.get("failure_detail")
                    .and_then(|fd| fd.get("screenshot_path"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string())
            })
            .or_else(|| {
                parsed.get("screenshotPath")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string())
            })
    });

    if let Some(root) = params.automation_root {
        let expanded = crate::cmd_utils::expand_env_vars(&root);
        append_project_index(&mut context, &expanded);
    }

    Ok(AiContextResponse {
        context,
        metadata: serde_json::json!({ 
            "failure_count": failures.len(),
            "first_screenshot": first_screenshot
        }),
    })
}

fn get_exploration_context(params: AiContextParams) -> Result<AiContextResponse, String> {
    let mut context = String::new();
    let mut metadata = serde_json::json!({});

    if let Some(xml) = params.current_xml {
        context.push_str("### UI HIERARCHY (Simplified XML)\n\n");
        let doc = roxmltree::Document::parse(&xml).map_err(|e| e.to_string())?;

        let mut simplified = String::new();
        simplified.push_str("<hierarchy>\n");

        let mut short_id_map = serde_json::Map::new();
        let mut count = 0;

        for node in doc.descendants() {
            if node.is_element() {
                let tag = node.tag_name().name();
                let clickable = node.attribute("clickable") == Some("true")
                    || node.attribute("long-clickable") == Some("true");
                let has_text = node.attribute("text").map_or(false, |t| !t.trim().is_empty());
                let has_desc = node.attribute("content-desc").map_or(false, |d| !d.trim().is_empty());
                let scrollable = node.attribute("scrollable") == Some("true");
                let checkable = node.attribute("checkable") == Some("true");

                if clickable || has_text || has_desc || scrollable || checkable || tag == "hierarchy" {
                    count += 1;
                    let short_id = format!("e{}", count);
                    let xpath = generate_basic_xpath(&node);
                    short_id_map.insert(short_id.clone(), serde_json::json!(xpath));

                    let text = node.attribute("text").unwrap_or("");
                    let desc = node.attribute("content-desc").unwrap_or("");
                    let resource_id = node
                        .attribute("resource-id")
                        .unwrap_or("")
                        .split('/')
                        .last()
                        .unwrap_or("");
                    let bounds = node.attribute("bounds").unwrap_or("");

                    let mut attrs = format!("id=\"{}\"", short_id);
                    if !resource_id.is_empty() {
                        attrs.push_str(&format!(" res=\"{}\"", escape_xml_attr(resource_id)));
                    }
                    if !text.is_empty() {
                        attrs.push_str(&format!(" text=\"{}\"", escape_xml_attr(text)));
                    }
                    if !desc.is_empty() {
                        attrs.push_str(&format!(" desc=\"{}\"", escape_xml_attr(desc)));
                    }
                    if clickable {
                        attrs.push_str(" clickable=\"true\"");
                    }
                    if scrollable {
                        attrs.push_str(" scrollable=\"true\"");
                    }
                    if checkable {
                        attrs.push_str(" checkable=\"true\"");
                    }
                    if node.attribute("checked") == Some("true") {
                        attrs.push_str(" checked=\"true\"");
                    }
                    if node.attribute("selected") == Some("true") {
                        attrs.push_str(" selected=\"true\"");
                    }
                    if !bounds.is_empty() {
                        attrs.push_str(&format!(" bounds=\"{}\"", escape_xml_attr(bounds)));
                    }

                    simplified.push_str(&format!("  <{tag} {attrs} />\n"));
                }
            }
        }
        simplified.push_str("</hierarchy>");
        context.push_str(&simplified);

        metadata = serde_json::json!({
            "has_xml": true,
            "element_count": count,
            "short_id_map": short_id_map
        });
    }

    // Automation Context: Inject file index to help the IA explore if it needs files
    if let Some(root) = params.automation_root {
        let expanded = crate::cmd_utils::expand_env_vars(&root);
        append_project_index(&mut context, &expanded);
    }

    Ok(AiContextResponse { context, metadata })
}

fn generate_basic_xpath(node: &roxmltree::Node) -> String {
    let mut path = Vec::new();
    let mut current = *node;

    while let Some(parent) = current.parent() {
        if parent.is_root() {
            break;
        }

        let tag = current.tag_name().name();

        // Find index among siblings with same tag
        let mut index = 1;
        for sibling in parent.children() {
            if sibling == current {
                break;
            }
            if sibling.is_element() && sibling.tag_name().name() == tag {
                index += 1;
            }
        }
        path.push(format!("{}[{}]", tag, index));
        current = parent;
    }

    path.reverse();
    format!("/{}", path.join("/"))
}

fn escape_xml_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn get_artifact_generation_context(
    app_handle: tauri::AppHandle,
    params: AiContextParams,
) -> Result<AiContextResponse, String> {
    let profile_id = params.profile_id.ok_or("Missing profile_id")?;

    // Resolve base path for screen maps
    let maps_path = if let Some(ref custom_dir) = params.custom_mappings_dir {
        if !custom_dir.trim().is_empty() {
            let expanded = crate::cmd_utils::expand_env_vars(custom_dir);
            Path::new(&expanded).to_path_buf()
        } else {
            let base_path = app_handle
                .path()
                .app_local_data_dir()
                .map_err(|e| e.to_string())?;
            base_path.join("maps").join(&profile_id).join("screens")
        }
    } else {
        let base_path = app_handle
            .path()
            .app_local_data_dir()
            .map_err(|e| e.to_string())?;
        base_path.join("maps").join(&profile_id).join("screens")
    };

    // Check if directory exists
    if !maps_path.exists() {
        return Ok(AiContextResponse {
            context: "No application mapping found for this profile.".to_string(),
            metadata: serde_json::json!({ "screen_count": 0, "profile_id": profile_id }),
        });
    }

    let mut context = String::new();
    context.push_str("### APPLICATION MAPPING CONTEXT\n\n");

    let entries = fs::read_dir(maps_path).map_err(|e| e.to_string())?;
    let mut screen_count = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            let filename = path.file_name().unwrap_or_default().to_string_lossy();
            if filename == "flowchart_layout.json" {
                continue;
            }

            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                screen_count += 1;
                let screen_name = val
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Screen");
                let screen_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("screen");
                let screen_desc = val
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                context.push_str(&format!(
                    "- Screen: \"{}\" ({})\n",
                    screen_name, screen_type
                ));
                if !screen_desc.is_empty() {
                    context.push_str(&format!("  Description: {}\n", screen_desc));
                }

                if let Some(elements) = val.get("elements").and_then(|v| v.as_array()) {
                    let mut found_elements = false;
                    for el in elements {
                        let el_name = el
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unnamed Element");
                        // Only include potentially meaningful elements for artifact generation
                        let el_type = el.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");

                        if !found_elements {
                            context.push_str("  Elements:\n");
                            found_elements = true;
                        }

                        let mut el_info = format!("    · {} [{}]", el_name, el_type);

                        // Check for navigation (simplified)
                        if let Some(nav) = el.get("navigates_to") {
                            if let Some(dest) = nav.get("destination").and_then(|v| v.as_str()) {
                                if !dest.is_empty() {
                                    el_info.push_str(&format!(" → {}", dest));
                                }
                            } else if let Some(arr) = nav.as_array() {
                                let destinations: Vec<&str> = arr
                                    .iter()
                                    .filter_map(|n| n.get("destination").and_then(|v| v.as_str()))
                                    .filter(|d| !d.is_empty())
                                    .collect();
                                if !destinations.is_empty() {
                                    el_info.push_str(&format!(" → {}", destinations.join(", ")));
                                }
                            }
                        }
                        context.push_str(&el_info);
                        context.push_str("\n");
                    }
                }
                context.push_str("\n");
            }
        }
    }

    if screen_count == 0 {
        context.push_str("No screens mapped yet for this profile.\n");
    }

    Ok(AiContextResponse {
        context,
        metadata: serde_json::json!({ "screen_count": screen_count, "profile_id": profile_id }),
    })
}

fn get_flowchart_layout_context(
    app_handle: tauri::AppHandle,
    params: AiContextParams,
) -> Result<AiContextResponse, String> {
    let profile_id = params.profile_id.ok_or("Missing profile_id")?;

    // Resolve base path for screen maps
    let maps_path = if let Some(ref custom_dir) = params.custom_mappings_dir {
        if !custom_dir.trim().is_empty() {
            let expanded = crate::cmd_utils::expand_env_vars(custom_dir);
            Path::new(&expanded).to_path_buf()
        } else {
            let base_path = app_handle
                .path()
                .app_local_data_dir()
                .map_err(|e| e.to_string())?;
            base_path.join("maps").join(&profile_id).join("screens")
        }
    } else {
        let base_path = app_handle
            .path()
            .app_local_data_dir()
            .map_err(|e| e.to_string())?;
        base_path.join("maps").join(&profile_id).join("screens")
    };

    // Check if directory exists
    if !maps_path.exists() {
        return Ok(AiContextResponse {
            context: "No application mapping found for this profile.".to_string(),
            metadata: serde_json::json!({ "screen_count": 0, "profile_id": profile_id }),
        });
    }

    let mut context = String::new();
    context.push_str("### APPLICATION NAVIGATION GRAPH\n\n");

    let entries = fs::read_dir(maps_path).map_err(|e| e.to_string())?;
    let mut screen_count = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            let filename = path.file_name().unwrap_or_default().to_string_lossy();
            if filename == "flowchart_layout.json" {
                continue;
            }

            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                screen_count += 1;
                let screen_name = val
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Screen");
                let screen_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("screen");

                context.push_str(&format!(
                    "- Screen: \"{}\" ({})\n",
                    screen_name, screen_type
                ));

                let mut destinations = Vec::new();
                if let Some(elements) = val.get("elements").and_then(|v| v.as_array()) {
                    for el in elements {
                        if let Some(nav) = el.get("navigates_to") {
                            if let Some(dest) = nav.get("destination").and_then(|v| v.as_str()) {
                                if !dest.is_empty() && !destinations.contains(&dest.to_string()) {
                                    destinations.push(dest.to_string());
                                }
                            } else if let Some(arr) = nav.as_array() {
                                for n in arr {
                                    if let Some(dest) =
                                        n.get("destination").and_then(|v| v.as_str())
                                    {
                                        if !dest.is_empty()
                                            && !destinations.contains(&dest.to_string())
                                        {
                                            destinations.push(dest.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if !destinations.is_empty() {
                    context.push_str(&format!("  Connections: {}\n", destinations.join(", ")));
                }
                context.push_str("\n");
            }
        }
    }

    if screen_count == 0 {
        context.push_str("No screens mapped yet for this profile.\n");
    }

    if let Some(root) = params.automation_root {
        let expanded = crate::cmd_utils::expand_env_vars(&root);
        append_project_index(&mut context, &expanded);
    }

    Ok(AiContextResponse {
        context,
        metadata: serde_json::json!({ "screen_count": screen_count, "profile_id": profile_id }),
    })
}

fn append_project_index(context: &mut String, root: &str) {
    if !Path::new(root).exists() {
        return;
    }

    context.push_str("\n\n### AUTOMATION PROJECT FILES (RAG INDEX)\n");
    context.push_str("You can request to read any of these files by returning their exact path in your JSON response under `needs_context_files`.\n\n");

    let mut builder = WalkBuilder::new(root);
    builder.max_depth(Some(6));
    builder.hidden(true); // Ignore hidden files/folders natively

    // Add custom ignore files
    let custom_ignores = [".claudeignore", ".geminiignore", ".antigravityignore"];
    for ig in custom_ignores {
        let ig_path = Path::new(root).join(ig);
        if ig_path.exists() {
            builder.add_custom_ignore_filename(ig);
        }
    }

    let walker = builder.build();
    for result in walker {
        if let Ok(entry) = result {
            if entry.file_type().map_or(true, |ft| ft.is_dir()) {
                continue;
            }

            let path = entry.path();
            let path_str = path.to_string_lossy().replace("\\", "/");

            // Hardcode exclusions for common heavy/unrelated directories
            if path_str.contains("/node_modules/")
                || path_str.contains("/.firebase/")
                || path_str.contains("/.github/")
                || path_str.contains("/.robocop_cache/")
                || path_str.contains("/.vscode/")
                || path_str.contains("/dist/")
                || path_str.contains("/venv/")
                || path_str.contains("/.venv/")
            {
                continue;
            }

            // Allowed extensions (excluding xml, db, txt as per user request)
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if matches!(ext, "json" | "robot" | "resource" | "md") {
                    let rel_path = path.strip_prefix(root).unwrap_or(path);
                    context.push_str(&format!("- {}\n", rel_path.to_string_lossy().replace("\\", "/")));
                }
            }
        }
    }
}
