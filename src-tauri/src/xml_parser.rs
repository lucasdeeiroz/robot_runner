use roxmltree::Node;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

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

#[tauri::command]
pub async fn parse_robot_xml(xml_path: String) -> Result<LogNode, String> {
    let xml_file_name = Path::new(&xml_path).file_name().and_then(|n| n.to_str()).unwrap_or("unknown");
    let cache_file_name = format!("{}_parsed_log_v2.json", xml_file_name);
    let cache_path = Path::new(&xml_path).with_file_name(cache_file_name);
    
    // 1. Check if cache exists and is valid (cache mtime >= xml mtime)
    let xml_mtime = fs::metadata(&xml_path).and_then(|m| m.modified()).ok();
    let cache_mtime = fs::metadata(&cache_path).and_then(|m| m.modified()).ok();
    
    let is_cache_valid = match (xml_mtime, cache_mtime) {
        (Some(xm), Some(cm)) => cm >= xm,
        _ => false,
    };

    if is_cache_valid && cache_path.exists() {
        println!("[XML Parser] Loading from cache: {:?}", cache_path);
        let json = fs::read_to_string(&cache_path).map_err(|e| e.to_string())?;
        let suite: LogNode = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        return Ok(suite);
    }

    // 2. Parse XML if no cache
    println!("[XML Parser] Parsing XML: {:?}", xml_path);
    let content = fs::read_to_string(&xml_path).map_err(|e| e.to_string())?;
    let doc = roxmltree::Document::parse(&content).map_err(|e| e.to_string())?;
    println!("[XML Parser] XML parsed successfully");
    
    let root = doc.root_element();
    if root.tag_name().name() != "robot" {
        return Err("Not a Robot Framework output file".to_string());
    }

    let suite_node = root.children()
        .find(|n| n.tag_name().name() == "suite")
        .ok_or("No suite found in XML")?;

    println!("[XML Parser] Mapping suite structure...");
    
    // Pre-calculate base_dir and compile regexes once
    let base_dir = Path::new(&xml_path).parent().unwrap_or(Path::new("."));
    let re_src = regex::Regex::new(r#"src=["']([^"']+)["']"#).unwrap();
    let re_hierarchy = regex::Regex::new(r"(?i)<\?xml(?:[^>]*)?>\s*<hierarchy[\s\S]*?</hierarchy>").unwrap();

    let suite = map_node(suite_node, base_dir, &re_src, &re_hierarchy)?;
    println!("[XML Parser] Mapping complete");
    
    // 3. Save cache for future loads
    println!("[XML Parser] Saving cache to: {:?}", cache_path);
    
    // Use buffered writer to handle large files efficiently
    let file = fs::File::create(&cache_path).map_err(|e| e.to_string())?;
    let writer = std::io::BufWriter::new(file);
    serde_json::to_writer(writer, &suite).map_err(|e| format!("Serialization error: {}", e))?;
    
    if let Ok(meta) = fs::metadata(&cache_path) {
        println!("[XML Parser] Cache saved successfully: {} bytes", meta.len());
    } else {
        println!("[XML Parser] Cache saved successfully (size unknown)");
    }
    
    Ok(suite)
}

fn map_node(node: Node, base_dir: &Path, re_src: &regex::Regex, re_hierarchy: &regex::Regex) -> Result<LogNode, String> {
    let tag = node.tag_name().name();
    
    match tag {
        "suite" => Ok(LogNode::Suite(map_suite(node, base_dir, re_src, re_hierarchy)?)),
        "test" => Ok(LogNode::Test(map_test(node, base_dir, re_src, re_hierarchy)?)),
        "kw" | "setup" | "teardown" | "for" | "while" | "if" | "iter" | "branch" | "break" | "continue" => {
            Ok(LogNode::Keyword(map_keyword(node, base_dir, re_src, re_hierarchy)?))
        },
        _ => Err(format!("Unknown tag: {}", tag)),
    }
}

fn map_suite(node: Node, base_dir: &Path, re_src: &regex::Regex, re_hierarchy: &regex::Regex) -> Result<SuiteNode, String> {
    let name = node.attribute("name").unwrap_or("").to_string();
    let status_node = node.children().find(|n| n.tag_name().name() == "status").ok_or("No status node")?;
    let status = status_node.attribute("status").unwrap_or("PASS").to_string();
    
    let start = status_node.attribute("starttime").or_else(|| status_node.attribute("start")).unwrap_or("");
    let end = status_node.attribute("endtime").or_else(|| status_node.attribute("end")).unwrap_or("");
    let duration = format_duration(&status_node, start, end);

    let mut children = Vec::new();
    for child in node.children() {
        if child.is_element() {
            let ctag = child.tag_name().name();
            if ctag == "if" {
                // Hoist branches
                for branch in child.children().filter(|n| n.tag_name().name() == "branch") {
                    if let Ok(mapped) = map_node(branch, base_dir, re_src, re_hierarchy) {
                        children.push(mapped);
                    }
                }
            } else if ctag == "suite" || ctag == "test" || ctag == "kw" || ctag == "setup" || ctag == "teardown" || ctag == "break" || ctag == "continue" {
                if let Ok(mapped) = map_node(child, base_dir, re_src, re_hierarchy) {
                    children.push(mapped);
                }
            } else if ctag == "msg" {
                if let Some(txt) = child.text() {
                    let cleaned = clean_message(txt, re_hierarchy);
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
    let stats = if let Some(stats_node) = node.children().find(|n| n.tag_name().name() == "statistics") {
        let first_stat = stats_node.children().find(|n| n.tag_name().name() == "stat");
        first_stat.map(|s| SuiteStats {
            passed: s.attribute("pass").unwrap_or("0").parse().unwrap_or(0),
            failed: s.attribute("fail").unwrap_or("0").parse().unwrap_or(0),
            skipped: s.attribute("skip").unwrap_or("0").parse().unwrap_or(0),
        })
    } else {
        None
    };

    Ok(SuiteNode {
        id: node.attribute("id").map(|s| s.to_string()).unwrap_or_else(|| format!("suite-{}", name)),
        name,
        status,
        duration,
        children,
        stats,
    })
}

fn map_test(node: Node, base_dir: &Path, re_src: &regex::Regex, re_hierarchy: &regex::Regex) -> Result<TestNode, String> {
    let name = node.attribute("name").unwrap_or("").to_string();
    let status_node = node.children().find(|n| n.tag_name().name() == "status").ok_or("No status node")?;
    let status = status_node.attribute("status").unwrap_or("PASS").to_string();
    
    let start = status_node.attribute("starttime").or_else(|| status_node.attribute("start")).unwrap_or("");
    let end = status_node.attribute("endtime").or_else(|| status_node.attribute("end")).unwrap_or("");
    let duration = format_duration(&status_node, start, end);

    let mut children = Vec::new();
    for child in node.children() {
        if child.is_element() {
            let ctag = child.tag_name().name();
            if ctag == "if" {
                // Hoist branches
                for branch in child.children().filter(|n| n.tag_name().name() == "branch") {
                    if let Ok(mapped) = map_node(branch, base_dir, re_src, re_hierarchy) {
                        children.push(mapped);
                    }
                }
            } else if ctag == "kw" || ctag == "setup" || ctag == "teardown" || ctag == "for" || ctag == "while" || ctag == "break" || ctag == "continue" {
                if let Ok(mapped) = map_node(child, base_dir, re_src, re_hierarchy) {
                    children.push(mapped);
                }
            } else if ctag == "msg" {
                if let Some(txt) = child.text() {
                    let cleaned = clean_message(txt, re_hierarchy);
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
            screenshot_path: resolve_screenshot(&node, base_dir, re_src, true),
        });
    }

    Ok(TestNode {
        id: node.attribute("id").map(|s| s.to_string()).unwrap_or_else(|| format!("test-{}", name)),
        name,
        status,
        duration,
        children,
        failure_detail,
        logs: Vec::new(),
    })
}

fn map_keyword(node: Node, base_dir: &Path, re_src: &regex::Regex, re_hierarchy: &regex::Regex) -> Result<KeywordNode, String> {
    let name = node.attribute("name").unwrap_or("").to_string();
    let tag = node.tag_name().name();
    let sub_type = if tag == "branch" {
        match node.attribute("type").unwrap_or("IF") {
            t if t.eq_ignore_ascii_case("ELSE IF") => "else-if",
            t if t.eq_ignore_ascii_case("ELSE") => "else",
            _ => "if",
        }.to_string()
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
        }.to_string()
    };

    let status_node = node.children().find(|n| n.tag_name().name() == "status").ok_or("No status node")?;
    let mut status = status_node.attribute("status").unwrap_or("PASS").to_string();
    if status == "NOT RUN" {
        status = "NOT_RUN".to_string();
    }
    let start = status_node.attribute("starttime").or_else(|| status_node.attribute("start")).unwrap_or("");
    let end = status_node.attribute("endtime").or_else(|| status_node.attribute("end")).unwrap_or("");
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
            if vars.len() == 1 && values.len() == 1 && flavor == "IN" && node.tag_name().name() == "iter" {
                args.push(format!("{} = {}", vars[0], values[0]));
            } else {
                args.push(format!("{} {} {}", vars.join(", "), flavor, values.join(", ")));
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
                    // Hoist branches
                    for branch in child.children().filter(|n| n.tag_name().name() == "branch") {
                        if let Ok(mapped) = map_node(branch, base_dir, re_src, re_hierarchy) {
                            children.push(mapped);
                        }
                    }
                },
                "kw" | "setup" | "teardown" | "for" | "while" | "iter" | "branch" | "break" | "continue" => {
                    if let Ok(mapped) = map_node(child, base_dir, re_src, re_hierarchy) {
                        children.push(mapped);
                    }
                },
                "msg" => {
                    if let Some(txt) = child.text() {
                        let cleaned = clean_message(txt, re_hierarchy);
                        if !cleaned.is_empty() && !txt.contains("src=") {
                            children.push(LogNode::Text(TextNode {
                                id: format!("msg-{}", rand::random::<u32>()),
                                content: cleaned,
                                is_system: false,
                            }));
                        }
                    }
                },
                _ => {}
            }
        }
    }

    Ok(KeywordNode {
        id: node.attribute("id").map(|s| s.to_string()).unwrap_or_else(|| format!("kw-{}", name)),
        name,
        sub_type,
        status,
        duration,
        args,
        screenshot_path: resolve_screenshot(&node, base_dir, re_src, false),
        children,
    })
}

fn format_duration(status_node: &Node, start: &str, end: &str) -> String {
    // 1. Try "elapsed" attribute (most efficient)
    if let Some(elapsed) = status_node.attribute("elapsed") {
        if let Ok(total) = elapsed.parse::<f64>() {
            return format_formatted_seconds(total);
        }
    }

    // 2. Fallback to start/end timestamps if elapsed is missing
    if !start.is_empty() && !end.is_empty() {
        let fmt = "%Y%m%d %H:%M:%S%.3f";
        if let (Ok(s), Ok(e)) = (
            chrono::NaiveDateTime::parse_from_str(start, fmt),
            chrono::NaiveDateTime::parse_from_str(end, fmt)
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

fn resolve_screenshot(node: &Node, base_dir: &Path, re_src: &regex::Regex, recursive: bool) -> Option<String> {
    // Find <msg> with src="..." recursively
    let src = find_screenshot_src(node, re_src, recursive)?;
    
    // If it's already an embedded base64 image (appium or embedded screenshot), return directly
    if src.starts_with("data:image") {
        return Some(src);
    }
    
    // Clean src path (remove leading ./ if present)
    let clean_src = if src.starts_with("./") { &src[2..] } else { &src };
    
    // Handle both / and \ in src paths for cross-platform compatibility
    let clean_src = clean_src.replace('\\', "/");
    
    let img_path = base_dir.join(&clean_src);
    
    let resolved = img_path.to_string_lossy().to_string();
    // println!("[XML Parser] Resolved screenshot: {} -> {}", src, resolved);
    
    Some(resolved)
}

fn find_screenshot_src(node: &Node, re_src: &regex::Regex, recursive: bool) -> Option<String> {
    let mut last_found = None;
    
    for child in node.children() {
        if child.tag_name().name() == "msg" {
            // Fast path: only run regex if it contains src= and is small or starts with <img
            if let Some(txt) = child.text() {
                if txt.contains("src=") {
                    if let Some(caps) = re_src.captures(txt) {
                        last_found = Some(caps[1].to_string());
                    }
                }
            }
        }
        // Use recursive check for descendants if not found in immediate msg
        if recursive && child.is_element() {
            if let Some(found) = find_screenshot_src(&child, re_src, recursive) {
                last_found = Some(found);
            }
        }
    }
    last_found
}

fn clean_message(txt: &str, re_hierarchy: &regex::Regex) -> String {
    // Fast path: only run regex if it looks like an XML hierarchy
    if txt.len() > 10 && txt.contains("<?xml") && txt.contains("<hierarchy") {
        re_hierarchy.replace_all(txt, "").trim().to_string()
    } else {
        txt.trim().to_string()
    }
}
