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

## 5. Continuous Learning & Rule Maintenance Instruction

> **IMPORTANT**: As new features, optimizations, or Android SDK workarounds are implemented in `companion/`, the **Android Companion Engineer** profile MUST update and append new rules directly to this document.
