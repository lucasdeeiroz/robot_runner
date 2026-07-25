# Standalone Robot Runner Companion — On-Device Execution Roadmap

This roadmap outlines the phased development of the **Robot Runner Companion** (`companion/`) as an independent, fully-featured on-device QA command center for Android (Smartphones, POS Terminals, Tablets, Smart TVs, and Automotive).

---

## 🎯 Strategic Architecture & Design Philosophy

Achieve **Dual Independence & Synergy**:
- **Standalone Companion**: Inspect screens, manage packages, monitor performance, run logcat filters, execute BDD test suites, run hardware diagnostics, and export audit reports **directly on the Android device** without requiring a connected PC or Desktop app.
- **Standalone Desktop**: Robot Runner Desktop operates 100% independently using standard ADB fallbacks when Companion is absent.
- **Bi-Directional Synergy**: When paired over USB or Wi-Fi, Desktop and Companion exchange live telemetry, recorded UI maps, Golden Files, test execution logs, and PDF audit reports in both directions (*Desktop ⇄ Companion*).

---

## 📋 Comprehensive Module Roadmap (Phases 1 – 10)

> **Note**: Everything listed in this roadmap represents the strategic master plan and will be further refined and detailed prior to and during the execution of each respective phase. Before implementing, create Implementation Plans for each phase, for user acceptance of the modifications.

---

### 📍 Phase 1: On-Device Dashboard & Hardware Specs Viewer [STATUS: COMPLETED & VERIFIED]
**Desktop Counterparts**: [HomeSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/home/HomeSubTab.tsx), [HardwareSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/toolbox/HardwareSubTab.tsx)

- **Goal**: Provide a native Android dashboard for immediate device overview and hardware inspection directly inside the Companion app (`companion/`).
- **Features Implemented**:
  - Live system resource gauges (CPU usage %, RAM breakdown, Battery mA/mV/°C, Storage free space).
  - Detailed Hardware Specs Inspector (SoC architecture, Screen DPI/Refresh Rate, GPU, Android OS build, active sensors).
  - Quick Device Actions (Launch Accessibility Settings, App Details, Toggle REST Server).
  - Real-time Companion Engine status indicator (REST server state, Accessibility bridge state).

---

### 📍 Phase 2: On-Device Package Manager & Local Shell Console [STATUS: COMPLETED & VERIFIED]
**Desktop Counterparts**: [AppsSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/toolbox/AppsSubTab.tsx), [CommandsSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/toolbox/CommandsSubTab.tsx)

- **Goal**: Full package management and local Android command execution directly on the phone/tablet.
- **Features**:
  - Package Explorer: List user/system apps with high-res native PNG icons and package labels via `PackageManager`.
  - Package Actions: 1-click Uninstall, Clear Data, Force Stop, Enable/Disable, Grant/Revoke Runtime Permissions.
  - APK Backup & Share: Extract installed APK files directly to Android Download directory.
  - Local Shell Console: Run on-device shell commands (`pm`, `am`, `dumpsys`, `getprop`, `settings`) with template library.

---

### 📍 Phase 3: Wireless Pairing, Network Bridge & P2P Center
**Desktop Counterparts**: [ConnectSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/home/ConnectSubTab.tsx)

- **Goal**: Cable-free onboarding, network discovery, and connection management.
- **Features**:
  - Wireless ADB Pairing Assistant: Generate/Scan QR Codes or display 6-digit PIN for Android 11+ Wireless Debugging.
  - IP Address Discovery: Detect active Wi-Fi, Ethernet, and Hotspot IP addresses and active port bindings.
  - NanoHTTPd REST Engine Control: Configure port (default 9876), toggle authentication tokens, and monitor active IPC clients.

---

### 📍 Phase 4: Real-Time Logcat Viewer & Live Performance Profiler
**Desktop Counterparts**: [LogcatSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/toolbox/LogcatSubTab.tsx), [PerformanceSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/toolbox/PerformanceSubTab.tsx)

- **Goal**: On-device log analysis and continuous resource performance profiling.
- **Features**:
  - Native Logcat Viewer: Stream device logcat directly on screen with package filtering (`com.target.app`), level filtering (Error, Warn, Info, Debug), and search.
  - Ring Buffer Log Management: Pause/resume stream, clear logs, and export `.log` files to device storage.
  - Live Performance Graphs: Real-time Jetpack Compose line charts for CPU %, RAM Heap breakdown, and Battery drain.
  - Floating Performance Overlay: Mini HUD overlay displayed over target apps to monitor live FPS and RAM during manual testing.

---

### 📍 Phase 5: Millisecond Benchmark Engine & Redraw Stopwatch
**Desktop Counterpart**: [StopwatchSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/toolbox/StopwatchSubTab.tsx)

- **Goal**: Hardware-accurate rendering latency and Time to Interactive (TTI) benchmarking.
- **Features**:
  - Millisecond Redraw Timer: Uses `CompanionAccessibilityService` event listener (`TYPE_WINDOW_CONTENT_CHANGED`) to capture exact screen redraw timestamps.
  - Gesture-to-Frame Delta: Measures exact delay between touch gesture injection and visual UI updates.
  - Lap & Benchmark History: Record lap times, calculate averages, and export CSV latency logs.

---

### 📍 Phase 6: Floating UI Inspector & Element Overlay
**Desktop Counterpart**: [InspectorSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/toolbox/InspectorSubTab.tsx) / [RunPage.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/pages/RunPage.tsx)

