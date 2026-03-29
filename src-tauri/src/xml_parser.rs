use once_cell::sync::Lazy;
use roxmltree::Node;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::Emitter;

// Pre-compiled regexes (compiled once for the entire app lifecycle)
static RE_SRC: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r#"src=["']([^"']+)["']"#).unwrap());
static RE_HIERARCHY: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"(?i)<\?xml(?:[^>]*)?>\s*<hierarchy[\s\S]*?</hierarchy>").unwrap()
});

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LogNode {
    Suite(SuiteNode),
    Test(TestNode),
    Keyword(KeywordNode),
    Text(TextNode),
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuiteNode {
    pub id: String,
    pub name: String,
    pub status: String,
    pub duration: String,
    pub children: Vec<LogNode>,
    pub stats: Option<SuiteStats>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuiteStats {
    pub passed: i32,
    pub failed: i32,
    pub skipped: i32,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestNode {
    pub id: String,
    pub name: String,
    pub status: String,
    pub duration: String,
    pub children: Vec<LogNode>,
    pub failure_detail: Option<FailureDetail>,
    pub logs: Vec<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureDetail {
    pub message: String,
    pub screenshot_path: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeywordNode {
    pub id: String,
    pub name: String,
    pub sub_type: String,
    pub status: String,
    pub duration: String,
    pub args: Vec<String>,
    pub screenshot_path: Option<String>,
    pub children: Vec<LogNode>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextNode {
    pub id: String,
    pub content: String,
    pub is_system: bool,
}

#[derive(Clone, serde::Serialize)]
struct ParseProgress {
    xml_path: String,
    stage: String,
    percent: u8,
}

#[tauri::command]
pub async fn parse_robot_xml(
    app: tauri::AppHandle,
    xml_path: String,
) -> Result<LogNode, String> {
    // Offload all heavy work to a blocking thread pool to avoid blocking the IPC thread
    tokio::task::spawn_blocking(move || parse_robot_xml_blocking(&app, &xml_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

fn emit_progress(app: &tauri::AppHandle, xml_path: &str, stage: &str, percent: u8) {
    let _ = app.emit(
        "xml-parse-progress",
        ParseProgress {
            xml_path: xml_path.to_string(),
            stage: stage.to_string(),
            percent,
        },
    );
}

fn parse_robot_xml_blocking(app: &tauri::AppHandle, xml_path: &str) -> Result<LogNode, String> {
    let xml_file_name = Path::new(xml_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    // v3: zstd-compressed cache
    let cache_file_name = format!("{}_parsed_log_v3.json.zst", xml_file_name);
    let cache_path = Path::new(xml_path).with_file_name(&cache_file_name);

    // Also check for legacy v2 cache to clean up
    let legacy_cache =
        Path::new(xml_path).with_file_name(format!("{}_parsed_log_v2.json", xml_file_name));

    // 1. Check if compressed cache exists and is valid
    let xml_mtime = fs::metadata(xml_path).and_then(|m| m.modified()).ok();
    let cache_mtime = fs::metadata(&cache_path).and_then(|m| m.modified()).ok();

    let is_cache_valid = match (xml_mtime, cache_mtime) {
        (Some(xm), Some(cm)) => cm >= xm,
        _ => false,
    };

    if is_cache_valid && cache_path.exists() {
        println!("[XML Parser] Loading from compressed cache: {:?}", cache_path);
        emit_progress(app, xml_path, "loading_tree", 90);
        match load_from_zstd_cache(&cache_path) {
            Ok(suite) => return Ok(suite),
            Err(e) => {
                println!("[XML Parser] Cache read failed, re-parsing: {}", e);
                let _ = fs::remove_file(&cache_path);
            }
        }
    }

    // 2. Parse XML (heavy operation)
    emit_progress(app, xml_path, "parsing_xml", 10);
    println!("[XML Parser] Parsing XML: {:?}", xml_path);
    let content = fs::read_to_string(xml_path).map_err(|e| e.to_string())?;
    let doc = roxmltree::Document::parse(&content).map_err(|e| e.to_string())?;
    println!("[XML Parser] XML parsed successfully");

    let root = doc.root_element();
    if root.tag_name().name() != "robot" {
        return Err("Not a Robot Framework output file".to_string());
    }

    let suite_node = root
        .children()
        .find(|n| n.tag_name().name() == "suite")
        .ok_or("No suite found in XML")?;

    emit_progress(app, xml_path, "mapping_structure", 35);
    println!("[XML Parser] Mapping suite structure...");

    let base_dir = Path::new(xml_path).parent().unwrap_or(Path::new("."));

    let suite = map_node(suite_node, base_dir)?;
    println!("[XML Parser] Mapping complete");

    // 3. Save compressed cache in background (fire-and-forget)
    emit_progress(app, xml_path, "compressing_cache", 65);

    let cache_path_owned = cache_path.to_path_buf();
    let legacy_cache_owned = legacy_cache.to_path_buf();
    let app_clone = app.clone();
    let xml_path_owned = xml_path.to_string();

    // Serialize to bytes first (on this thread to borrow `suite`)
    match serde_json::to_vec(&suite) {
        Ok(json_bytes) => {
            std::thread::spawn(move || {
                // Write zstd-compressed cache
                if let Ok(file) = fs::File::create(&cache_path_owned) {
                    let encoder = zstd::Encoder::new(file, 3); // compression level 3 (fast)
                    if let Ok(mut encoder) = encoder {
                        use std::io::Write;
                        let _ = encoder.write_all(&json_bytes);
                        let _ = encoder.finish();
                        if let Ok(meta) = fs::metadata(&cache_path_owned) {
                            let ratio = if !json_bytes.is_empty() {
                                (meta.len() as f64 / json_bytes.len() as f64 * 100.0).round()
                            } else {
                                0.0
                            };
                            println!(
                                "[XML Parser] Compressed cache saved: {} bytes ({}% of original {})",
                                meta.len(),
                                ratio,
                                json_bytes.len()
                            );
                        }
                    }
                }
                // Clean up legacy uncompressed cache
                if legacy_cache_owned.exists() {
                    let _ = fs::remove_file(&legacy_cache_owned);
                }
                emit_progress(&app_clone, &xml_path_owned, "loading_tree", 90);
            });
        }
        Err(e) => {
            println!("[XML Parser] Serialization failed, skipping cache: {}", e);
        }
    }

    Ok(suite)
}

/// Load a LogNode from a zstd-compressed JSON cache file
fn load_from_zstd_cache(path: &Path) -> Result<LogNode, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let decoder = zstd::Decoder::new(file).map_err(|e| e.to_string())?;
    let reader = std::io::BufReader::new(decoder);
    serde_json::from_reader(reader).map_err(|e| e.to_string())
}

fn map_node(node: Node, base_dir: &Path) -> Result<LogNode, String> {
    let tag = node.tag_name().name();

    match tag {
        "suite" => Ok(LogNode::Suite(map_suite(node, base_dir)?)),
        "test" => Ok(LogNode::Test(map_test(node, base_dir)?)),
        "kw" | "setup" | "teardown" | "for" | "while" | "if" | "iter" | "branch" | "break"
        | "continue" => Ok(LogNode::Keyword(map_keyword(node, base_dir)?)),
        _ => Err(format!("Unknown tag: {}", tag)),
    }
}

fn map_suite(node: Node, base_dir: &Path) -> Result<SuiteNode, String> {
    let name = node.attribute("name").unwrap_or("").to_string();
    let status_node = node
        .children()
        .find(|n| n.tag_name().name() == "status")
        .ok_or("No status node")?;
    let status = status_node
        .attribute("status")
        .unwrap_or("PASS")
        .to_string();

    let start = status_node
        .attribute("starttime")
        .or_else(|| status_node.attribute("start"))
        .unwrap_or("");
    let end = status_node
        .attribute("endtime")
        .or_else(|| status_node.attribute("end"))
        .unwrap_or("");
    let duration = format_duration(&status_node, start, end);

    let mut children = Vec::new();
    for child in node.children() {
        if child.is_element() {
            let ctag = child.tag_name().name();
            if ctag == "if" {
                for branch in child.children().filter(|n| n.tag_name().name() == "branch") {
                    if let Ok(mapped) = map_node(branch, base_dir) {
                        children.push(mapped);
                    }
                }
            } else if ctag == "suite"
                || ctag == "test"
                || ctag == "kw"
                || ctag == "setup"
                || ctag == "teardown"
                || ctag == "break"
                || ctag == "continue"
            {
                if let Ok(mapped) = map_node(child, base_dir) {
                    children.push(mapped);
                }
            } else if ctag == "msg" {
                if let Some(txt) = child.text() {
                    let cleaned = clean_message(txt);
                    if !cleaned.is_empty() && !txt.contains("src=") {
                        children.push(LogNode::Text(TextNode {
                            id: format!("msg-{}", rand::random::<u32>()),
                            content: cleaned,
                            is_system: false,
                        }));
                    }
                }
            }
        }
    }

    // Stats
    let stats = if let Some(stats_node) = node
        .children()
        .find(|n| n.tag_name().name() == "statistics")
    {
        let first_stat = stats_node
            .children()
            .find(|n| n.tag_name().name() == "stat");
        first_stat.map(|s| SuiteStats {
            passed: s.attribute("pass").unwrap_or("0").parse().unwrap_or(0),
            failed: s.attribute("fail").unwrap_or("0").parse().unwrap_or(0),
            skipped: s.attribute("skip").unwrap_or("0").parse().unwrap_or(0),
        })
    } else {
        None
    };

    Ok(SuiteNode {
        id: node
            .attribute("id")
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("suite-{}", name)),
        name,
        status,
        duration,
        children,
        stats,
    })
}

fn map_test(node: Node, base_dir: &Path) -> Result<TestNode, String> {
    let name = node.attribute("name").unwrap_or("").to_string();
    let status_node = node
        .children()
        .find(|n| n.tag_name().name() == "status")
        .ok_or("No status node")?;
    let status = status_node
        .attribute("status")
        .unwrap_or("PASS")
        .to_string();

    let start = status_node
        .attribute("starttime")
        .or_else(|| status_node.attribute("start"))
        .unwrap_or("");
    let end = status_node
        .attribute("endtime")
        .or_else(|| status_node.attribute("end"))
        .unwrap_or("");
    let duration = format_duration(&status_node, start, end);

    let mut children = Vec::new();
    for child in node.children() {
        if child.is_element() {
            let ctag = child.tag_name().name();
            if ctag == "if" {
                for branch in child.children().filter(|n| n.tag_name().name() == "branch") {
                    if let Ok(mapped) = map_node(branch, base_dir) {
                        children.push(mapped);
                    }
                }
            } else if ctag == "kw"
                || ctag == "setup"
                || ctag == "teardown"
                || ctag == "for"
                || ctag == "while"
                || ctag == "break"
                || ctag == "continue"
            {
                if let Ok(mapped) = map_node(child, base_dir) {
                    children.push(mapped);
                }
            } else if ctag == "msg" {
                if let Some(txt) = child.text() {
                    let cleaned = clean_message(txt);
                    if !cleaned.is_empty() && !txt.contains("src=") {
                        children.push(LogNode::Text(TextNode {
                            id: format!("msg-{}", rand::random::<u32>()),
                            content: cleaned,
                            is_system: false,
                        }));
                    }
                }
            }
        }
    }

    let mut failure_detail = None;
    if status == "FAIL" {
        let message = status_node.text().unwrap_or("").to_string();
        failure_detail = Some(FailureDetail {
            message,
            screenshot_path: resolve_screenshot(&node, base_dir, true),
        });
    }

    Ok(TestNode {
        id: node
            .attribute("id")
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("test-{}", name)),
        name,
        status,
        duration,
        children,
        failure_detail,
        logs: Vec::new(),
    })
}

fn map_keyword(node: Node, base_dir: &Path) -> Result<KeywordNode, String> {
    let name = node.attribute("name").unwrap_or("").to_string();
    let tag = node.tag_name().name();
    let sub_type = if tag == "branch" {
        match node.attribute("type").unwrap_or("IF") {
            t if t.eq_ignore_ascii_case("ELSE IF") => "else-if",
            t if t.eq_ignore_ascii_case("ELSE") => "else",
            _ => "if",
        }
        .to_string()
    } else {
        match tag {
            "setup" => "setup",
            "teardown" => "teardown",
            "for" => "for",
            "while" => "while",
            "if" => "if",
            "iter" => "iteration",
            "break" => "break",
            "continue" => "continue",
            _ => "keyword",
        }
        .to_string()
    };

    let status_node = node
        .children()
        .find(|n| n.tag_name().name() == "status")
        .ok_or("No status node")?;
    let mut status = status_node
        .attribute("status")
        .unwrap_or("PASS")
        .to_string();
    if status == "NOT RUN" {
        status = "NOT_RUN".to_string();
    }
    let start = status_node
        .attribute("starttime")
        .or_else(|| status_node.attribute("start"))
        .unwrap_or("");
    let end = status_node
        .attribute("endtime")
        .or_else(|| status_node.attribute("end"))
        .unwrap_or("");
    let duration = format_duration(&status_node, start, end);

    let mut args = Vec::new();

    // 1. Condition for BRANCH/WHILE
    if let Some(cond) = node.attribute("condition") {
        args.push(cond.to_string());
    }

    // 2. FOR flavors and iterate variables
    let mut vars = Vec::new();
    for child in node.children().filter(|n| n.tag_name().name() == "var") {
        if let Some(txt) = child.text() {
            vars.push(txt.to_string());
        }
    }

    let mut values = Vec::new();
    for child in node.children().filter(|n| n.tag_name().name() == "value") {
        if let Some(txt) = child.text() {
            values.push(txt.to_string());
        }
    }

    let flavor = node.attribute("flavor").unwrap_or("IN");

    if !vars.is_empty() {
        if !values.is_empty() {
            if vars.len() == 1
                && values.len() == 1
                && flavor == "IN"
                && node.tag_name().name() == "iter"
            {
                args.push(format!("{} = {}", vars[0], values[0]));
            } else {
                args.push(format!(
                    "{} {} {}",
                    vars.join(", "),
                    flavor,
                    values.join(", ")
                ));
            }
        } else {
            args.push(vars.join(", "));
        }
    } else if !values.is_empty() && node.attribute("condition").is_none() {
        args.push(values.join(", "));
    }

    // 3. Standard <arg> elements
    for child in node.children().filter(|n| n.tag_name().name() == "arg") {
        if let Some(txt) = child.text() {
            args.push(txt.to_string());
        }
    }

    let mut children = Vec::new();
    for child in node.children() {
        if child.is_element() {
            let ctag = child.tag_name().name();
            match ctag {
                "if" => {
                    for branch in child.children().filter(|n| n.tag_name().name() == "branch") {
                        if let Ok(mapped) = map_node(branch, base_dir) {
                            children.push(mapped);
                        }
                    }
                }
                "kw" | "setup" | "teardown" | "for" | "while" | "iter" | "branch" | "break"
                | "continue" => {
                    if let Ok(mapped) = map_node(child, base_dir) {
                        children.push(mapped);
                    }
                }
                "msg" => {
                    if let Some(txt) = child.text() {
                        let cleaned = clean_message(txt);
                        if !cleaned.is_empty() && !txt.contains("src=") {
                            children.push(LogNode::Text(TextNode {
                                id: format!("msg-{}", rand::random::<u32>()),
                                content: cleaned,
                                is_system: false,
                            }));
                        }
                    }
                }
                _ => {}
            }
        }
    }

    Ok(KeywordNode {
        id: node
            .attribute("id")
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("kw-{}", name)),
        name,
        sub_type,
        status,
        duration,
        args,
        screenshot_path: resolve_screenshot(&node, base_dir, false),
        children,
    })
}

fn format_duration(status_node: &Node, start: &str, end: &str) -> String {
    // 1. Try "elapsed" attribute
    if let Some(elapsed) = status_node.attribute("elapsed") {
        if let Ok(total) = elapsed.parse::<f64>() {
            return format_formatted_seconds(total);
        }
    }

    // 2. Fallback to start/end timestamps
    if !start.is_empty() && !end.is_empty() {
        let fmt = "%Y%m%d %H:%M:%S%.3f";
        if let (Ok(s), Ok(e)) = (
            chrono::NaiveDateTime::parse_from_str(start, fmt),
            chrono::NaiveDateTime::parse_from_str(end, fmt),
        ) {
            let duration = e.signed_duration_since(s);
            let total_secs = duration.num_milliseconds() as f64 / 1000.0;
            return format_formatted_seconds(total_secs);
        }
    }
    "".to_string()
}

fn format_formatted_seconds(total: f64) -> String {
    let ms = (total * 1000.0).round() as i64 % 1000;
    let secs = (total as i64) % 60;
    let mins = (total as i64 / 60) % 60;
    let hours = total as i64 / 3600;

    if hours > 0 {
        format!("{:02}:{:02}:{:02}.{:03}", hours, mins, secs, ms)
    } else {
        format!("{:02}:{:02}.{:03}", mins, secs, ms)
    }
}

fn resolve_screenshot(node: &Node, base_dir: &Path, recursive: bool) -> Option<String> {
    let src = find_screenshot_src(node, recursive)?;

    // Embedded base64 image — return directly
    if src.starts_with("data:image") {
        return Some(src);
    }

    // Clean src path
    let clean_src = if src.starts_with("./") {
        &src[2..]
    } else {
        &src
    };
    let clean_src = clean_src.replace('\\', "/");

    let img_path = base_dir.join(&clean_src);
    Some(img_path.to_string_lossy().to_string())
}

fn find_screenshot_src(node: &Node, recursive: bool) -> Option<String> {
    let mut last_found = None;

    for child in node.children() {
        if child.tag_name().name() == "msg" {
            // Fast path: only run regex if text contains src=
            if let Some(txt) = child.text() {
                if txt.contains("src=") {
                    if let Some(caps) = RE_SRC.captures(txt) {
                        last_found = Some(caps[1].to_string());
                    }
                }
            }
        }
        if recursive && child.is_element() {
            if let Some(found) = find_screenshot_src(&child, recursive) {
                last_found = Some(found);
            }
        }
    }
    last_found
}

fn clean_message(txt: &str) -> String {
    // Fast path: only run regex if it looks like an XML hierarchy dump
    if txt.len() > 10 && txt.contains("<?xml") && txt.contains("<hierarchy") {
        RE_HIERARCHY.replace_all(txt, "").trim().to_string()
    } else {
        txt.trim().to_string()
    }
}
