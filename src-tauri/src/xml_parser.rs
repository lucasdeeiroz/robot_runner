use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::Emitter;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::io::BufReader;
use crate::db::LogDb;

static RE_SRC: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r#"src=["']([^"']+)["']"#).unwrap());
static RE_HIERARCHY: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"(?i)<?\?xml[\s\S]*/hierarchy>?").unwrap()
});

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LogNode {
    Suite(SuiteNode),
    Test(TestNode),
    Keyword(KeywordNode),
    Text(TextNode),
}

impl LogNode {
    pub fn id(&self) -> &str {
        match self {
            LogNode::Suite(s) => &s.id,
            LogNode::Test(t) => &t.id,
            LogNode::Keyword(k) => &k.id,
            LogNode::Text(t) => &t.id,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SuiteNode {
    pub id: String,
    pub name: String,
    pub status: String,
    pub duration: String,
    pub children: Vec<LogNode>,
    #[serde(default)]
    pub has_children: bool,
    pub stats: Option<SuiteStats>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SuiteStats {
    pub passed: i32,
    pub failed: i32,
    pub skipped: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TestNode {
    pub id: String,
    pub name: String,
    pub status: String,
    pub duration: String,
    pub children: Vec<LogNode>,
    #[serde(default)]
    pub has_children: bool,
    pub failure_detail: Option<FailureDetail>,
    pub logs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FailureDetail {
    pub message: String,
    pub screenshot_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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
    #[serde(default)]
    pub has_children: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub db_path: String,
    pub root_suite: LogNode,
}

#[tauri::command]
pub async fn parse_robot_xml(
    app: tauri::AppHandle,
    xml_path: String,
) -> Result<ParseResult, String> {
    tokio::task::spawn_blocking(move || parse_robot_xml_blocking(&app, &xml_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_node_children(
    db_path: String,
    parent_id: String,
) -> Result<Vec<LogNode>, String> {
    tokio::task::spawn_blocking(move || {
        let db = LogDb::new(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
        let children_json = db.get_children(&parent_id).map_err(|e| format!("Query error: {}", e))?;
        
        let mut nodes = Vec::new();
        println!("[XML Parser] get_node_children called for parent_id: '{}', db path: {}", parent_id, db_path);
        for (i, json) in children_json.iter().enumerate() {
            match serde_json::from_str::<LogNode>(json) {
                Ok(node) => nodes.push(node),
                Err(e) => println!("[XML Parser] Error deserializing child {} of {}: {}", i, parent_id, e),
            }
        }
        println!("[XML Parser] get_node_children for parent_id '{}' returning {} nodes.", parent_id, nodes.len());
        Ok(nodes)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}


// We drop the legacy load logic for `.zst` chunks, we completely use DB cache!
fn parse_robot_xml_blocking(app: &tauri::AppHandle, xml_path: &str) -> Result<ParseResult, String> {
    let xml_file_name = Path::new(xml_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let db_cache_name = format!("{}_v4.db", xml_file_name);
    let cache_path = Path::new(xml_path).with_file_name(&db_cache_name);

    let xml_mtime = fs::metadata(xml_path).and_then(|m| m.modified()).ok();
    let cache_mtime = fs::metadata(&cache_path).and_then(|m| m.modified()).ok();

    let is_cache_valid = match (xml_mtime, cache_mtime) {
        (Some(xm), Some(cm)) => cm >= xm,
        _ => false,
    };

    if is_cache_valid && cache_path.exists() {
        println!("[XML Parser] Loading from DB cache: {:?}", cache_path);
        emit_progress(app, xml_path, "loading_tree", 90);
        
        let db = LogDb::new(&cache_path).map_err(|e| e.to_string())?;
        if let Ok(root_json) = db.get_root_suite() {
            if let Ok(root_suite) = serde_json::from_str::<LogNode>(&root_json) {
                return Ok(ParseResult {
                    db_path: cache_path.to_string_lossy().to_string(),
                    root_suite,
                });
            }
        }
        
        println!("[XML Parser] DB cache read failed, re-parsing");
    }

    // Always ensure we start with a clean Slate if we are re-parsing
    if cache_path.exists() {
        let _ = fs::remove_file(&cache_path);
    }

    emit_progress(app, xml_path, "parsing_xml", 10);
    println!("[XML Parser] Stream Parsing XML to SQLite: {:?}", xml_path);

    let base_dir = Path::new(xml_path).parent().unwrap_or(Path::new(".")).to_path_buf();
    
    // Perform parsing & stream insert!
    let root_suite = parse_robot_xml_sax_internal(app, xml_path, &cache_path, &base_dir)?;
    
    emit_progress(app, xml_path, "done", 100);
    println!("[XML Parser] XML Stream Parse complete");

    Ok(ParseResult {
        db_path: cache_path.to_string_lossy().to_string(),
        root_suite,
    })
}

struct KwState {
    args: Vec<String>,
    vars: Vec<String>,
    values: Vec<String>,
    flavor: String,
    condition: String,
    patterns: Vec<String>,
    variable: String,
}

fn parse_robot_xml_sax_internal(app: &tauri::AppHandle, xml_path: &str, db_path: &Path, base_dir: &Path) -> Result<LogNode, String> {
    let mut db = LogDb::new(db_path).map_err(|e| e.to_string())?;
    
    let file = fs::File::open(xml_path).map_err(|e| e.to_string())?;
    let mut reader = Reader::from_reader(BufReader::new(file));
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut stack: Vec<LogNode> = Vec::new();
    let mut root_suite: Option<SuiteNode> = None;
    
    let mut text_buffer = String::new();
    let mut kw_states: Vec<KwState> = vec![KwState { args: vec![], vars: vec![], values: vec![], flavor: "IN".into(), condition: "".into(), patterns: vec![], variable: "".into() }];
    
    let mut order_counter = 0;
    let mut node_counter = 0;
    let total_bytes = fs::metadata(xml_path).map(|m| m.len()).unwrap_or(1);
    let mut last_percent_reported = 10;
    
    let tx = db.begin_transaction().map_err(|e| e.to_string())?;

    loop {
        let current_pos = reader.buffer_position() as u64;
        let percent = 10 + ((current_pos * 80) / total_bytes) as u8; // Reserve 10 for init, 10 for completion
        if percent > last_percent_reported && percent <= 90 {
            emit_progress(app, xml_path, "mapping_structure", percent);
            last_percent_reported = percent;
        }

        match reader.read_event_into(&mut buf) {
            Err(e) => return Err(format!("Error at {} : {}", reader.buffer_position(), e)),
            Ok(Event::Eof) => break,

            Ok(event @ Event::Start(_)) | Ok(event @ Event::Empty(_)) => {
                let is_empty = matches!(event, Event::Empty(_));
                let e = match &event {
                    Event::Start(e) | Event::Empty(e) => e,
                    _ => unreachable!(),
                };
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                text_buffer.clear();

                match tag_name.as_str() {
                    "suite" | "test" | "kw" | "setup" | "teardown" | "for" | "while" | "if" | "try" | "iter" | "branch" | "break" | "continue" => {
                        if let Some(parent) = stack.last_mut() {
                            match parent {
                                LogNode::Suite(s) => s.has_children = true,
                                LogNode::Test(t) => t.has_children = true,
                                LogNode::Keyword(k) => k.has_children = true,
                                _ => {}
                            }
                        }
                    },
                    _ => {}
                }

                match tag_name.as_str() {
                    "suite" => {
                        let mut name = String::new();
                        let mut id = String::new();
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"name" { name = String::from_utf8_lossy(&attr.value).into_owned(); }
                            else if attr.key.as_ref() == b"id" { id = String::from_utf8_lossy(&attr.value).into_owned(); }
                        }
                        node_counter += 1;
                        if id.is_empty() { id = format!("suite-{}-{}", name, node_counter); }
                        else { id = format!("{}-{}", id, node_counter); }
                        
                        let suite = SuiteNode {
                            id, name, status: "PASS".to_string(), duration: "".to_string(),
                            children: Vec::new(), has_children: false, stats: Some(SuiteStats { passed: 0, failed: 0, skipped: 0 })
                        };
                        stack.push(LogNode::Suite(suite));
                    },
                    "test" => {
                        let mut name = String::new();
                        let mut id = String::new();
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"name" { name = String::from_utf8_lossy(&attr.value).into_owned(); }
                            else if attr.key.as_ref() == b"id" { id = String::from_utf8_lossy(&attr.value).into_owned(); }
                        }
                        node_counter += 1;
                        if id.is_empty() { id = format!("test-{}-{}", name, node_counter); }
                        else { id = format!("{}-{}", id, node_counter); }
                        
                        let test = TestNode {
                            id, name, status: "PASS".to_string(), duration: "".to_string(),
                            children: Vec::new(), has_children: false, failure_detail: None, logs: Vec::new()
                        };
                        stack.push(LogNode::Test(test));
                    },
                    "kw" | "setup" | "teardown" | "for" | "while" | "iter" | "branch" | "break" | "continue" => {
                        let mut name = String::new();
                        let mut id = String::new();
                        let mut kw_type = "keyword".to_string();
                        let mut st_flavor = String::from("IN");
                        let mut st_condition = String::new();
                        let mut st_variable = String::new();
                        let mut st_pattern = String::new();

                        for attr in e.attributes().flatten() {
                             if attr.key.as_ref() == b"name" { name = String::from_utf8_lossy(&attr.value).into_owned(); }
                             else if attr.key.as_ref() == b"id" { id = String::from_utf8_lossy(&attr.value).into_owned(); }
                             else if attr.key.as_ref() == b"type" { kw_type = String::from_utf8_lossy(&attr.value).into_owned(); }
                             else if attr.key.as_ref() == b"flavor" { st_flavor = String::from_utf8_lossy(&attr.value).into_owned(); }
                             else if attr.key.as_ref() == b"condition" { st_condition = String::from_utf8_lossy(&attr.value).into_owned(); }
                             else if attr.key.as_ref() == b"variable" { st_variable = String::from_utf8_lossy(&attr.value).into_owned(); }
                             else if attr.key.as_ref() == b"pattern" { st_pattern = String::from_utf8_lossy(&attr.value).into_owned(); }
                        }
                        node_counter += 1;
                        if id.is_empty() { id = format!("kw-{}-{}", name, node_counter); }
                        else { id = format!("{}-{}", id, node_counter); }
                        
                        let sub_type = if tag_name == "branch" {
                            match kw_type.as_str() {
                                t if t.eq_ignore_ascii_case("ELSE IF") => "else-if",
                                t if t.eq_ignore_ascii_case("ELSE") => "else",
                                t if t.eq_ignore_ascii_case("EXCEPT") => "except",
                                t if t.eq_ignore_ascii_case("FINALLY") => "finally",
                                t if t.eq_ignore_ascii_case("TRY") => "try",
                                _ => "if",
                            }.to_string()
                        } else {
                            match tag_name.as_str() {
                                "setup" => "setup", "teardown" => "teardown", "for" => "for",
                                "while" => "while", "iter" => "iteration",
                                "break" => "break", "continue" => "continue", _ => "keyword"
                            }.to_string()
                        };

                        kw_states.push(KwState { 
                            args: vec![], 
                            vars: vec![], 
                            values: vec![], 
                            flavor: st_flavor, 
                            condition: st_condition,
                            variable: st_variable,
                            patterns: if st_pattern.is_empty() { vec![] } else { vec![st_pattern] },
                        });

                        let kw = KeywordNode {
                            id, name, sub_type, status: "PASS".to_string(), duration: "".to_string(),
                            args: Vec::new(), screenshot_path: None, children: Vec::new(), has_children: false
                        };
                        stack.push(LogNode::Keyword(kw));
                    },
                    "status" => {
                        let mut status_val = String::from("PASS");
                        let mut start = String::new();
                        let mut end = String::new();
                        let mut elapsed_attr = String::new();
                        for attr in e.attributes().flatten() {
                             if attr.key.as_ref() == b"status" { status_val = String::from_utf8_lossy(&attr.value).into_owned(); }
                             else if attr.key.as_ref() == b"starttime" || attr.key.as_ref() == b"start" { start = String::from_utf8_lossy(&attr.value).into_owned(); }
                             else if attr.key.as_ref() == b"endtime" || attr.key.as_ref() == b"end" { end = String::from_utf8_lossy(&attr.value).into_owned(); }
                             else if attr.key.as_ref() == b"elapsed" { elapsed_attr = String::from_utf8_lossy(&attr.value).into_owned(); }
                        }
                        if status_val == "NOT RUN" { status_val = "NOT_RUN".to_string(); }
                        
                        let duration = format_duration(&elapsed_attr, &start, &end);

                        if let Some(top) = stack.last_mut() {
                            match top {
                                LogNode::Suite(s) => { s.status = status_val.clone(); s.duration = duration; },
                                LogNode::Test(t) => { t.status = status_val.clone(); t.duration = duration; },
                                LogNode::Keyword(k) => { k.status = status_val.clone(); k.duration = duration; },
                                _ => {}
                            }
                        }
                    },
                    _ => {}
                }

                if is_empty {
                    match tag_name.as_str() {
                        "status" | "arg" | "var" | "value" | "msg" | "pattern" => {}, 
                        "suite" | "test" | "kw" | "setup" | "teardown" | "for" | "while" | "iter" | "branch" | "break" | "continue" => {
                            if tag_name != "suite" && tag_name != "test" {
                                kw_states.pop();
                            }
                            if let Some(popped) = stack.pop() {
                                order_counter += 1;
                                let parent_id = stack.last().map(|p| p.id().to_string()).unwrap_or_default();
                                
                                let id = popped.id().to_string();
                                let node_type = match &popped { LogNode::Suite(_) => "suite", LogNode::Test(_) => "test", LogNode::Keyword(_) => "keyword", LogNode::Text(_) => "text" };
                                let json_payload = serde_json::to_string(&popped).unwrap();
                                
                                LogDb::insert_node(&tx, &id, &parent_id, node_type, &json_payload, order_counter).unwrap();

                                if let Some(parent) = stack.last_mut() {
                                    append_child_stats(parent, &popped);
                                } else if let LogNode::Suite(s) = popped {
                                    root_suite = Some(s);
                                }
                            }
                        },
                        _ => {}
                    }
                }
            },

            Ok(Event::Text(e)) => {
                let text_str = String::from_utf8_lossy(e.as_ref());
                if let Ok(unescaped) = quick_xml::escape::unescape(&text_str) {
                    text_buffer.push_str(unescaped.as_ref());
                } else {
                    text_buffer.push_str(&text_str);
                }
            },
            
            Ok(Event::End(e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                
                match tag_name.as_str() {
                    "suite" | "test" | "kw" | "setup" | "teardown" | "for" | "while" | "iter" | "branch" | "break" | "continue" => {
                        let mut state = None;
                        if tag_name != "suite" && tag_name != "test" {
                            state = kw_states.pop();
                        }

                        match tag_name.as_str() {
                            "arg" => if let Some(st) = kw_states.last_mut() { st.args.push(text_buffer.clone()); },
                            "var" => if let Some(st) = kw_states.last_mut() { st.vars.push(text_buffer.clone()); },
                            "value" => if let Some(st) = kw_states.last_mut() { st.values.push(text_buffer.clone()); },
                            "pattern" => if let Some(st) = kw_states.last_mut() { st.patterns.push(text_buffer.clone()); },
                            _ => {}
                        }

                        if let Some(mut popped) = stack.pop() {
                             if let LogNode::Keyword(k) = &mut popped {
                                 if let Some(st) = state {
                                     let mut args = st.args;
                                     let condition_empty = st.condition.is_empty();
                                     if !condition_empty {
                                        args.push(st.condition);
                                     } 
                                     
                                     // ESPECIAL CASE: EXCEPT branch attributes
                                     if k.sub_type == "except" {
                                         if !st.patterns.is_empty() {
                                             args.push(format!("pattern: {}", st.patterns.join(", ")));
                                         }
                                         if !st.variable.is_empty() {
                                             args.push(format!("AS {}", st.variable));
                                         }
                                     }

                                     if !st.vars.is_empty() {
                                         if k.sub_type == "for" {
                                             if !st.values.is_empty() {
                                                 args.push(format!("{} {} {}", st.vars.join(", "), st.flavor, st.values.join(", ")));
                                             }
                                         } else {
                                             args.push(st.vars.join(", "));
                                         }
                                     } else if !st.values.is_empty() && condition_empty {
                                         args.push(st.values.join(", "));
                                     }
                                     k.args = process_resolved_args(&k.children, args);
                                 }
                             }

                             // Since we store children dynamically, empty it before saving!
                             popped.clear_children();

                             order_counter += 1;
                             let parent_id = stack.last().map(|p| p.id().to_string()).unwrap_or_default();
                             let id = popped.id().to_string();
                             let node_type = match &popped { LogNode::Suite(_) => "suite", LogNode::Test(_) => "test", LogNode::Keyword(_) => "keyword", LogNode::Text(_) => "text" };
                             
                             let json_payload = serde_json::to_string(&popped).unwrap();
                             LogDb::insert_node(&tx, &id, &parent_id, node_type, &json_payload, order_counter).unwrap();

                             if let Some(parent) = stack.last_mut() {
                                 append_child_stats(parent, &popped);
                             } else if let LogNode::Suite(s) = popped {
                                 if root_suite.is_none() {
                                     root_suite = Some(s);
                                 }
                             }
                        }
                    },
                    "status" => {
                         let msg = clean_message(text_buffer.trim());
                         if !msg.is_empty() {
                             for node in stack.iter_mut().rev() {
                                 if let LogNode::Test(t) = node {
                                     if t.status == "FAIL" {
                                         if let Some(fail) = &mut t.failure_detail {
                                             fail.message = msg.clone();
                                         } else {
                                             t.failure_detail = Some(FailureDetail { message: msg.clone(), screenshot_path: None });
                                         }
                                     }
                                     break;
                                 }
                             }
                         }
                    },
                    "msg" => {
                        let text = clean_message(text_buffer.trim());
                        if !text.is_empty() {
                            let mut screenshot = None;
                            if text.contains("src=") {
                                if let Some(caps) = RE_SRC.captures(&text) {
                                    screenshot = Some(caps[1].to_string());
                                }
                            }

                            if let Some(src) = screenshot {
                                let abs_src = resolve_screenshot_path(&src, &base_dir);
                                let mut assigned_kw = false;
                                for node in stack.iter_mut().rev() {
                                    match node {
                                        LogNode::Keyword(k) => { 
                                            // Assign only to the innermost keyword
                                            if !assigned_kw {
                                                k.screenshot_path = Some(abs_src.clone()); 
                                                assigned_kw = true;
                                            }
                                        },
                                        LogNode::Test(t) => {
                                            if let Some(fail) = &mut t.failure_detail {
                                                fail.screenshot_path = Some(abs_src.clone());
                                            } else {
                                                t.failure_detail = Some(FailureDetail { message: "".to_string(), screenshot_path: Some(abs_src.clone()) });
                                            }
                                            break; 
                                        },
                                        _ => {}
                                    }
                                }
                            }

                            if !text.contains("src=") {
                                if let Some(parent) = stack.last_mut() {
                                    let c = TextNode { id: format!("msg-{}", rand::random::<u32>()), content: text, is_system: false };
                                    
                                    order_counter += 1;
                                    let node_enum = LogNode::Text(c);
                                    let json_payload = serde_json::to_string(&node_enum).unwrap();
                                    LogDb::insert_node(&tx, node_enum.id(), parent.id(), "text", &json_payload, order_counter).unwrap();

                                    append_child_stats(parent, &node_enum);
                                }
                            }
                        }
                    },
                    "arg" => { if let Some(st) = kw_states.last_mut() { st.args.push(text_buffer.clone()); } },
                    "var" => { if let Some(st) = kw_states.last_mut() { st.vars.push(text_buffer.clone()); } },
                    "value" => { if let Some(st) = kw_states.last_mut() { st.values.push(text_buffer.clone()); } },
                    _ => {}
                }
                text_buffer.clear();
            },
            Ok(_) => {}
        }
        buf.clear();
    }
    
    tx.commit().map_err(|e| e.to_string())?;

    match root_suite {
        Some(s) => Ok(LogNode::Suite(s)),
        None => Err("No valid suite found in XML".to_string())
    }
}

#[allow(dead_code)]
fn get_node_status(node: &LogNode) -> String {
    match node {
        LogNode::Suite(s) => s.status.clone(),
        LogNode::Test(t) => t.status.clone(),
        LogNode::Keyword(k) => k.status.clone(),
        LogNode::Text(_) => "PASS".to_string(),
    }
}

impl LogNode {
    fn clear_children(&mut self) {
        match self {
            LogNode::Suite(s) => { s.children.clear(); },
            LogNode::Test(t) => { t.children.clear(); },
            LogNode::Keyword(k) => { k.children.clear(); },
            _ => {}
        }
    }
}

fn append_child_stats(parent: &mut LogNode, child: &LogNode) {
    let mut pass_inc = 0;
    let mut fail_inc = 0;
    let mut skip_inc = 0;

    match child {
        LogNode::Test(t) => {
            if t.status == "PASS" { pass_inc = 1; }
            else if t.status == "FAIL" { fail_inc = 1; }
            else { skip_inc = 1; }
        },
        LogNode::Suite(s) => {
            if let Some(stats) = &s.stats {
                pass_inc = stats.passed;
                fail_inc = stats.failed;
                skip_inc = stats.skipped;
            }
        },
        _ => {}
    }

    match parent {
        LogNode::Suite(s) => { 
            s.has_children = true;
            if let Some(stats) = &mut s.stats {
                stats.passed += pass_inc;
                stats.failed += fail_inc;
                stats.skipped += skip_inc;
            }
        },
        LogNode::Test(t) => { t.has_children = true; },
        LogNode::Keyword(k) => { k.has_children = true; },
        _ => {}
    }
}

fn process_resolved_args(children: &[LogNode], args: Vec<String>) -> Vec<String> {
    let mut resolved_args = args.clone();
    for child in children {
        if let LogNode::Text(txt) = child {
            if txt.content.starts_with("Arguments: [") {
                let msg_text = &txt.content;
                if let (Some(open), Some(close)) = (msg_text.find('['), msg_text.rfind(']')) {
                    let inner = &msg_text[open + 1..close].trim();
                    let parts = inner.split(" | ");
                    let mut resolved_map = std::collections::HashMap::new();
                    for p in parts {
                        if let Some(eq_idx) = p.find('=') {
                            let kv_name = p[0..eq_idx].trim();
                            let kv_val = p[eq_idx + 1..].trim();
                            resolved_map.insert(kv_name, kv_val);
                        }
                    }

                    for arg in resolved_args.iter_mut() {
                        if let Some(val) = resolved_map.get(arg.as_str()) {
                            let mut clean_val = val.to_string();
                            if (clean_val.starts_with('\'') && clean_val.ends_with('\''))
                                || (clean_val.starts_with('\"') && clean_val.ends_with('\"'))
                            {
                                if clean_val.len() >= 2 {
                                    clean_val = clean_val[1..clean_val.len() - 1].to_string();
                                }
                            }
                            *arg = format!("{} = {}", arg, clean_val);
                        }
                    }
                }
            }
        }
    }
    resolved_args
}

fn format_duration(elapsed: &str, start: &str, end: &str) -> String {
    if !elapsed.is_empty() {
        if let Ok(total) = elapsed.parse::<f64>() {
            return format_formatted_seconds(total);
        }
    }
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

fn resolve_screenshot_path(src: &str, base_dir: &Path) -> String {
    if src.starts_with("data:image") {
        return src.to_string();
    }
    let clean_src = if src.starts_with("./") { &src[2..] } else { &src };
    let clean_src = clean_src.replace('\\', "/");
    base_dir.join(&clean_src).to_string_lossy().to_string()
}

fn clean_message(txt: &str) -> String {
    if txt.len() > 10 && txt.to_lowercase().contains("xml") && txt.to_lowercase().contains("hierarchy") {
        RE_HIERARCHY.replace_all(txt, "").trim().to_string()
    } else {
        txt.trim().to_string()
    }
}
