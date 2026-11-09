# Robot Runner Companion Architecture & Integration Guide

The **Robot Runner Companion** is the native Android helper app that powers up the **Robot Runner Desktop**, accelerating screen inspection, flowchart mapping, app management, and mobile test automation into a high-speed, zero-overhead experience.

The Companion is **100% optional**; all Robot Runner features maintain full backward compatibility and graceful fallbacks via standard ADB when the Companion is not installed.

---

## ⚡ Performance Benchmark: Pure ADB vs. Robot Runner Companion

While standard ADB (`Android Debug Bridge`) is the industry default, it suffers from severe architectural limitations when polling telemetry or dumping UI hierarchies. The Companion operates natively inside the Android OS ecosystem to overcome these bottlenecks:

| Feature / Metric | Pure ADB (No Companion) | With Robot Runner Companion | Performance Gain |
|---|---|---|---|
| **UI Tree Read Speed** | ~1,500 – 3,500 ms (`uiautomator dump` freezes UI) | **~8 ms** (Instant Accessibility tree) | 🚀 **200x Faster** |
| **UI Text Verification** | Slow XML dump + file transfer | **Instant `/ui-tree` JSON parse** | ⚡ **Instant Extraction** |
| **Host CPU Overhead** | Spawns `adb.exe` processes every 1–3s | **0% Host Overhead** (per-device session cache in Rust) | 🎯 **Zero CPU Churn** |
| **App List & Thumbnails** | Package names only (`com.app.name`) | **Official App Labels & PNG Icons** | 🖼️ **Native Icons** |
| **Touch Gesture Injection** | ~400 ms (`adb shell input` process spawn) | **~15 ms** (Native `dispatchGesture` API) | ⚡ **25x Faster** |
| **POS / Restricted POS** | Blocked (`Permission Denied` on `/proc`) | **Full Hardware Metrics Support** | 📱 **Full Compatibility** |
| **Hardware Telemetry** | Periodic heavy `dumpsys` queries | **Real-time REST `/telemetry`** (CPU, RAM, Temp) | 📊 **Continuous Stream** |

---

## 🏗️ Architectural Overview & Integration Phases

```
+------------------------------------+   ADB forward per device: tcp:19876-19975 -> tcp:9876    +---------------------------------------+
|        Robot Runner Desktop        | <======================================================> |   Android Companion App (Native OS)   |
| (Rust gateway + per-device ports)  |              HTTP REST + X-RR-Token header               | (A11y Service + REST on 127.0.0.1)    |
+------------------------------------+                                                          +---------------------------------------+
```

### 1. Per-Device ADB Port Forwards (In-Memory Session Cache)
Each connected device gets **its own local port** on the desktop, taken from the range **19876–19975** and forwarded to the Companion port **9876** on that device (`adb -s <serial> forward tcp:<local_port> tcp:9876`). Because every device has a dedicated local port, **multiple devices can use the Companion at the same time without colliding**.

To prevent host OS process churn on Windows/macOS/Linux, the Rust backend keeps a thread-safe in-memory session per device (local port + session token). The forward is created **exactly once per device session**; all subsequent telemetry ticks, UI tree fetches, and app list queries reuse it without spawning external `adb.exe` binaries.

### 2. Universal UI Text Extraction & Activity Escaping
- **JSON & XML Dual Parsing**: The `extractTextsFromXml` engine automatically detects whether the payload is a raw uiautomator XML string or a Companion `/ui-tree` JSON payload. It recursively extracts `text`, `contentDescription`, `label`, `title`, `name`, and `value` fields.
- **Inner-Class Activity Launching**: Activity intents containing inner classes (e.g. `com.android.settings/.Settings$StatusActivity`) are automatically shell-escaped (`\$`), preventing ADB shell variable expansion bugs.

### 3. Unified Interactive UI Badge (`CompanionBadge.tsx`)
- Standardized across common header navigation bars (`TabBar` in `ToolboxView`, `DeviceCard`, `DeviceViewport`).
- **Interactive Ghost Variant**: Features an animated pulsing `Rocket (🚀)` icon in `'ghost'` mode. Clicking the icon instantly invokes `launch_companion_app` and establishes connection with zero user intervention.

### 4. Security & Transport Hardening
- **Loopback-only server**: The Companion HTTP server listens only on the device loopback (`127.0.0.1:9876`). It is **not reachable** from the device's Wi-Fi/LAN IP; the only way in is the ADB forward created by the desktop.
- **Per-session token**: For each device session the desktop generates a random token and delivers it to the Companion with `adb shell am broadcast ... START_SERVER --es AUTH_TOKEN <token>`. Every request (except `GET /ping`) must carry it in the `X-RR-Token` header; requests without a valid token are rejected.
- **Protected broadcast receiver**: The receiver that starts/stops the server is guarded by the `android.permission.DUMP` permission, which the `adb shell` user holds but regular apps do not, so other apps on the device cannot start the server or inject a token.
- **No CORS / backend-only access**: CORS was removed. The desktop talks to the Companion **only from the Rust backend** (never directly from the web UI).
- **Accessibility services preserved**: When enabling the Companion accessibility service, Robot Runner **appends** it to the list of already enabled services. TalkBack and any other active service stay enabled.
- **Idle timeout limits**: The server idle timeout is clamped between **60 and 3600 seconds**.
- **LAN fleet scan disabled**: The P2P scan for other Companion devices on the local network is disabled; `/fleet/peers` always returns an empty list.
- **Firmware recipe rules**: In custom firmware recipes, `shell` rules only allow `getprop [key]`, and `reflection` rules only allow static getters/fields of `android.os.Build`, `android.os.Build$VERSION` and `android.os.SystemProperties`. Any other rule is rejected and the value falls back to `fallbackProps` / `defaultValue`.

---

## 🛠️ User Guide & Troubleshooting

### How to Connect & Launch Companion
1. **1-Click Launch**: Click the **Rocket (🚀)** icon on any **Device Card** or Header TabBar to launch the app on the Android target and establish connection.
2. **Auto Accessibility Activation**: Robot Runner Desktop automatically grants secure Accessibility permissions via ADB when connected over USB/Wi-Fi. The Companion is added to the services already enabled (e.g. TalkBack), never replacing them.
3. **Manual Checkup**: Open the **Checkup** tab to run full POS checklists, hardware verification, and UI Text verification against Golden Files.

### Troubleshooting
- **Badge shows ADB Fallback**: Re-select the target device in the top dropdown to refresh port forwarding, or click **Launch Companion** in the device card menu.
- **Companion not reachable at `http://<device-ip>:9876`**: This is expected. The server only listens on the device loopback and requires the session token; use it through Robot Runner Desktop.
- **Corporate MDM Restrictions**: On secured enterprise devices, open `Android Settings > Accessibility > Installed Services` and toggle **Robot Runner Companion** to ON.
