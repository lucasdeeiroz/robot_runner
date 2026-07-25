# Robot Runner Companion Integration Rules

Você está desenvolvendo ou dando manutenção nas integrações entre o **Robot Runner Desktop (Tauri/Rust/React)** e o **Robot Runner Companion (Android/Kotlin)**.

As seguintes diretrizes arquiteturais e técnicas são estritamente obrigatórias para garantir máxima performance, resiliência e estabilidade:

---

## 1. Arquitetura de Ponte e Fallback Silencioso (Dual-Bridge)
- **Companion como Primário**: A comunicação via Companion (porta HTTP local `9876` encaminhada via ADB forward `tcp:9876 tcp:9876`) deve SEMPRE ser a primeira tentativa para busca de árvore de UI e estatísticas.
- **ADB como Fallback Silencioso**: Se o Companion estiver ausente, desativado ou falhar em responder, o sistema DEVE alternar silenciosamente e sem travamentos para os comandos legados do ADB (`uiautomator dump`, `screencap`).

---

## 2. Otimização de Micro-Timeouts (Host IPC Latency)
- **Timeouts Curtos de TCP (150ms a 1000ms)**: As requisições HTTP do Rust (`reqwest`) direcionadas ao Companion (`http://127.0.0.1:9876`) NUNCA devem usar timeouts longos padrão (como 5s ou 10s).
- **Justificativa**: A comunicação é via `localhost` sobre socket USB TCP. Se a ponte estiver ativa, a resposta chega em <10ms. Se estiver inativa, o Rust deve falhar em no máximo **1000ms** para não acumular atraso no fallback para o ADB.

---

## 3. Compatibilidade com Android 16, One UI 8.5 e Dispositivos POS
- **Resolução de Nó Raiz (`windows` List Traversal)**: No Android 14/15/16 com interfaces modificadas (Samsung One UI, Xiaomi HyperOS, DeX, Maquininhas POS), `rootInActiveWindow` pode retornar `null` se houver overlays ativas (painel Edge, teclado IME, barra de gestos).
- **Regra**: A extração da árvore de acessibilidade no Kotlin DEVE obrigatoriamente iterar a lista `accessibilityService.windows` buscando a janela focada caso `rootInActiveWindow` seja nulo.

---

## 4. Otimização de Payload de Imagem e Downscaling
- **Captura Leve de 720p**: Nunca force a transmissão de PNGs brutos em resolução total de dispositivos 4K/2K (ex: Galaxy S25 Ultra 1440x3120 gerar 15MB por frame).
- **Regra**: Utilize o endpoint de captura rápida `/screenshot/fast` que realiza downscaling em memória dentro do dispositivo para largura máxima de `720px` com compressão JPEG de 60% (~30KB por frame), reduzindo a carga de rede e CPU em **400x**.

---

## 5. Perfil de Compilação Rust (`Cargo.toml`)
- **Compilação Otimizada de Dependências**: O parsing e decodificação de imagem em Rust (crate `image`) em modo de desenvolvimento (`npm run tauri dev`) sem otimização LLVM adiciona um atraso de ~3.000ms.
- **Regra**: O arquivo `src-tauri/Cargo.toml` DEVE sempre manter a diretiva:
  ```toml
  [profile.dev.package."*"]
  opt-level = 3
  ```
  Isso garante que bibliotecas de imagem e descompressão executem em velocidade nativa (C/Assembly) mesmo durante o desenvolvimento.

---

## 6. Habilitação Autônoma de Serviços via ADB
- **Concessão Transparente de Permissões**: O usuário não deve ser obrigado a abrir manualmente as configurações do Android para ativar o serviço de acessibilidade do Companion.
- **Regra**: Sempre que um dispositivo com Companion instalado for selecionado, a aplicação DEVE executar via ADB no Rust:
  ```bash
  settings put secure enabled_accessibility_services com.robotrunner.companion/.service.CompanionAccessibilityService
  settings put secure accessibility_enabled 1
  ```

---

