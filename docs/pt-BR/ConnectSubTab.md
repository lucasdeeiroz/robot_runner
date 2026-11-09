# Conectar

A aba **Conectar** é especializada no gerenciamento de conexões sem fio (Wireless ADB) e tunelamento remoto de dispositivos Android.

---

## Principais Funcionalidades

- **ADB sem Fio (Wireless Debugging):** Conexão direta com dispositivos na mesma rede Wi-Fi via protocolo ADB TCP/IP.
- **Pareamento Android 11+ (AOSP & One UI):** Pareamento seguro usando o código de pareamento Wi-Fi de 6 dígitos exibido pelo Android (**"Parear dispositivo com código de pareamento"**).
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

### Fluxo 2: Pareamento com Código de Pareamento no Android 11+ (Sem Cabo USB)
Em dispositivos modernos com Android 11 ou superior (ex: Samsung Galaxy One UI, Google Pixel, Xiaomi). O card **Parear com Depuração por Wi-Fi (Android 11+)** da aba Conectar resume estes mesmos passos e exibe o **IP do PC Host**.
1. Garanta que o celular e o computador estejam na mesma rede Wi-Fi.
2. No dispositivo móvel, acesse **Configurações → Opções do desenvolvedor → Depuração por Wi-Fi** e ative a chave **Depuração por Wi-Fi**.
3. Toque em **"Parear dispositivo com código de pareamento"**.
4. O Android exibirá um diálogo com:
   - **Código de pareamento Wi-Fi:** (ex: `123456`)
   - **Endereço IP e Porta:** (ex: `192.168.1.50:37485` — *Atenção: a porta de pareamento é temporária e diferente da porta de conexão*).
5. No Robot Runner Desktop, digite o **Código de pareamento Wi-Fi** no campo **Código**, e o endereço IP e a porta de pareamento exibidos nesse diálogo nos campos **IP** e **Porta**.
6. Abra a seta ao lado do botão de ação principal e selecione **"Parear"** (`adb pair <ip>:<porta_pareamento> <codigo>`).
7. O pareamento **não** conecta automaticamente. Após o sucesso do pareamento, feche o diálogo no celular, informe o IP e a porta exibidos na **tela principal de Depuração por Wi-Fi** do Android (uma porta diferente da de pareamento) e clique em **"Conectar"**.

> **Observação:** O pareamento via QR Code não é suportado. A opção **"Parear dispositivo com QR code"** do Android exige que o computador anuncie um serviço de pareamento via mDNS, o que o Robot Runner não oferece. Use sempre **"Parear dispositivo com código de pareamento"**.

---

## Tunelamento Remoto (Ngrok)

1. Configure seu token de autenticação em **Configurações → Ferramentas → Ngrok Token**.
2. Na aba Conectar, clique em **"Iniciar Túnel"**.
3. Uma URL segura `tcp://0.tcp.ngrok.io:<porta>` será gerada e pode ser copiada para conexão de instâncias remotas do Robot Runner / Appium.
