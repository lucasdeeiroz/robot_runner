---
trigger: always_on
---

# Android Companion App (Kotlin) Development & Architecture Rules

This document outlines mandatory architectural guidelines, performance standards, and code patterns for developing the native **Robot Runner Companion** application (`companion/`). If you find better, more efficient ways to implement the features you were asked to, feel free to enhance or complement this document.

---

## 1. Dual Independence & Synergy Principle

1. **Independent Operation**: The Companion app must be fully functional as an on-device standalone Android QA tool. Every core feature (Inspection, Hardware Checkup, Logcat View, Test Execution, Report Export) must work locally on the device without requiring a connection to Robot Runner Desktop. But you can make the features work better when they are connected if the connection offers you benefits over local implementation.
2. **Synergistic Integration**: When connected to Robot Runner Desktop over USB/Wi-Fi (port 9876), Companion acts as a high-speed agent (sub-10ms UI tree, REST telemetry, native icon provider).
3. **Bi-Directional Data Exchange**: Test artifacts, Golden Files (`golden_*.json`), UI Element Maps (`map_*.json`), and audit reports (`report_*.json`, `audit_*.pdf`) must use standard JSON/PDF schemas compatible with both Desktop and Companion.

---

## 2. Kotlin Architecture & Performance Standards

1. **Coroutines & Thread Safety**:
   - Heavy tasks (UI tree traversal, REST server responses, PDF generation, filesystem I/O) MUST run on `Dispatchers.IO` or `Dispatchers.Default`. Never block the Main UI Thread.
   - Use `StateFlow` and `SharedFlow` for reactive state management between NanoHTTPd REST endpoints and Jetpack Compose screens.

2. **Memory Leak Prevention in `AccessibilityService`**:
   - `AccessibilityNodeInfo` objects hold strong references to OS UI trees. Always scope node inspection properly and call `.recycle()` on legacy nodes when applicable to prevent memory leaks during continuous inspection loops.
   - Guard against `null` returns on `rootInActiveWindow` (especially on Android 14+ or multi-window / Samsung DeX / Knox devices) by falling back to `accessibilityService.windows`.

3. **Restricted Device & POS Fallbacks**:
   - Dispositivos POS (SmartPOS Android) frequently restrict access to `/proc/` or system settings. Always implement multi-tier fallbacks:
     - Priority 1: Native Android API (`ActivityManager`, `BatteryManager`, `PackageManager`).
     - Priority 2: Standard Shell commands (`dumpsys`, `getprop`).
     - Priority 3: Graceful fallback indicator (`N/A` or Restricted Mode) without crashing the app.

---

## 3. UI/UX Design & Jetpack Compose Standards

1. **Modern Dark Aesthetics**:
   - Use Material3 with modern dark color palettes, subtle glassmorphism, and responsive layouts that adapt seamlessly across phone screens, tablets, and POS receipt screens (720p / 480p).

2. **Non-Intrusive Floating Inspector**:
   - The on-device UI Inspector floating overlay must be draggable, collapsible, and easily toggled off so it never blocks the user's manual app interaction.

3. **Visible texts must be internationalized**:
   - All texts visible to the user must be internationalized in `./companion/app/src/main/res/` for `values/`, `values-es/` and `values-pt`.

---

## 4. Hardware Telemetry & Accessibility Detection Rules

1. **Accessibility Service Status Check**:
   - Always check `CompanionAccessibilityService.isRunning` first (checking `instance != null`) before querying system settings.
   - Supplement with `AccessibilityManager.getEnabledAccessibilityServiceList()` and multi-format component checks (`packageName/.service.CompanionAccessibilityService` and full canonical name) to ensure accurate active state detection across all OEM Android skins (One UI, MIUI, ColorOS).

2. **SELinux-Proof Multi-Tier CPU Calculation**:
   - Never rely solely on `/proc/stat` for CPU load on Android 8.0+ (API 26+) as non-root SELinux policies block `/proc/stat` access.
   - Implement a multi-tier fallback:
     - Tier 1: Hardware CPU scaling frequencies (`/sys/devices/system/cpu/cpu*/cpufreq/`).
     - Tier 2: `/proc/stat` (for legacy/rooted Android).
     - Tier 3: Process CPU delta via `Process.getElapsedCpuTime()` combined with system uptime.

---

## 6. On-Device Package Management & Local Shell Execution Rules

1. **Async Package Traversal**:
   - Querying `packageManager.getInstalledPackages()` or requested permissions can inspect hundreds of applications on Android devices. This operation MUST be run asynchronously on `Dispatchers.IO` to prevent blocking the UI frame rendering or triggering ANR (Application Not Responding) dialogs.

2. **FileProvider & Temporary Storage Scoping for APK Sharing**:
   - Never share APK files directly from `/data/app/...` via raw file paths, as Android 10+ scoped storage blocks cross-package file access.
   - Always copy the APK file (`applicationInfo.sourceDir`) to `context.cacheDir` (or external storage) and expose it securely using `FileProvider.getUriForFile()` with `Intent.FLAG_GRANT_READ_URI_PERMISSION`.

