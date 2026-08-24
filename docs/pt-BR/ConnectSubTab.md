# Conectar

A aba **Conectar** é especializada no gerenciamento de conexões sem fio (Wireless ADB) e tunelamento remoto de dispositivos Android.

---

## Principais Funcionalidades

- **ADB sem Fio (Wireless Debugging):** Conexão direta com dispositivos na mesma rede Wi-Fi via protocolo ADB TCP/IP.
- **Pareamento Android 11+ (AOSP & One UI):** Suporte completo ao handshake de pareamento seguro com PIN de 6 dígitos e QR Code no padrão oficial `WIFI:T:ADB`.
- **Descoberta Automática de IP:** Detecção automática do endereço IP do dispositivo via USB através da interface de rede ativa (`wlan0`).
- **Ativação 1-Clique de TCP/IP (5555):** Habilita a porta 5555 no dispositivo conectado via USB com um único clique.
- **Túnel Ngrok Integrado:** Exposição segura do serviço ADB / Appium local à internet para execuções remotas.

---

## Fluxos de Conexão Sem Fio

### Fluxo 1: Transição Rápida via USB (Recomendado)
1. Conecte o dispositivo via cabo USB.
2. Na aba **Conectar**, selecione o dispositivo alvo. O Robot Runner preencherá automaticamente o IP do Wi-Fi (`wlan0`).
3. Clique em **"Ativar 5555"** para habilitar o modo TCP/IP no dispositivo.
4. Clique em **"Conectar"** (`adb connect <ip>:5555`).
5. Assim que a notificação de sucesso for exibida, você pode desconectar o cabo USB.

---

### Fluxo 2: Pareamento Manual Android 11+ (Sem Cabo USB)
Em dispositivos modernos com Android 11 ou superior (ex: Samsung Galaxy One UI, Google Pixel, Xiaomi):
1. No dispositivo móvel, acesse **Configurações → Opções do Desenvolvedor → Depuração Sem Fio**.
2. Ative a chave **Depuração Sem Fio**.
3. Toque em **"Parear dispositivo com código de pareamento"**.
4. O Android exibirá uma tela modal com:
   - **Código de pareamento Wi-Fi:** (ex: `123456`)
   - **Endereço IP e Porta:** (ex: `192.168.1.50:37485` — *Atenção: a porta de pareamento é dinâmica e diferente da porta 5555*).
5. No Robot Runner Desktop, insira o IP, a porta de pareamento exibida e o código de 6 dígitos nos campos correspondentes.
6. Clique na seta do botão de ação e selecione **"Parear"** (`adb pair <ip>:<porta_pareamento> <codigo>`).
7. Após a mensagem de sucesso de pareamento, insira a porta principal de conexão (exibida na tela principal de Depuração Sem Fio do Android, geralmente 5555 ou uma porta fixa) e clique em **"Conectar"**.

---

### Fluxo 3: Pareamento via QR Code (`WIFI:T:ADB`)
1. No Robot Runner, o card **QR Code & Pareamento Sem Fio** exibe o QR Code no formato de pareamento oficial do AOSP:
   ```text
   WIFI:T:ADB;S:robotrunner-<PIN>;P:<PIN>;;
   ```
2. No Android, em **Depuração Sem Fio → Parear dispositivo com código QR**, aponte a câmera para o QR Code gerado na tela do Desktop.
3. Certifique-se de que o computador e o dispositivo móvel estejam na mesma rede Wi-Fi local.

---

## Tunelamento Remoto (Ngrok)

1. Configure seu token de autenticação em **Configurações → Ferramentas → Ngrok Token**.
2. Na aba Conectar, clique em **"Iniciar Túnel"**.
3. Uma URL segura `tcp://0.tcp.ngrok.io:<porta>` será gerada e pode ser copiada para conexão de instâncias remotas do Robot Runner / Appium.