- **Goal**: Inspect any target app on screen using a draggable, non-intrusive floating overlay.
- **Features**:
  - Draggable & Collapsible Floating Inspector HUD on top of target apps.
  - Instant Sub-10ms UI Tree Capture via `AccessibilityService`.
  - Visual element bounding box highlights over active UI components.
  - Multi-selector Generator: `accessibilityId`, `resourceId`, `UiSelector`, `XPath`.
  - One-click "Copy Locator" and "Save Element to Local UI Map".

---

### 📍 Phase 7: On-Device Autonomous Exploration Engine (Kotlin DFS Graph)
**Desktop Counterpart**: [MapperSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/toolbox/MapperSubTab.tsx)

- **Goal**: Port Desktop Depth-First Search (DFS) autonomous exploration to run natively inside Android OS.
- **Features**:
  - Native Kotlin DFS state machine operating inside `AccessibilityService`.
  - Autonomous screen crawling without needing a connected PC.
  - Detection of unvisited buttons, drawers, tabs, and input fields.
  - Automatic creation and export of `UIElementMap` (`map_*.json`) directly on device.

---

### 📍 Phase 8: Native On-Device BDD Test Execution Engine
**Desktop Counterpart**: [RunPage.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/pages/RunPage.tsx) / [TestsSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/TestsSubTab.tsx)

- **Goal**: Execute test scripts (`Given`, `When`, `Then` steps) locally on the device without Python or Appium.
- **Features**:
  - Native Kotlin Keyword Execution Engine (`Click`, `Input Text`, `Assert Text`, `Wait For Element`).
  - Gesture Injection via `AccessibilityService.dispatchGesture`.
  - Local Test Execution Dashboard with step progress, screenshots on failure, and execution logs.
  - Supports loading test suites saved in JSON or `.robot`-compatible step definitions.

---

### 📍 Phase 9: Offline Hardware Diagnostics, UI Text Check & Native PDF Audit
**Desktop Counterpart**: [CheckupSubTab.tsx](file:///c:/Users/lucas/Projetos_Programacao/robot_runner/src/components/tabs/tests/toolbox/CheckupSubTab.tsx)

- **Goal**: Complete self-sufficient hardware checkup tool for smartphones and POS terminals.
- **Features**:
  - Hardware & POS Diagnostic Checklist: Battery power meter (mA/mV), thermal throttling, NFC card reader check, POS thermal printer test receipt printout.
  - UI Text Verification Engine: Extract UI texts from active screen and compare against Golden Files (`golden_*.json`).
  - Native PDF Report Engine: Generate and export comprehensive technical audit PDF reports directly to Android storage or share via Android Intent.

---

### 📍 Phase 10: Bi-Directional Synchronization & Fleet P2P Bridge
**Desktop & Companion Synergy**: All Modules

- **Goal**: Seamless 2-way data exchange between Robot Runner Companion (Android) and Robot Runner Desktop (Tauri).
- **Features**:
  - **Companion ➔ Desktop**: Export recorded UI maps (`map_*.json`), Golden Files (`golden_*.json`), test execution logs, and PDF audit reports over REST / Wi-Fi / QR Code to Desktop.
  - **Desktop ➔ Companion**: Push test suites, Golden Files, and project configurations from Desktop to Companion for offline execution.
  - **Fleet P2P Sync**: Synchronize test results and device health telemetry across multiple Companion devices on the same network.

---

## 📊 Comprehensive Summary Matrix

| Phase | Companion Module | Desktop Counterparts | Key On-Device Capability | Primary Tech | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Dashboard & Specs | `HomeSubTab`, `HardwareSubTab` | Real-time resource gauges & hardware specs inspector | Compose + ActivityManager | 🟢 Completed |
| **Phase 2** | Apps & Commands | `AppsSubTab`, `CommandsSubTab` | Package manager with high-res icons & shell console | Compose + PackageManager | 🔄 Planned |
| **Phase 3** | Wireless & Network | `ConnectSubTab` | QR Code / PIN wireless pairing & REST engine control | Compose + NanoHTTPd | 🔄 Planned |
| **Phase 4** | Logcat & Performance | `LogcatSubTab`, `PerformanceSubTab` | Logcat streaming, ring buffer filter & live Compose graphs | Compose + Runtime Logcat | 🔄 Planned |
| **Phase 5** | Stopwatch Benchmark | `StopwatchSubTab` | Millisecond TTI redraw timer & gesture-to-frame delta | Accessibility Events | 🔄 Planned |
| **Phase 6** | Floating Inspector | `InspectorSubTab`, `RunPage` | Draggable floating HUD overlay over target apps | Compose + Accessibility | 🔄 Planned |
| **Phase 7** | Autonomous Explorer | `MapperSubTab` | Native Kotlin DFS crawler building `UIElementMap` JSON | Kotlin Coroutines + DFS | 🔄 Planned |
| **Phase 8** | On-Device Test Runner | `RunPage`, `TestsSubTab` | Native BDD & Keyword step execution without PC | Kotlin Keyword Engine | 🔄 Planned |
| **Phase 9** | Hardware Checkup & PDF | `CheckupSubTab` | POS checkup, UI Text check against Golden Files & PDF | PDFDocument + Canvas | 🟡 Partial |
| **Phase 10**| Bi-Directional Sync Bridge | All Modules | 2-way data export/import (*Desktop ⇄ Companion*) | NanoHTTPd REST + Sync | 🟡 Partial |
