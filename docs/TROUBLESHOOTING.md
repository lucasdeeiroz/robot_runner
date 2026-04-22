# ⚠️ Known Issues & Troubleshooting

This document tracks common problems and provides solutions for the most frequent issues encountered in **Robot Runner**.

---

## 📱 Device Connection Issues

### Device not detected
- **Cause**: USB Debugging is disabled or drivers are missing.
- **Solution**:
    1. Enable **Developer Options** and **USB Debugging** on your device.
    2. For Windows, ensure you have the **Google USB Drivers** installed.
    3. Run `adb kill-server` followed by `adb devices` to reset the connection.

### "Unauthorized" status in device list
- **Cause**: The device hasn't accepted the RSA key fingerprint.
- **Solution**: Check your device screen for a permission prompt and select "Always allow from this computer".

---

## 🖥️ Mirroring & Inspector Issues

### Scrcpy fails to start
- **Cause**: Scrcpy is not in the system `PATH` or another mirroring tool is active.
- **Solution**:
    1. Verify `scrcpy --version` works in your terminal.
    2. Close other apps that might be using the ADB connection (e.g., Android Studio, other inspectors).
    3. Lower the resolution/bitrate in Settings > Mirroring.

### Inspector shows empty hierarchy
- **Cause**: Appium or ADB session timed out, or the app uses a custom view that prevents XML dumping.
- **Solution**:
    1. Refresh the inspector manually.
    2. Ensure the app is in the foreground and not on a secure screen (e.g., login screens with `FLAG_SECURE`).

---

## ⚡ Execution Errors

### "Resource not found" or Import errors
- **Cause**: Incorrect **Automation Root** setting.
- **Solution**: Go to Settings and ensure the **Automation Root** is set to the base directory of your project, NOT the suites folder.

### `${udid}` variable is empty
- **Cause**: Test started without selecting a device or manual variable override.
- **Solution**: Always select a device from the dropdown before clicking "Run". Do not define a custom `${udid}` variable in your Robot files if you want to use the automatic injection.

---

## 🧠 AI & Generator Issues

### "Missing API Key" error
- **Cause**: The selected AI provider has no key configured.
- **Solution**: Check Settings > AI and ensure the key for your selected provider (Gemini, OpenAI, or Claude) is correctly pasted.

### AI analysis fails for large logs
- **Cause**: Context window limit exceeded for the selected model.
- **Solution**: Try using a model with a larger context window (e.g., `gemini-1.5-pro` or `gpt-4-turbo`) or run smaller test suites.

---

## ⚡ Performance Issues

### UI Latency with very large logs
- **Status**: Known limitation of the recursive rendering system.
- **Detail**: Test suites with thousands of nested nodes (keywords/steps) may cause a delay during the initial render of the tree.
- **Mitigation**: 
    1. Collapse sections that are not currently under investigation.
    2. Split very large test suites into smaller, more modular files.
    3. Use the "Search" or "Filter" features if available to narrow down the view.
