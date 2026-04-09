use roxmltree;
use serde::{Deserialize, Serialize};
use crate::db::LogDb;
use crate::files::read_file_tail_internal;
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub enum AiContextType {
    HistoryAnalysis,
    Exploration,
    ArtifactGeneration,
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
}

#[derive(Serialize, Debug)]
pub struct AiContextResponse {
    pub context: String,
    pub metadata: serde_json::Value,
}

#[tauri::command]
pub async fn get_ai_context(
    context_type: AiContextType,
    params: AiContextParams,
) -> Result<AiContextResponse, String> {
    match context_type {
        AiContextType::HistoryAnalysis => get_history_analysis_context(params),
        AiContextType::Exploration => get_exploration_context(params),
        AiContextType::ArtifactGeneration => get_artifact_generation_context(params),
    }
}

fn get_history_analysis_context(params: AiContextParams) -> Result<AiContextResponse, String> {
    let db_path = params.db_path.ok_or("Missing db_path")?;
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
                    // CRITICAL: Strip base64 screenshot data which eats up megabytes in token limit
                    if let Some(fail_detail) = obj.get_mut("failureDetail") {
                        if let Some(fd_obj) = fail_detail.as_object_mut() {
                            fd_obj.remove("screenshotPath");
                            fd_obj.remove("screenshot_path");
                        }
                    }
                    if let Some(fail_detail) = obj.get_mut("failure_detail") {
                        if let Some(fd_obj) = fail_detail.as_object_mut() {
                            fd_obj.remove("screenshotPath");
                            fd_obj.remove("screenshot_path");
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
                        context.push_str(&format!("Performance Data ({}):\n{}\n\n", path.file_name().unwrap().to_string_lossy(), tail));
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
            let extension = Path::new(&path).extension().and_then(|s| s.to_str()).unwrap_or("");
            if extension == "xml" || extension == "html" {
                continue; // Skip execution artifacts that are already covered by DB or don't add value
            }
            if let Ok(tail) = read_file_tail_internal(&path, 5000) { // Limit to 5KB per extra log
                context.push_str(&format!("--- Log: {} ---\n", Path::new(&path).file_name().unwrap_or_default().to_string_lossy()));
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
    
    Ok(AiContextResponse {
        context,
        metadata: serde_json::json!({ "failure_count": failures.len() }),
    })
}

fn get_exploration_context(params: AiContextParams) -> Result<AiContextResponse, String> {
    let mut context = String::new();
    let mut metadata = serde_json::json!({});

    if let Some(xml) = params.current_xml {
        context.push_str("### UI HIERARCHY (Simplified XML)\n\n");
        let doc = roxmltree::Document::parse(&xml).map_err(|e| e.to_string())?;
        
        // Simple heuristic for interactive elements to keep XML tiny
        let mut simplified = String::new();
        simplified.push_str("<hierarchy>\n");
        
        let mut short_id_map = serde_json::Map::new();
        let mut count = 0;

        for node in doc.descendants() {
            if node.is_element() {
                let tag = node.tag_name().name();
                // Interactive elements or those with text content
                let clickable = node.attribute("clickable") == Some("true") || node.attribute("long-clickable") == Some("true");
                let has_text = node.attribute("text").is_some() && node.attribute("text") != Some("");
                
                if clickable || has_text || tag == "hierarchy" {
                    count += 1;
                    let short_id = format!("e{}", count);
                    let xpath = generate_basic_xpath(&node);
                    short_id_map.insert(short_id.clone(), serde_json::json!(xpath));

                    let text = node.attribute("text").unwrap_or("");
                    let resource_id = node.attribute("resource-id").unwrap_or("").split('/').last().unwrap_or("");
                    
                    simplified.push_str(&format!(
                        "  <{tag} id='{}' text='{}' res='{}' clickable='{}' />\n",
                        short_id, text, resource_id, clickable
                    ));
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
    
    Ok(AiContextResponse {
        context,
        metadata,
    })
}

fn generate_basic_xpath(node: &roxmltree::Node) -> String {
    let mut path = Vec::new();
    let mut current = *node;
    
    while let Some(parent) = current.parent() {
        if parent.is_root() { break; }
        let tag = current.tag_name().name();
        
        // Find index among siblings with same tag
        let mut index = 1;
        for sibling in parent.children() {
            if sibling == current { break; }
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

fn get_artifact_generation_context(params: AiContextParams) -> Result<AiContextResponse, String> {
    let mut context = String::new();
    
    context.push_str("### APPLICATION MAPPING CONTEXT\n\n");
    // In a real scenario, we'd query the SQLite DB here for all ScreenMaps belonging to the profile_id
    // For now, we'll keep it as a placeholder for technical completeness
    context.push_str("Available screens and elements are indexed and ready for reference.");

    Ok(AiContextResponse {
        context,
        metadata: serde_json::json!({ "profile_id": params.profile_id }),
    })
}
