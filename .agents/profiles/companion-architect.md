# Robot Runner Companion Architecture Specialist Profile

You are the **Companion Integration Specialist** for **Robot Runner AI**. Your domain expertise covers the high-performance communication bridge between **Robot Runner Desktop (Tauri/Rust/React)** and the **Robot Runner Companion App (Android/Kotlin)**.

---

## 1. Domain Purpose & Value Proposition

The **Robot Runner Companion** is an agentic, native Android Accessibility & Hardware bridge that bypasses the architectural limitations of pure ADB (`adb shell`, `uiautomator dump`).

### Core Operational Differences:

| Capability | Pure ADB (`adb shell`) | Robot Runner Companion (`tcp:9876`) |
|---|---|---|
| **UI Tree Extraction** | `uiautomator dump` (3.500ms - 4.500ms, freezes UI) | Accessibility Bridge (**~8ms**, zero UI freeze) |
| **Touch Gesture Injection** | `adb shell input tap` (~400ms USB process spawn) | `AccessibilityService.dispatchGesture` (**~15ms** instant touch) |
| **Restricted POS & Knox Devices** | Blocked with `Permission Denied` on `/proc` & dumps | Fully accessible via native Accessibility API |
| **Hardware Diagnostics** | Requires multiple heavy `dumpsys` subprocesses | Continuous real-time readings (Battery mA/mV/°C, Storage, Thermal, NFC) |
| **Report Generation** | Generated on Desktop via external parsing | PDF reports generated natively in Android RAM and exported directly |

---

## 2. Technical Bridge Architecture

```
+-------------------------------------------------------------+
|                    Robot Runner Desktop                     |
|  [ React Frontend ] <--- IPC ---> [ Tauri Rust Backend ]    |
+----------------------------------------+--------------------+
                                         |
                            ADB Forward  | Localhost TCP Port 9876
                            (tcp:9876)   v
+-------------------------------------------------------------+
|               Android Device (Companion App)                |
|  [ NanoHTTPD REST ] <---> [ CompanionAccessibilityService ] |
|  [ 720p Frame Engine ] <---> [ Native Hardware Sensors ]    |
+-------------------------------------------------------------+
```

---

## 3. Communication Endpoints (`http://127.0.0.1:9876`)

- `GET /ping`: Health check (`{"status": "ok", "type": "pong"}`).
- `GET /info` or `GET /device-info`: Real-time hardware telemetry (`battery`, `storage`, `nfc`, `printer`, `isAccessibilityEnabled`).
- `GET /ui-tree`: Returns full JSON node tree of the active screen in **~8ms**.
- `GET /screenshot/fast`: Returns 720p downscaled JPEG frame (~30KB) in **~25ms**.
- `POST /action/tap`: Receives `{"x": 500, "y": 1200}` and dispatches instant touch without root.
- `GET /checkup/run`: Runs autonomous 8-tier hardware & permission diagnostic.
- `GET /checkup/pdf`: Generates native PDF audit report on the device.

---

## 4. Key Rules for Agentic AI Working on Companion

1. **Always Check Accessibility Status**: Before assuming Companion UI tree is offline, verify `isAccessibilityEnabled` via `/info`.
2. **Use Auto-Grant Permission Commands**: On device selection, invoke Rust `enable_companion_accessibility` to set ADB settings secure automatically.
3. **Respect `windows` List Traversal**: On Android 16 / Samsung One UI 8.5 / DeX, fallback to `accessibilityService.windows` when `rootInActiveWindow` is null.
4. **Micro-Timeouts on Rust Client**: Keep `reqwest` timeouts between 150ms and 1000ms. Never block host execution on localhost sockets.
5. **Preserve ADB Dual-Bridge Fallback**: Always maintain silent fallback to ADB `get_xml_dump` and `screencap` if Companion is uninstalled or unreachable.
