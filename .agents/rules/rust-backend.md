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
6. **Identificação de Dispositivos (ADB)**: NUNCA confie na saída bruta do comando `adb devices -l` para extrair o modelo do dispositivo (pois pode falhar ou truncar dados, ex: falha ao identificar modelos como S21). Sempre faça a listagem de IDs via `adb devices` e depois execute `adb -s <id> shell getprop ro.product.model` (e `ro.product.manufacturer`) para obter metadados 100% confiáveis.
7. **Otimização de Banco de Dados (SQLite)**: Ao realizar inserções em lote (bulk inserts) em loops extensos (como parsing de arquivos de logs com milhares de entradas), **NUNCA** utilize o método `tx.execute` ou `conn.execute` repetindo a string da consulta SQL dentro do laço de repetição. Isso destrói a performance forçando a compilação da query a cada iteração. Você deve criar um **Prepared Statement** uma única vez *antes* do loop (`let mut stmt = tx.prepare(...)?`) e usar `stmt.execute(params![...])?` para reciclar o statement dentro do laço.
8. **Parsing de Output do ADB**: Ao interpretar retornos de comandos em lote do ADB no terminal (como a listagem de `adb devices`), **SEMPRE** utilize condicionais para descartar lixo gerado pelo ciclo de vida do daemon do ADB. Linhas que contenham `* daemon not running`, `* daemon started successfully` ou `adb server` frequentemente poluem o stdout e causam falhas graves no parsing ou injetam "dispositivos fantasmas". Utilize algo como `if line.starts_with('*') || line.starts_with("adb server") { continue; }`.