use roxmltree::Node;
use serde::Serialize;
use std::fs;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose};

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LogNode {
    Suite(SuiteNode),
    Test(TestNode),
    Keyword(KeywordNode),
    Text(TextNode),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuiteNode {
    pub id: String,
    pub name: String,
    pub status: String,
    pub duration: String,
    pub children: Vec<LogNode>,
    pub stats: Option<SuiteStats>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuiteStats {
    pub passed: i32,
    pub failed: i32,
    pub skipped: i32,
}

#[derive(Serialize)]
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureDetail {
    pub message: String,
    pub screenshot: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeywordNode {
    pub id: String,
    pub name: String,
    pub sub_type: String,
    pub status: String,
    pub duration: String,
    pub args: Vec<String>,
    pub screenshot: Option<String>,
    pub children: Vec<LogNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextNode {
    pub id: String,
    pub content: String,
    pub is_system: bool,
}

#[tauri::command]
pub async fn parse_robot_xml(xml_path: String) -> Result<LogNode, String> {
    let content = fs::read_to_string(&xml_path).map_err(|e| e.to_string())?;
    let doc = roxmltree::Document::parse(&content).map_err(|e| e.to_string())?;
    
    let root = doc.root_element();
    if root.tag_name().name() != "robot" {
        return Err("Not a Robot Framework output file".to_string());
    }

    let suite_node = root.children()
        .find(|n| n.tag_name().name() == "suite")
        .ok_or("No suite found in XML")?;

    map_node(suite_node, &xml_path)
}

fn map_node(node: Node, xml_path: &str) -> Result<LogNode, String> {
    let tag = node.tag_name().name();
    
    match tag {
        "suite" => Ok(LogNode::Suite(map_suite(node, xml_path)?)),
        "test" => Ok(LogNode::Test(map_test(node, xml_path)?)),
        "kw" | "setup" | "teardown" | "for" | "while" | "if" | "iter" | "branch" => {
            Ok(LogNode::Keyword(map_keyword(node, xml_path)?))
        },
        _ => Err(format!("Unknown tag: {}", tag)),
    }
}

fn map_suite(node: Node, xml_path: &str) -> Result<SuiteNode, String> {
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
            if ctag == "suite" || ctag == "test" || ctag == "kw" || ctag == "setup" || ctag == "teardown" {
                if let Ok(mapped) = map_node(child, xml_path) {
                    children.push(mapped);
                }
            } else if ctag == "msg" {
                if let Some(txt) = child.text() {
                    if !txt.is_empty() && !txt.contains("src=") {
                        children.push(LogNode::Text(TextNode {
                            id: format!("msg-{}", rand::random::<u32>()),
                            content: txt.to_string(),
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
        id: format!("suite-{}", name),
        name,
        status,
        duration,
        children,
        stats,
    })
}

fn map_test(node: Node, xml_path: &str) -> Result<TestNode, String> {
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
            if ctag == "kw" || ctag == "setup" || ctag == "teardown" || ctag == "for" || ctag == "while" || ctag == "if" {
                if let Ok(mapped) = map_node(child, xml_path) {
                    children.push(mapped);
                }
            } else if ctag == "msg" {
                if let Some(txt) = child.text() {
                    if !txt.is_empty() && !txt.contains("src=") {
                        children.push(LogNode::Text(TextNode {
                            id: format!("msg-{}", rand::random::<u32>()),
                            content: txt.to_string(),
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
            screenshot: resolve_screenshot(&node, xml_path),
        });
    }

    Ok(TestNode {
        id: format!("test-{}", name),
        name,
        status,
        duration,
        children,
        failure_detail,
        logs: Vec::new(),
    })
}

fn map_keyword(node: Node, xml_path: &str) -> Result<KeywordNode, String> {
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
                "kw" | "setup" | "teardown" | "for" | "while" | "if" | "iter" | "branch" => {
                    if let Ok(mapped) = map_node(child, xml_path) {
                        children.push(mapped);
                    }
                },
                "msg" => {
                    if let Some(txt) = child.text() {
                        if !txt.is_empty() && !txt.contains("src=") {
                            children.push(LogNode::Text(TextNode {
                                id: format!("msg-{}", rand::random::<u32>()),
                                content: txt.to_string(),
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
        id: format!("kw-{}", name),
        name,
        sub_type,
        status,
        duration,
        args,
        screenshot: resolve_screenshot(&node, xml_path),
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

fn resolve_screenshot(node: &Node, xml_path: &str) -> Option<String> {
    // Find <msg> with src="..." recursively
    let src = find_screenshot_src(node)?;
    
    // Resolve relative path
    let base_dir = Path::new(xml_path).parent()?;
    let img_path = base_dir.join(&src);
    
    if let Ok(data) = fs::read(img_path) {
        let b64 = general_purpose::STANDARD.encode(data);
        let ext = src.split('.').last().unwrap_or("png").to_lowercase();
        let mime = if ext == "jpg" || ext == "jpeg" { "image/jpeg" } else { "image/png" };
        return Some(format!("data:{};base64,{}", mime, b64));
    }
    None
}

fn find_screenshot_src(node: &Node) -> Option<String> {
    for child in node.children() {
        if child.tag_name().name() == "msg" {
            if let Some(txt) = child.text() {
                if txt.contains("src=") {
                    let parts: Vec<&str> = txt.split("src=\"").collect();
                    if parts.len() > 1 {
                        let inner = parts[1].split("\"").next()?;
                        return Some(inner.to_string());
                    }
                }
            }
        }
        // Use recursive check for descendants if not found in immediate msg
        if child.is_element() {
            if let Some(found) = find_screenshot_src(&child) {
                return Some(found);
            }
        }
    }
    None
}