## 7. Telemetria de Hardware com Zero Overhead no Host PC
- **Eliminação de Subprocessos `adb.exe`**: A consulta periódica de CPU, RAM e Bateria a cada 3 segundos via `adb shell top` ou `dumpsys` gera alto consumo de CPU no Windows.
- **Regra**: O sistema DEVE consultar prioritariamente o endpoint HTTP `/telemetry` do Companion no Rust (`get_device_stats_internal`). O Companion extrai a telemetria em RAM localmente no dispositivo, reduzindo o overhead de CPU do computador host a **0%** e entregando o payload JSON em **<10ms**.

---

## 8. Telemetria Híbrida para Pacientes e Sandbox do Android (SELinux)
- **Isolamento de Processos Unprivileged**: O Companion (app Android regular) tem permissão total para ler telemetria global de hardware (RAM total/usada, nível e temperatura de bateria, status de carregamento e atividade em primeiro plano). No entanto, devido às restrições do SELinux/Android Sandbox, um processo de app não possui privilégios de sistema (`android.permission.DUMP`) nem visibilidade de `pidof`/procfs para consultar PIDs e `gfxinfo` de **pacientes de terceiros** (ex: `com.positivo.casainteligente`).
- **Regra da Ponte Híbrida**: O Rust (`stats.rs`) consulta primeiro o Companion via HTTP `/telemetry`. Se o app alvo for de terceiros e o Companion retornar métricas de app nulas/zeradas (ou se a CPU global reportar `0%` devido a bloqueios de procfs em Knox/Android 16), o backend Rust deve complementar **unicamente** as métricas ausentes (CPU global e `app_stats` por pacote) disparando uma chamada leve do ADB (`top -b -n 1 && dumpsys meminfo <pkg> && dumpsys gfxinfo <pkg> && pidof <pkg>`), mantendo o payload consolidado como `telemetry_source: "companion"`.

---

## 9. Motor de Benchmark TTI & Deltas de Frame de Hardware (Fase 8)
- **Captura Nível Hardware de Redraw**: O `CompanionAccessibilityService` escuta os eventos `TYPE_WINDOW_CONTENT_CHANGED` (redesenho de tela) e `TYPE_VIEW_CLICKED` (toque na interface).
- **Regra do TTI de Precisão**: O tempo de resposta da interface (TTI / Time to Interactive) é calculado no Kotlin pela diferença em milissegundos entre `lastTouchTimestamp` e `lastRedrawTimestamp`, sem sofrer latências de cabo USB ou transporte ADB. O Rust consulta `/frame-delta` e expõe a métrica para o `StopwatchSubTab.tsx`, fornecendo benchmarks reais de hardware (`🎯 Hardware TTI: +Xms`).

---

## 10. Gerenciamento Híbrido de Aplicativos e Ícones Nativos (Fase 9)
- **Extração Nativa em RAM (<15ms)**: O Companion consulta diretamente o `PackageManager` no dispositivo e retorna a lista de apps instalados (`/apps`) com nomes legíveis (Labels), versões e status em **<15ms**, eliminando chamadas demoradas de `dumpsys package`.
- **Permissão `QUERY_ALL_PACKAGES`**: O `AndroidManifest.xml` do Companion DEVE manter a permissão `<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />` para contornar a restrição de visibilidade de pacotes do Android 11+ (API 30+).
- **Ícones Nativos em Base64**: O endpoint `/app/icon?package=<pkg>` extrai a `Drawable` nativa, realiza downscaling otimizado para `96x96px` e retorna a string Data URL PNG (`data:image/png;base64,...`) em RAM para renderização instantânea no `AppsSubTab.tsx`.

---

## 11. Pareamento Wireless e Dashboard de Frota (Fase 10)
- **Endpoint HTTP `/device/info`**: O Companion expõe metadados de rede, IP da interface `wlan0`, nível de bateria, temperatura °C, estado de carregamento e RAM disponível em um único payload JSON de **<10ms**.
- **Pareamento ADB Wireless (Android 11+)**: O backend Rust oferece `adb_pair_device` que auto-executa `adb pair IP:PORT CODE` seguido de `adb connect IP:PORT` sem necessidade de cabo USB.
- **Painel Fleet Health**: O `HomeSubTab.tsx` consulta periodicamente `get_fleet_health` em Rust para apresentar o status de saúde consolidado (Companion 🟢/🟡/⚪, Bateria %, Temp °C, IP Wi-Fi e RAM) de todos os dispositivos conectados na frota.




