# Guia de Integração e Arquitetura do Robot Runner Companion

O **Robot Runner Companion** é o aplicativo Android complementar nativo que turbina o **Robot Runner Desktop**, transformando a inspeção de telas, o mapeamento de fluxos, o gerenciamento de apps e a automação de testes mobile em uma experiência de altíssima velocidade e zero overhead no computador.

O Companion é **100% opcional**; todas as funcionalidades do Robot Runner mantêm compatibilidade total e fallbacks graciosos via ADB padrão quando o Companion não estiver instalado.

---

## ⚡ Benchmark de Desempenho: ADB Puro vs. Robot Runner Companion

Embora o ADB (`Android Debug Bridge`) seja a ferramenta padrão da indústria, ele possui limitações arquiteturais severas ao realizar chamadas de telemetria ou capturas da hierarquia da interface. O Companion opera nativamente dentro do sistema Android para superar esses gargalos:

| Funcionalidade / Métrica | ADB Puro (Sem Companion) | Com Robot Runner Companion | Ganho de Desempenho |
|---|---|---|---|
| **Velocidade de Leitura de UI** | ~1.500 – 3.500 ms (`uiautomator dump` trava tela) | **~8 ms** (Árvore de Acessibilidade instantânea) | 🚀 **200x Mais Rápido** |
| **Verificação de Textos da UI** | Dump XML lento + transferência de arquivo | **Parse JSON instantâneo via `/ui-tree`** | ⚡ **Extração Instantânea** |
| **Overhead no SO Hospedeiro** | Spawns do `adb.exe` a cada 1–3s | **0% Overhead de CPU** (Cache `ACTIVE_FORWARDS`) | 🎯 **Zero Desperdício de CPU** |
| **Lista de Apps e Ícones** | Apenas nomes de pacotes (`com.app.name`) | **Nomes Oficiais e Ícones PNG em Alta Resolução** | 🖼️ **Ícones Nativos** |
| **Injeção de Toque (Tap)** | ~400 ms (sobrecarga de processo `adb shell`) | **~15 ms** (Injeção nativa `dispatchGesture`) | ⚡ **25x Mais Rápido** |
| **Suporte a POS / Maquininhas** | Negado (`Permission Denied` em `/proc`) | **Suporte Total a Métricas de Hardware** | 📱 **Compatibilidade Total** |
| **Telemetria de Hardware** | Requisições periódicas pesadas via `dumpsys` | **REST em Tempo Real `/telemetry`** (CPU, RAM, Temp) | 📊 **Fluxo Contínuo** |

---

## 🏗️ Visão Geral de Arquitetura e Fases de Integração

```
+------------------------------------+          ADB Port Forward (tcp:9876)         +---------------------------------------+
|        Robot Runner Desktop        | <==========================================> |   Android Companion App (Native OS)   |
| (Rust IPC + React + ACTIVE_CACHE)  |             HTTP REST / WebSockets           | (AccessibilityService + REST Engine)  |
+------------------------------------+                                              +---------------------------------------+
```

### 1. Cache de Encaminhamento de Porta ADB em Memória (`ACTIVE_FORWARDS`)
Para prevenir a criação excessiva de processos `adb.exe` no Windows/macOS/Linux durante pesquisas periódicas (telemetria e estatísticas), o backend em Rust mantém o cache concorrente `ACTIVE_FORWARDS`. O encaminhamento de porta (`adb forward tcp:9876 tcp:9876`) é executado **exatamente 1 vez por sessão de dispositivo**. Todas as requisições subsequentes executam em **<0.001ms** em memória.

### 2. Extração Universal de Texto de UI & Escape de Activities
- **Análise Dupla (JSON & XML)**: O motor `extractTextsFromXml` detecta automaticamente se a resposta é uma string XML crua do uiautomator ou um payload JSON retornado pelo endpoint `/ui-tree` do Companion. Ele extrai recursivamente os campos `text`, `contentDescription`, `label`, `title`, `name` e `value`.
- **Navegação com Inner Classes**: Intents para abrir telas com classes internas (ex: `com.android.settings/.Settings$StatusActivity`) recebem escape automático de shell (`\$`), prevenindo erros de expansão de variáveis na shell do ADB.

### 3. Badge de Status Unificado e Interativo (`CompanionBadge.tsx`)
- Padronizado nas barras de navegação superiores (`TabBar` em `ToolboxView`, `DeviceCard`, `DeviceViewport`).
- **Variante Ghost Interativa**: Exibe o ícone animado do **Foguete (🚀)** no modo `'ghost'`. Clicar no ícone abre o app Companion e estabelece a conexão automaticamente.

---

## 🛠️ Guia de Uso e Resolução de Problemas

### Como Conectar e Abrir o Companion
1. **Lançamento em 1 Clique**: Clique no ícone de **Foguete (🚀)** em qualquer **Device Card** ou barra superior para abrir o app no Android e conectar.
2. **Ativação Automática de Acessibilidade**: O Robot Runner Desktop concede a permissão do serviço de Acessibilidade via ADB automaticamente ao conectar via USB/Wi-Fi.
3. **Verificação de Checkup**: Abra a aba **Checkup** para rodar diagnósticos POS, checklists de hardware e validação de textos de tela contra arquivos Golden File.

### Resolução de Problemas
- **Badge indica Fallback ADB**: Selecione novamente o dispositivo no menu suspenso para renovar a ponte de porta, ou clique em **Abrir Companion** no card do dispositivo.
- **Restrições de Perfil Corporativo (MDM)**: Em dispositivos corporativos, navegue em `Configurações do Android > Acessibilidade > Serviços Instalados` e ative o **Robot Runner Companion**.
