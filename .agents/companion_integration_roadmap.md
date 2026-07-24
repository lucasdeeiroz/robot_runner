# Companion App Integration Roadmap (Phases 5 - 10)

This document outlines the strategic roadmap for expanding communication between the **Robot Runner Desktop** application and the native **Robot Runner Companion App** (Android). The Companion App remains **100% optional**; all features maintain full backward compatibility and graceful fallbacks via standard ADB when the Companion is not installed.

---

## 🏗️ Core Infrastructure Requirement: Automatic Companion Detection in `get_devices`

During device discovery (`get_devices` / `get_device_details` in Rust `src-tauri/src/adb/device.rs`):
- Rust queries package availability (`pm list packages com.robotrunner.companion`).
- Injects `isCompanionInstalled: bool` and `companionPort: Option<u16>` into the `DeviceInfo` payload.
- Frontend components and device selector badges immediately reflect status:
  - 🟢 **Companion Active** (Sub-10ms HTTP bridge enabled)
  - 🟡 **Companion Installed (Disconnected)** (1-Click connect available)
  - ⚪ **Standard ADB** (Conventional ADB fallback)

---

## 📋 Module Integration Phases & Feature Analysis

### 📍 Phase 5: Instant Inspection & Screen Mirroring Bridge
**Target Files**: `InspectorSubTab.tsx`, `MapperSubTab.tsx`

- **Current ADB Method**: ADB `uiautomator dump` (1.5s - 3s per refresh) + `screencap` (500ms - 1s).
- **Companion Hybrid Advantage**:
  - **Sub-10ms UI Inspection**: Fetches `/ui-tree` from `CompanionAccessibilityService`.
  - **Instant Touch Injection**: Injects gestures/taps directly via Android Accessibility (`dispatchGesture`), eliminating `adb shell input tap` latency.
  - **Screen Mirroring Stream (30+ FPS)**: Captures frame buffer via `MediaProjection` and streams over HTTP/WebP chunks, bypassing ADB `screencap`.
- **Impact & Gains**: 🚀 **20x faster inspection**, 30 FPS smooth screen mirroring.
- **Difficulty**: Medium-High.
- **Risks**: Screen capture permission prompt on Android 14+.
- **Fallback**: Standard ADB `uiautomator dump` + `screencap`.

---

### 📍 Phase 6: High-Speed AI Exploration & Event Interceptor
**Target Files**: `AIGeneratorSubTab.tsx`, `TestsSubTab.tsx`

- **Current ADB/Appium Method**: Sequential Appium/ADB commands for autonomous AI exploration.
- **Companion Hybrid Advantage**:
  - **Direct Node Action Execution**: Executes clicks and text entries via `AccessibilityNodeInfo.performAction()`.
  - **Real-Time Toast & Dialog Interception**: Consumes `/events/recent` stream. AI discovers "Invalid Credentials" Toasts or crash dialogs **instantly** in the same execution cycle.
- **Impact & Gains**: 🧠 **5x faster AI exploration** with instant awareness of Toast messages and popup errors.
- **Difficulty**: Medium.
- **Risks**: Hybrid WebViews may need Appium fallback if internal DOM nodes are not exposed by Accessibility.
- **Fallback**: Appium/ADB standard driver.

---

### 📍 Phase 7: Zero-Overhead Telemetry & Hardware Profiling
**Target Files**: `PerformanceSubTab.tsx`, `LogcatSubTab.tsx`

- **Current ADB Method**: Spawns `adb shell top -b -n 1` or `dumpsys` every 3 seconds (heavy host CPU load per `RULE[desktop-dev.md]`). `LogcatSubTab` holds long-running `adb logcat` processes.
- **Companion Hybrid Advantage**:
  - **Zero-ADB Polling Overhead**: Companion queries Android `ActivityManager` and `/proc/stat` locally, returning CPU %, free RAM, and battery mA over HTTP REST.
  - **Filtered Logcat Ring Buffer**: Companion filters log lines on-device and delivers clean chunks via HTTP REST, eliminating Windows `adb.exe` process churn.
