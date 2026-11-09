# 🛠️ Guia de Instalação e Configuração

Este guia abrange os pré-requisitos e as etapas necessárias para deixar o **Robot Runner** totalmente operacional em seu sistema.

---

## 📋 Pré-requisitos do Sistema

Antes de executar o aplicativo, certifique-se de ter as seguintes ferramentas instaladas e configuradas:

### 1. Android Debug Bridge (ADB)
- Necessário para todas as interações com o dispositivo.
- **Caminho**: Certifique-se de que o `adb` está no `PATH` do seu sistema.
- **Teste**: Execute `adb devices` no seu terminal.

### 2. Scrcpy
- Necessário para o espelhamento de tela de alto desempenho.
- **Caminho**: Certifique-se de que o `scrcpy` está instalado e acessível pelo `PATH`.
- **Download**: [scrcpy GitHub](https://github.com/Genymobile/scrcpy)

### 3. Python & Robot Framework
- **Python 3.8+**: Necessário para executar as suítes de teste.
- **Robot Framework**: Instale via pip: `pip install robotframework`
- **AppiumLibrary**: Instale via pip: `pip install robotframework-appiumlibrary`

---

## 🚀 Detecção de Ferramentas na Inicialização

O Robot Runner lembra quais ferramentas foram encontradas na última abertura, então abre **instantaneamente** e confirma tudo em segundo plano.

**Aberturas normais (ferramentas já detectadas antes):**

1. O app abre **sem tela de carregamento**, aplicando as versões salvas na última abertura.
2. Uma pequena pílula na parte inferior da tela mostra **"Confirmando versões das ferramentas... X/Y"** enquanto cada ferramenta é verificada novamente em segundo plano.
3. Se algo mudou desde a última abertura (uma ferramenta foi instalada, removida ou o caminho personalizado do ADB foi alterado), a funcionalidade relacionada é ativada ou desativada automaticamente e uma notificação lista as ferramentas que mudaram. Se o **ADB** não for mais encontrado, a tela **Ferramentas Críticas Ausentes** é exibida.

**Primeira abertura (ou ao trocar de modo de uso / framework pela primeira vez):** ainda não há versões salvas, então a detecção abaixo é executada. Apenas o **ADB** bloqueia a inicialização — todo o resto é identificado em segundo plano.

1. **Abrindo o app**: uma tela de carregamento curta é exibida **somente enquanto o ADB é localizado**. Normalmente leva cerca de um segundo.
2. **ADB encontrado**: a tela de carregamento fecha e o app já pode ser usado (lista de dispositivos, Inspector, Mapper, Toolbox etc.).
3. **ADB não encontrado**: a tela **Ferramentas Críticas Ausentes** é exibida com um link para baixar o Platform Tools, pois nada funciona sem o ADB.
4. **Detecção em segundo plano**: enquanto as demais ferramentas (Scrcpy, Node.js, Appium, UiAutomator2, Python, Robot Framework, AppiumLibrary, Java, Maven, Maestro, Ngrok, Claude Code, Antigravity) são identificadas, uma pequena pílula na parte inferior da tela mostra **"Identificando ferramentas em segundo plano... X/Y"**.
5. **Funcionalidades liberadas uma a uma**: cada funcionalidade é ativada assim que as ferramentas das quais depende são confirmadas:
   - Aba **Launcher** (página Run) — aguarda as ferramentas de teste do framework selecionado (ex.: Python + Robot Framework + AppiumLibrary). Enquanto pendente, a dica (tooltip) mostra **"Verificando ferramentas necessárias..."**. Se você não escolheu outra aba, o app muda para o Launcher automaticamente quando ele fica disponível.
   - Botão de **espelhamento de tela** (Toolbox) — aguarda o **Scrcpy**.
   - Botão **Iniciar Appium** (Configurações) — aguarda **Node.js**, **Appium** e **UiAutomator2**.
   - Card de **acesso remoto** (Connect) — aguarda o **Ngrok** (somente quando o Ngrok está habilitado).
6. **Ferramentas opcionais ausentes**: ao final da detecção em segundo plano, se alguma ferramenta de teste ou de espelhamento estiver faltando, o aviso de sempre é exibido para que você possa instalá-la.
7. **Configurações > Versões do Sistema**: ferramentas ainda em verificação mostram um indicador **Verificando...** e são preenchidas assim que cada uma é identificada. Clicar em **Atualizar** ignora as versões salvas e lê todas as ferramentas novamente do zero — use logo após instalar ou atualizar uma ferramenta.

---

## 🔧 Configuração Inicial

Após iniciar o Robot Runner, navegue até a aba **Settings (Configurações)** para finalizar sua configuração.

### 1. Configuração de Caminhos (Paths)
- **Diretório de Suítes (Suites Directory)**: O local padrão onde seus arquivos `.robot` são armazenados.
- **Raiz da Automação (Automation Root)**: A "Raiz" do seu projeto. Isso é crítico para resolver caminhos relativos em suas suítes (ex: `Resource ../resources/common.resource`).
- **Diretório de Relatórios (Reports Directory)**: Onde você deseja que os logs e relatórios de execução de testes sejam salvos.

### 2. Provedores de IA (Opcional, mas Altamente Recomendado)
Para usar os recursos de Mapeamento por IA e Gerador de IA, você deve fornecer uma Chave de API (API Key) para um dos seguintes provedores:
- **Google Gemini**: [Obter API Key](https://aistudio.google.com/app/apikey)
- **OpenAI**: [Obter API Key](https://platform.openai.com/api-keys)
- **Anthropic (Claude)**: [Obter API Key](https://console.anthropic.com/settings/keys)

### 3. Servidor Appium
O Robot Runner assume que um servidor Appium está rodando ou será gerenciado pelos seus scripts.
- **Nota**: Certifique-se de que a versão do servidor Appium é compatível com a sua versão da `AppiumLibrary`.

---

## 🏗️ Configuração de Desenvolvimento (Para Contribuidores)

Se você pretende compilar o Robot Runner a partir do código-fonte:

1. **Instalar o Rust**: [rustup.rs](https://rustup.rs/)
2. **Instalar o Node.js**: [nodejs.org](https://nodejs.org/)
3. **Clonar o Repositório**: `git clone https://github.com/lucasdeeiroz/robot_runner.git`
4. **Instalar Dependências**: `npm install`
5. **Rodar em Modo Dev**: `npm run tauri dev`
6. **Compilar para Produção**: `npm run tauri build`
