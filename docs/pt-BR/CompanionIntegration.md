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
| **Overhead no SO Hospedeiro** | Spawns do `adb.exe` a cada 1–3s | **0% Overhead de CPU** (Cache de sessão por dispositivo em Rust) | 🎯 **Zero Desperdício de CPU** |
| **Lista de Apps e Ícones** | Apenas nomes de pacotes (`com.app.name`) | **Nomes Oficiais e Ícones PNG em Alta Resolução** | 🖼️ **Ícones Nativos** |
| **Injeção de Toque (Tap)** | ~400 ms (sobrecarga de processo `adb shell`) | **~15 ms** (Injeção nativa `dispatchGesture`) | ⚡ **25x Mais Rápido** |
| **Suporte a POS / Maquininhas** | Negado (`Permission Denied` em `/proc`) | **Suporte Total a Métricas de Hardware** | 📱 **Compatibilidade Total** |
| **Telemetria de Hardware** | Requisições periódicas pesadas via `dumpsys` | **REST em Tempo Real `/telemetry`** (CPU, RAM, Temp) | 📊 **Fluxo Contínuo** |

---

## 🏗️ Visão Geral de Arquitetura e Fases de Integração

```
+------------------------------------+   ADB forward per device: tcp:19876-19975 -> tcp:9876    +---------------------------------------+
|        Robot Runner Desktop        | <======================================================> |   Android Companion App (Native OS)   |
| (Rust gateway + per-device ports)  |              HTTP REST + X-RR-Token header               | (A11y Service + REST on 127.0.0.1)    |
+------------------------------------+                                                          +---------------------------------------+
```

### 1. Encaminhamento de Porta ADB por Dispositivo (Cache de Sessão em Memória)
Cada dispositivo conectado recebe **sua própria porta local** no desktop, escolhida na faixa **19876–19975** e encaminhada para a porta **9876** do Companion naquele dispositivo (`adb -s <serial> forward tcp:<porta_local> tcp:9876`). Como cada dispositivo tem uma porta local dedicada, **vários dispositivos podem usar o Companion ao mesmo tempo sem conflito**.

Para prevenir a criação excessiva de processos `adb.exe` no Windows/macOS/Linux durante pesquisas periódicas (telemetria e estatísticas), o backend em Rust mantém em memória, de forma concorrente, uma sessão por dispositivo (porta local + token de sessão). O encaminhamento é criado **exatamente 1 vez por sessão de dispositivo**; todas as requisições seguintes o reutilizam sem disparar novos processos `adb.exe`.

### 2. Extração Universal de Texto de UI & Escape de Activities
- **Análise Dupla (JSON & XML)**: O motor `extractTextsFromXml` detecta automaticamente se a resposta é uma string XML crua do uiautomator ou um payload JSON retornado pelo endpoint `/ui-tree` do Companion. Ele extrai recursivamente os campos `text`, `contentDescription`, `label`, `title`, `name` e `value`.
- **Navegação com Inner Classes**: Intents para abrir telas com classes internas (ex: `com.android.settings/.Settings$StatusActivity`) recebem escape automático de shell (`\$`), prevenindo erros de expansão de variáveis na shell do ADB.

### 3. Badge de Status Unificado e Interativo (`CompanionBadge.tsx`)
- Padronizado nas barras de navegação superiores (`TabBar` em `ToolboxView`, `DeviceCard`, `DeviceViewport`).
- **Variante Ghost Interativa**: Exibe o ícone animado do **Foguete (🚀)** no modo `'ghost'`. Clicar no ícone abre o app Companion e estabelece a conexão automaticamente.

### 4. Segurança e Endurecimento do Transporte
- **Servidor apenas em loopback**: O servidor HTTP do Companion escuta somente no loopback do dispositivo (`127.0.0.1:9876`). Ele **não é acessível** pelo IP Wi-Fi/LAN do aparelho; a única entrada é o encaminhamento ADB criado pelo desktop.
- **Token por sessão**: A cada sessão de dispositivo, o desktop gera um token aleatório e o entrega ao Companion via `adb shell am broadcast ... START_SERVER --es AUTH_TOKEN <token>`. Toda requisição (exceto `GET /ping`) deve enviá-lo no cabeçalho `X-RR-Token`; requisições sem token válido são rejeitadas.
- **Receiver protegido**: O broadcast receiver que inicia/para o servidor é protegido pela permissão `android.permission.DUMP`, que o usuário do `adb shell` possui mas apps comuns não, impedindo que outros apps do aparelho iniciem o servidor ou injetem um token.
- **Sem CORS / acesso só pelo backend**: O CORS foi removido. O desktop conversa com o Companion **somente a partir do backend em Rust** (nunca diretamente da interface web).
- **Serviços de acessibilidade preservados**: Ao habilitar o serviço de acessibilidade do Companion, o Robot Runner o **acrescenta** à lista de serviços já habilitados. O TalkBack e qualquer outro serviço ativo continuam ligados.
- **Limites do timeout de inatividade**: O timeout de inatividade do servidor é limitado entre **60 e 3600 segundos**.
- **Varredura de frota na LAN desativada**: A busca P2P por outros dispositivos com Companion na rede local está desativada; `/fleet/peers` sempre retorna uma lista vazia.
- **Regras das receitas de firmware**: Nas receitas de firmware customizado, regras `shell` só permitem `getprop [chave]`, e regras `reflection` só permitem getters/campos estáticos de `android.os.Build`, `android.os.Build$VERSION` e `android.os.SystemProperties`. Qualquer outra regra é rejeitada e o valor recorre a `fallbackProps` / `defaultValue`.

---

## 🛠️ Guia de Uso e Resolução de Problemas

### Como Conectar e Abrir o Companion
1. **Lançamento em 1 Clique**: Clique no ícone de **Foguete (🚀)** em qualquer **Device Card** ou barra superior para abrir o app no Android e conectar.
2. **Ativação Automática de Acessibilidade**: O Robot Runner Desktop concede a permissão do serviço de Acessibilidade via ADB automaticamente ao conectar via USB/Wi-Fi. O Companion é adicionado aos serviços já habilitados (ex: TalkBack), sem nunca substituí-los.
3. **Verificação de Checkup**: Abra a aba **Checkup** para rodar diagnósticos POS, checklists de hardware e validação de textos de tela contra arquivos Golden File.

### Resolução de Problemas
- **Badge indica Fallback ADB**: Selecione novamente o dispositivo no menu suspenso para renovar a ponte de porta, ou clique em **Abrir Companion** no card do dispositivo.
- **Companion inacessível em `http://<ip-do-dispositivo>:9876`**: Comportamento esperado. O servidor escuta apenas no loopback do dispositivo e exige o token de sessão; use-o por meio do Robot Runner Desktop.
- **Restrições de Perfil Corporativo (MDM)**: Em dispositivos corporativos, navegue em `Configurações do Android > Acessibilidade > Serviços Instalados` e ative o **Robot Runner Companion**.