- **Impact & Gains**: ⚡ **0% Windows host CPU overhead** caused by repeated ADB process spawning.
- **Difficulty**: Medium.
- **Risks**: Very Low.
- **Fallback**: ADB `top -b -n 1` and `adb logcat`.

---

### 📍 Phase 8: Hardware Frame Delta & Stopwatch Benchmark Engine
**Target Files**: `StopwatchSubTab.tsx`

- **Current ADB Method**: Captures ADB screenshots before/after actions and estimates visual response latency.
- **Companion Hybrid Advantage**:
  - **Hardware Frame Delta Timing**: `CompanionAccessibilityService` listens to `TYPE_WINDOW_CONTENT_CHANGED` and records exact millisecond timestamp when the Android screen redraws.
- **Impact & Gains**: 🎯 **Exact TTI (Time To Interactive)** and rendering latency measurements, free of USB cable delay.
- **Difficulty**: Medium.
- **Risks**: Low.
- **Fallback**: Desktop clock measurement + ADB screenshot.

---

### 📍 Phase 9: Advanced App Management with Native Icons
**Target Files**: `AppsSubTab.tsx`, `CommandsSubTab.tsx`

- **Current ADB Method**: `AppsSubTab` runs `adb shell pm list packages` and reads versions via `dumpsys package`.
- **Companion Hybrid Advantage**:
  - **Native High-Res App Icons**: Companion queries `PackageManager` and returns installed app metadata along with Base64 PNG app thumbnails.
  - **Instant Permission & Cache Management**: Direct `granted/revoked` permission toggling with instant feedback.
- **Impact & Gains**: 🖼️ **Premium UI experience** with real app icons in the Desktop app.
- **Difficulty**: Low-Medium.
- **Risks**: Low.
- **Fallback**: `adb shell pm list packages`.

---

### 📍 Phase 10: Seamless Wireless Onboarding & Fleet Dashboard
**Target Files**: `HomeSubTab.tsx`, `ConnectSubTab.tsx`

- **Current ADB Method**: USB cable pairing or manual IP/Port entry in `ConnectSubTab`.
- **Companion Hybrid Advantage**:
  - **QR Code / PIN Wireless Pairing**: Companion scans a QR Code generated by Robot Runner Desktop (or displays a 4-digit PIN) for instant cable-free ADB Wireless pairing.
  - **Fleet Health Overview**: `HomeSubTab` displays a live health dashboard for connected devices (battery mA, temp, Companion status).
- **Impact & Gains**: 📲 **3-second cable-free onboarding** via QR Code / PIN.
- **Difficulty**: Medium.
- **Risks**: Low.
- **Fallback**: Standard USB / Manual Wi-Fi ADB connection.

---

## 📊 Summary Comparison Matrix

| Phase | Target Module | Companion Key Benefit | Performance Gain | Difficulty |
| :--- | :--- | :--- | :--- | :--- |
| **Infra** | `get_devices` (Rust) | Automatic Companion status check on ADB device discovery | Transparent | Low |
| **Phase 5** | Inspector & Mapper | Sub-10ms UI tree, direct touches & 30 FPS screen stream | 🚀 20x Faster | Med-High |
| **Phase 6** | AI Generator & Tests | Direct node execution + Instant Toast/Error interception | 🧠 5x Smarter | Medium |
| **Phase 7** | Performance & Logcat | Telemetry without ADB polling + Ring buffer logcat | ⚡ 0% Host Overhead | Medium |
| **Phase 8** | Stopwatch | Millisecond hardware frame redraw timing (TTI) | 🎯 Hardware Precision | Medium |
| **Phase 9** | Apps & Commands | Base64 native app icons + instant permission manager | 🖼️ Premium UX | Low-Med |
| **Phase 10** | Home & Connection | QR Code / PIN ADB Wireless pairing + Fleet Dashboard | 📲 3s Onboarding | Medium |
