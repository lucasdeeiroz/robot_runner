# Connect

The Connect tab specializes in remote and wireless device connections, including advanced tunneling features.

### Key Features

- **Wireless ADB:** Connect to devices over Wi-Fi without needing a USB cable. Enter the device's IP address and Port (default 5555).
- **Android 11+ Pairing:** Support for pairing codes if you are connecting to a fresh device over Wi-Fi for the first time.
- **Ngrok Tunneling:** Expose your local Appium server securely to the internet. This is vital when testing devices on different networks (e.g., remote device farms).
- **Auto-Discovery:** Automatically fetches the active IP address of a device if it is already connected via USB, making the transition to Wi-Fi seamless.

### How to Use
1. **Wi-Fi ADB:** If your device is connected via USB, its IP will be auto-populated. Click 'Connect' to establish a TCP/IP connection, then you can safely unplug the USB cable.
2. **Ngrok Tunnel:** Click 'Start Ngrok'. A secure URL will be generated, which you can use in your Appium inspector or remote test execution scripts.
