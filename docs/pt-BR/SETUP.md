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
