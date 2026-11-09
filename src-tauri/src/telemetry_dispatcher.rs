use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TelemetryPayload {
    pub evento: String,
    pub timestamp: String,
    pub duracao_ms: Option<u64>,
    pub status: Option<String>,
    pub total_testes: Option<u32>,
    pub testes_pass: Option<u32>,
    pub testes_fail: Option<u32>,
    pub testes_manual: Option<u32>,
    pub tags: Option<HashMap<String, String>>,
    pub metadados: Option<serde_json::Value>,
}

#[command]
pub async fn dispatch_telemetry_event(
    endpoint_url: String,
    headers: Option<HashMap<String, String>>,
    payload: serde_json::Value,
) -> Result<bool, String> {
    if endpoint_url.trim().is_empty() {
        return Ok(false);
    }

    tokio::spawn(async move {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build();

        let client = match client {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[Telemetry Dispatcher] Failed to build HTTP client: {}", e);
                return;
            }
        };

        let mut req = client.post(&endpoint_url);

        if let Some(hdrs) = headers {
            for (k, v) in hdrs {
                req = req.header(&k, &v);
            }
        }

        match req.json(&payload).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    eprintln!("[Telemetry Dispatcher] Event successfully dispatched to {}", endpoint_url);
                } else {
                    eprintln!(
                        "[Telemetry Dispatcher] Server responded with error status: {} for {}",
                        resp.status(),
                        endpoint_url
                    );
                }
            }
            Err(e) => {
                eprintln!(
                    "[Telemetry Dispatcher] Failed to send telemetry event to {}: {}",
                    endpoint_url, e
                );
            }
        }
    });

    Ok(true)
}
