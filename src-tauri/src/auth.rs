use crate::errors::AppResult;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;
use tauri::{command, AppHandle, Runtime, Emitter};
use url::Url;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthResponse {
    pub code: String,
}

#[command]
pub async fn start_auth_server<R: Runtime>(
    handle: AppHandle<R>,
) -> AppResult<()> {
    // We run the server in a separate thread so it doesn't block the command
    // and we can emit the port back to the frontend immediately.
    
    std::thread::spawn(move || {
        match TcpListener::bind("127.0.0.1:0") {
            Ok(listener) => {
                let port = listener.local_addr().unwrap().port();
                let _ = listener.set_nonblocking(true);
                
                // Tell the frontend we are ready and on which port
                let _ = handle.emit("auth-server-ready", port);

                let start_time = std::time::Instant::now();
                let timeout_duration = std::time::Duration::from_secs(300); // 5 minutes
                
                loop {
                    if start_time.elapsed() > timeout_duration {
                        let _ = handle.emit("auth-error", "Tempo esgotado aguardando autenticação (5 min).");
                        return;
                    }

                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                            let mut buffer = [0; 2048];
                            
                            if let Ok(n) = stream.read(&mut buffer) {
                                let request = String::from_utf8_lossy(&buffer[..n]);
                                if let Some(line) = request.lines().next() {
                                    if let Some(url_part) = line.split_whitespace().nth(1) {
                                        let full_url = format!("http://localhost{}", url_part);
                                        if let Ok(parsed_url) = Url::parse(&full_url) {
                                            let query_params: std::collections::HashMap<_, _> = parsed_url.query_pairs().into_owned().collect();
                                            
                                            if let Some(code) = query_params.get("code") {
                                                // Response to browser
                                                let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n\
                                                    <html>\
                                                    <body style='font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #121212; color: white;'>\
                                                        <h1 style='color: #4CAF50;'>Autenticação Concluída!</h1>\
                                                        <p>Você pode fechar esta janela agora.</p>\
                                                        <script>setTimeout(() => window.close(), 1000);</script>\
                                                    </body>\
                                                    </html>";
                                                let _ = stream.write_all(response.as_bytes());
                                                let _ = stream.flush();

                                                let _ = handle.emit("auth-code-received", AuthResponse { code: code.clone() });
                                                return;
                                            }
                                        }
                                    }
                                }
                            }
                            let _ = handle.emit("auth-error", "Requisição inválida ou sem código.");
                            return;
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(std::time::Duration::from_millis(200));
                            continue;
                        }
                        Err(e) => {
                            let _ = handle.emit("auth-error", format!("Erro na conexão: {}", e));
                            return;
                        }
                    }
                }
            }
            Err(e) => {
                let _ = handle.emit("auth-error", format!("Erro ao iniciar servidor: {}", e));
            }
        }
    });

    Ok(())
}
