use roxmltree::Node;
use serde::Serialize;
use std::fs;
use std::path::Path;

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
    pub screenshot_path: Option<String>,
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
    pub screenshot_path: Option<String>,
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
        "kw" | "setup" | "teardown" | "for" | "while" | "if" | "iter" | "branch" | "break" | "continue" => {
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
            if ctag == "if" {
                // Hoist branches
                for branch in child.children().filter(|n| n.tag_name().name() == "branch") {
                    if let Ok(mapped) = map_node(branch, xml_path) {
                        children.push(mapped);
                    }
                }
            } else if ctag == "suite" || ctag == "test" || ctag == "kw" || ctag == "setup" || ctag == "teardown" || ctag == "break" || ctag == "continue" {
                if let Ok(mapped) = map_node(child, xml_path) {
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
            if ctag == "if" {
                // Hoist branches
                for branch in child.children().filter(|n| n.tag_name().name() == "branch") {
                    if let Ok(mapped) = map_node(branch, xml_path) {
                        children.push(mapped);
                    }
                }
            } else if ctag == "kw" || ctag == "setup" || ctag == "teardown" || ctag == "for" || ctag == "while" || ctag == "break" || ctag == "continue" {
                if let Ok(mapped) = map_node(child, xml_path) {
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
            screenshot_path: resolve_screenshot(&node, xml_path, true),
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
                        if let Ok(mapped) = map_node(branch, xml_path) {
                            children.push(mapped);
                        }
                    }
                },
                "kw" | "setup" | "teardown" | "for" | "while" | "iter" | "branch" | "break" | "continue" => {
                    if let Ok(mapped) = map_node(child, xml_path) {
                        children.push(mapped);
                    }
                },
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
        screenshot_path: resolve_screenshot(&node, xml_path, false),
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

fn resolve_screenshot(node: &Node, xml_path: &str, recursive: bool) -> Option<String> {
    // Find <msg> with src="..." recursively
    let src = find_screenshot_src(node, recursive)?;
    
    // If it's already an embedded base64 image (appium or embedded screenshot), return directly
    if src.starts_with("data:image") {
        return Some(src);
    }
    
    // Resolve absolute path
    let base_dir = Path::new(xml_path).parent()?;
    let img_path = base_dir.join(&src);
    
    // Return the path directly without checking .exists() during parsing, 
    // as the path normalization might differ or file might be on a network drive. 
    // The frontend read_image_base64 will handle actual access later.
    Some(img_path.to_string_lossy().to_string())
}

fn find_screenshot_src(node: &Node, recursive: bool) -> Option<String> {
    let mut last_found = None;
    for child in node.children() {
        if child.tag_name().name() == "msg" {
            if let Some(txt) = child.text() {
                if let Some(idx) = txt.find("src=") {
                    let rest = &txt[idx + 4..];
                    if let Some(quote) = rest.chars().next() {
                        if quote == '"' || quote == '\'' {
                            if let Some(inner) = rest[1..].split(quote).next() {
                                last_found = Some(inner.to_string());
                            }
                        }
                    }
                }
            }
        }
        // Use recursive check for descendants if not found in immediate msg
        if recursive && child.is_element() {
            if let Some(found) = find_screenshot_src(&child, recursive) {
                last_found = Some(found);
            }
        }
    }
    last_found
}

fn clean_message(txt: &str) -> String {
    // Strip <?xml...><hierarchy...</hierarchy>
    let re = regex::Regex::new(r"(?i)<\?xml(?:[^>]*)?>\s*<hierarchy[\s\S]*?</hierarchy>").unwrap();
    re.replace_all(txt, "").trim().to_string()
}
