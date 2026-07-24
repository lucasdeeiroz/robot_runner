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
