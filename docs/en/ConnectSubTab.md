# Connect

The **Connect** tab specializes in managing wireless connections (Wireless ADB) and remote device tunneling.

---

## Key Features

- **Wireless ADB:** Direct connection with devices on the same local Wi-Fi network via the ADB TCP/IP protocol.
- **Android 11+ Pairing (AOSP & One UI):** Secure pairing using the 6-digit Wi-Fi pairing code shown by Android (**"Pair device with pairing code"**).
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

### Workflow 2: Pairing with a Pairing Code on Android 11+ (Without USB Cable)
On modern Android 11+ devices (e.g., Samsung Galaxy One UI, Google Pixel, Xiaomi). The **Pair with Wireless Debugging (Android 11+)** card in the Connect tab summarizes these same steps and shows your **PC Host IP**.
1. Make sure the phone and the computer are on the same Wi-Fi network.
2. On your phone, navigate to **Settings → Developer Options → Wireless Debugging** and turn on the **Wireless Debugging** switch.
3. Tap **"Pair device with pairing code"**.
4. Android will display a dialog with:
   - **Wi-Fi pairing code:** (e.g. `123456`)
   - **IP address & Port:** (e.g. `192.168.1.50:37485` — *Note: the pairing port is ephemeral and different from the connection port*).
5. In Robot Runner Desktop, type the **Wi-Fi pairing code** into the **Code** field, and the IP address and pairing port shown in that dialog into the **IP** and **Port** fields.
6. Open the arrow dropdown next to the main action button and select **"Pair"** (`adb pair <ip>:<pairing_port> <code>`).
7. Pairing does **not** connect automatically. After pairing succeeds, close the dialog on the phone, enter the IP address & port shown on Android's **main Wireless Debugging screen** (a different port from the pairing one) and click **"Connect"**.

> **Note:** Pairing via QR Code is not supported. Android's **"Pair device with QR code"** option requires the computer to advertise a pairing service over mDNS, which Robot Runner does not provide. Always use **"Pair device with pairing code"**.

---

## Remote Tunneling (Ngrok)

1. Configure your authentication token in **Settings → Tools → Ngrok Token**.
2. In the Connect tab, click **"Start Tunnel"**.
3. A secure URL `tcp://0.tcp.ngrok.io:<port>` will be generated for remote access.
