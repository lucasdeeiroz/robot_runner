# Connect

The **Connect** tab specializes in managing wireless connections (Wireless ADB) and remote device tunneling.

---

## Key Features

- **Wireless ADB:** Direct connection with devices on the same local Wi-Fi network via the ADB TCP/IP protocol.
- **Android 11+ Pairing (AOSP & One UI):** Full support for secure pairing handshakes with 6-digit PIN and standard `WIFI:T:ADB` QR Code schema.
- **Auto-Discovery of IP:** Automatically detects the device's Wi-Fi IP address (`wlan0`) over USB.
- **1-Click TCP/IP Activation (5555):** Enables port 5555 on a connected USB device with a single click.
- **Integrated Ngrok Tunnel:** Securely exposes local ADB / Appium services to the internet for remote test execution.

---

## Wireless Connection Workflows

### Workflow 1: Quick Transition via USB (Recommended)
1. Connect your Android device via USB cable.
2. In the **Connect** tab, select the target device. Robot Runner will automatically detect and populate the Wi-Fi IP (`wlan0`).
3. Click **"Enable 5555"** to switch the ADB daemon into TCP/IP mode.
4. Click **"Connect"** (`adb connect <ip>:5555`).
5. Once the success notification appears, you can safely disconnect the USB cable.

---

### Workflow 2: Manual Pairing on Android 11+ (Without USB Cable)
On modern Android 11+ devices (e.g., Samsung Galaxy One UI, Google Pixel, Xiaomi):
1. On your phone, navigate to **Settings → Developer Options → Wireless Debugging**.
2. Turn on the **Wireless Debugging** switch.
3. Tap **"Pair device with pairing code"**.
4. Android will display a popup modal with:
   - **Wi-Fi pairing code:** (e.g. `123456`)
   - **IP address & Port:** (e.g. `192.168.1.50:37485` — *Note: The pairing port is ephemeral and different from port 5555*).
5. In Robot Runner Desktop, enter the IP, the dynamic pairing port, and the 6-digit PIN code into the corresponding input fields.
6. Click the arrow dropdown next to the main action button and select **"Pair"** (`adb pair <ip>:<pairing_port> <code>`).
7. Once pairing succeeds, enter the primary connection port (shown on Android's main Wireless Debugging page) and click **"Connect"**.

---

### Workflow 3: Pairing via QR Code (`WIFI:T:ADB`)
1. In Robot Runner, the **QR Code & Wireless Pairing** card renders the standard AOSP Wireless Debugging schema:
   ```text
   WIFI:T:ADB;S:robotrunner-<PIN>;P:<PIN>;;
   ```
2. On Android, go to **Wireless Debugging → Pair device with QR code**, and scan the QR code from the Desktop screen.
3. Ensure both computer and mobile device are connected to the same local Wi-Fi subnet.

---

## Remote Tunneling (Ngrok)

1. Configure your authentication token in **Settings → Tools → Ngrok Token**.
2. In the Connect tab, click **"Start Tunnel"**.
3. A secure URL `tcp://0.tcp.ngrok.io:<port>` will be generated for remote access.
