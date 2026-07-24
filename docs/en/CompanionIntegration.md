# Robot Runner Companion Architecture & Integration Guide

The **Robot Runner Companion** is the native Android helper app that powers up the **Robot Runner Desktop**, accelerating screen inspection, flowchart mapping, and mobile test automation into a high-speed, precise experience.

---

## ⚡ Why Use Companion Instead of Pure ADB?

While the ADB (`Android Debug Bridge`) is the industry standard, it suffers from severe architectural limitations when used alone. The Companion solves these issues by operating directly inside the Android OS ecosystem:

| Feature | Pure ADB (No Companion) | With Robot Runner Companion |
|---|---|---|
| **UI Tree Read Speed** | ~3,500 ms (`uiautomator dump` freezes UI) | **~8 ms** (Instant Accessibility tree) |
| **Visual Payload** | Raw 15MB PNG captures on 4K displays | Lightweight 720p compressed JPEG frames (**~30KB**) |
| **Touch Gesture Injection** | ~400 ms (`adb shell` process spawn overhead) | **~15 ms** (Native `dispatchGesture` injection) |
| **POS / Restricted POS Support** | Blocked (`Permission Denied` on `/proc`) | **Full Support** via native Android APIs |
| **Hardware Telemetry** | Requires heavy, periodic `dumpsys` queries | Continuous real-time readings (mA, mV, °C, NFC) |
| **Technical Audit Reports** | External parsing on PC | **Native PDF Generation** directly on device |

---

## 🚀 How the Integration Works

1. **Automatic Detection**:
   Upon connecting an Android device over USB or Wi-Fi, Robot Runner Desktop queries package presence for `com.robotrunner.companion`.

2. **Silent Port Forwarding & Auto-Grant**:
   The app establishes local ADB port forwarding (`tcp:9876 tcp:9876`) and automatically grants the secure accessibility service setting via ADB.

3. **Boosted Inspector & Mapper**:
   - A **Rocket (🚀)** icon appears next to the device name in the device selector.
   - The **Inspector** and **Flowchart Mapper** display a floating engine badge `🚀 Companion (~250ms)` confirming maximum speed operation.

---

## 🛠️ Troubleshooting & Diagnostics

### Badge displays "🐢 ADB (3.4s)" instead of Companion?
1. **Verify Companion APK Installation**:
   Navigate to the **Checkup / Connect** sub-tab and click **Install / Update Companion App**.
2. **Reconnect USB Device**:
   Re-selecting the device in the top dropdown triggers automatic port forwarding and permission activation.
3. **Check Accessibility Service**:
   If your device enforces corporate MDM policies, open `Android Settings > Accessibility > Installed Services` and toggle **Robot Runner Companion** ON.