3. **Local Shell Command Timeout & Stream Isolation**:
   - When executing local shell commands (`dumpsys`, `pm`, `getprop`, `settings`, `wm`) via `ProcessBuilder("sh", "-c", command)`, always enforce a timeout limit (e.g. 10 seconds) and read `stdout` and `stderr` on separate worker threads to avoid stream deadlocks when stdout buffers fill up.

---

## 7. Wireless ADB & Network Interface Traversal Rules

1. **Android 11+ Wireless Debugging Deep-Linking**:
   - Always verify `Build.VERSION.SDK_INT >= Build.VERSION_CODES.R` (API 30) before suggesting Wireless Debugging workflows. Use `Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS` with fallback to `Settings.ACTION_SETTINGS` to safely open system Developer Options.

2. **Multi-Transport Network Interface Parsing**:
   - Network interface enumeration (`NetworkInterface.getNetworkInterfaces()`) must filter out loopback (`lo`) addresses while accurately categorizing `wlan*` (Wi-Fi), `eth*` (Ethernet), `ap*`/`swlan*` (Hotspot), `rmnet*` (Cellular), and `tun*` (VPN) interfaces.

---

## 8. Ring-Buffer Logcat Streaming & Overlay HUD Rules

1. **Memory-Bounded Ring Buffer for Logcat**:
   - Streaming `logcat` on device can generate thousands of lines per minute. Always bound the in-memory log buffer (e.g. max 1,000 items) using thread-safe synchronization (`Collections.synchronizedList` or `ArrayDeque`) to prevent OutOfMemory (OOM) crashes during long QA testing sessions.

2. **System Alert Window Permission Guard for Overlay HUD**:
   - Creating a floating overlay window requires `SYSTEM_ALERT_WINDOW` permission and `WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY` (API 26+). Always verify `Settings.canDrawOverlays(context)` before starting `FloatingHudService`, and guide the user to `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` if ungranted.

---

## 9. Accessibility-Driven Redraw Latency & Stopwatch Rules

1. **Hardware-Accurate Event Delta Calculation**:
   - Screen redraw deltas are computed inside `CompanionAccessibilityService` by pairing the touch event timestamp (`TYPE_VIEW_CLICKED`, `performTap`) with the subsequent screen content change event timestamp (`TYPE_WINDOW_CONTENT_CHANGED`). Always validate that `now >= lastTouchTimestamp` and cap realistic UI render deltas between 1ms and 10,000ms to eliminate anomalous background redraw noise.

2. **Thread-Safe Benchmark History Isolation**:
   - Lap history and session summaries in `RedrawStopwatchEngine` must use synchronized lists (`Collections.synchronizedList`) and thread-safe data structures so concurrent REST queries (`/stopwatch/laps`) and UI Compose renders never trigger `ConcurrentModificationException`.

---

## 10. Accessibility-Driven BDD Execution & Report Generation Rules

1. **Native UI Tree Matching & Gesture Dispatching**:
   - Native BDD test step execution relies on `CompanionAccessibilityService.performNodeActionByMatch` to locate interactive views by `textMatch`, `contentDescMatch`, or `resourceId`. Always fallback to parent containers if `isClickable` is false on child text views.

2. **On-Device Audit Report Formatting**:
   - Generated audit reports (`report_*.html` and `report_*.json`) must be self-contained files saved directly to `Environment.DIRECTORY_DOWNLOADS` or served securely via `FileProvider`. HTML reports must include dark mode CSS themes compatible with mobile and desktop web browsers.

---

## 11. Floating Overlay UI Inspection & Multi-Locator Generation Rules

1. **Sub-10ms On-Device Tree Capture**:
   - UI inspection on device queries `CompanionAccessibilityService.getInstantUiTreeJson()` directly on active window focus without spawning external `uiautomator dump` processes, ensuring sub-10ms latency.

2. **Multi-Locator Hierarchy Priority**:
   - Locators generated by `UiInspectorEngine` prioritize `accessibilityId` (`contentDescription`/`text`) > `resourceId` (`viewIdResourceName`) > `UiSelector` > `XPath` (`//className[...]`) for maximum test resilience.

---

## 12. On-Device DFS Graph Autonomous Exploration Rules

1. **Native DFS State Machine Isolation**:
   - On-device autonomous exploration runs on `Dispatchers.IO` using Kotlin Coroutines inside `AutonomousExplorerEngine`. Always emit graph state changes (`UNEXPLORED`, `EXPLORING`, `EXHAUSTED`) through thread-safe `StateFlow` streams.

2. **Dead-End & Back-Navigation Guards**:
   - When no unvisited interactive elements remain on the active screen node, the explorer must dispatch `AccessibilityService.GLOBAL_ACTION_BACK` to backtrack to parent screen nodes without causing ANR crashes or navigation traps.

---

## 13. Continuous Learning & Rule Maintenance Instruction

> **IMPORTANT**: As new features, optimizations, or Android SDK workarounds are implemented in `companion/`, the **Android Companion Engineer** profile MUST update and append new rules directly to this document.







