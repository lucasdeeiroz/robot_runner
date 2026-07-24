# Guia de Integração e Arquitetura do Robot Runner Companion

O **Robot Runner Companion** é a aplicação Android complementar nativa que turbina o **Robot Runner Desktop**, transformando a inspeção, mapeamento de telas e automação de testes mobile em uma experiência de altíssima velocidade e precisão.

---

## ⚡ Por que usar o Companion em vez do ADB Puro?

Embora o ADB (`Android Debug Bridge`) seja a ferramenta padrão da indústria, ele possui limitações arquiteturais severas quando utilizado isoladamente. O Companion resolve esses problemas operando diretamente dentro do ecossistema do Android:

| Funcionalidade | ADB Puro (Sem Companion) | Com Robot Runner Companion |
|---|---|---|
| **Velocidade de Leitura de UI** | ~3.500 ms (`uiautomator dump` trava a tela) | **~8 ms** (Leitura instantânea de Acessibilidade) |
| **Gargalo Visual** | Capturas PNG brutas de 15MB em telas 4K | Frames leves 720p em JPEG comprimido (**~30KB**) |
| **Injeção de Toque (Tap)** | ~400 ms (criação de processo `adb shell`) | **~15 ms** (Injeção nativa `dispatchGesture`) |
| **Suporte a POS / Maquininhas** | Negado (`Permission Denied` em `/proc`) | **Suporte Total** via API nativa Android |
| **Monitoramento de Hardware** | Requer múltiplos comandos `dumpsys` pesados | Leitura contínua em tempo real (mA, mV, °C, NFC) |
| **Relatórios Técnicos** | Processamento externo no PC | **Emissão nativa de PDFs** diretamente no celular |

---

## 🚀 Como Funciona a Integração

1. **Detecção Automática**:
   Ao conectar um dispositivo Android via USB ou Wi-Fi, o Robot Runner Desktop detecta automaticamente se o pacote `com.robotrunner.companion` está instalado.

2. **Conexão de Ponte Silenciosa**:
   O aplicativo estabelece um redirecionamento de porta ADB local (`tcp:9876 tcp:9876`) e ativa automaticamente o serviço de acessibilidade do dispositivo via comandos seguros de sistema.

3. **Velocidade Turbinada no Inspector e Mapper**:
   - Um ícone de **Foguete (🚀)** aparece ao lado do nome do dispositivo.
   - O **Inspetor** e o **Mapeador de Fluxos (Mapper)** exibem um badge flutuante `🚀 Companion (~250ms)` confirmando que a inspeção está operando na velocidade máxima.

---

## 🛠️ Diagnóstico e Solução de Problemas (Troubleshooting)

### O badge está mostrando "🐢 ADB (3.4s)" em vez do Companion?
1. **Verifique se a APK do Companion está instalada**:
   Navegue até a aba **Checkup / Conectar** e clique em **Instalar / Atualizar Companion App**.
2. **Reconecte o cabo USB**:
   Ao selecionar o dispositivo novamente no menu superior, o Robot Runner refará a ponte e ativará as permissões automaticamente.
3. **Verifique o serviço de Acessibilidade**:
   Caso o dispositivo possua restrições estritas de fabricante (como perfis MDM de empresa), navegue em `Configurações do Android > Acessibilidade > Serviços Instalados` e ative o **Robot Runner Companion**.
