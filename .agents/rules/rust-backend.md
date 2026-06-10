---
trigger: always_on
---

# Rust Backend (Tauri) Rules

Você está editando o backend em Rust do Robot Runner AI.

1. **Async por Padrão**: Comandos de sistema (ADB, ngrok, shell) e operações de IO pesado (parsing de XML de logs) DEVEM ser feitos de forma assíncrona (`async fn` usando `tokio`) para não travar a Thread Principal (UI) do Tauri.
2. **Tratamento de Erros**: NUNCA utilize `.unwrap()` ou `.expect()` indiscriminadamente. Todo comando Tauri deve retornar `Result<T, String>` ou um `Error` serializável. Intercepte falhas graciosamente.
3. **Eventos Tauri (Streaming)**: Se uma operação gerar uma grande quantidade de dados (ex: Logcat ao vivo, progresso de automação, parsing de arquivos de log massivos), NÃO retorne um mega payload via `invoke`. Em vez disso, use `app_handle.emit()` para transmitir os dados em chunks/streams para o Frontend.
4. **Paths Multiplataforma**: Ao montar caminhos de arquivos (`PathBuf`), certifique-se de que são compatíveis com Windows, Linux e macOS, especialmente na manipulação do `Automation Root` e arquivos `.robot`.
5. **Idioma**: Todo o código, nomes de variáveis e comentários em Rust DEVEM ser escritos em Inglês (US). Explicações e discussões devem ser diretas ao ponto.