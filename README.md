# 🤖 Robot Runner

**The Professional Command Center for Android Automation.**

Robot Runner is a high-performance desktop ecosystem engineered to bridge the gap between manual exploration and professional automation. Built for **Quality Analysts**, **SDETs**, and **System Architects**, it streamlines the entire testing lifecycle—from initial device connection to AI-powered artifact generation—using a unified, resource-efficient interface.

---

## 🌟 The QA Advantage: Why Robot Runner?

In a traditional workflow, a QA engineer switches between Appium Inspector, terminal windows for ADB/Logcat and CLI commands, device monitoring tools, and various performance monitors. **Robot Runner eliminates this context-switching.** It provides a seamless, integrated environment where diagnostics and automation design happen in parallel.

---

## 🚀 Core Capabilities

### 🎛️ Unified Device Command Center
*   **Intelligent Discovery**: Instant detection of USB and Wi-Fi devices.
*   **Wireless Freedom**: Seamless pairing via Android 11+ Pairing Codes and TCP/IP.
*   **Global Reach**: Integrated **ngrok** tunneling for remote device testing across different networks.
*   **High-Fidelity Mirroring**: Ultra-low latency screen mirroring powered by `scrcpy`, supporting full interaction (tap, double-tap, swipe) even during test design.

### 🔍 Precision UI Inspection & Locator Strategy
*   **Dynamic Locator Generation**: Instantly generate optimized XPaths and chained `UiSelector` methods.
*   **Visual Selection**: Select elements directly from the screen mirroring.
*   **Smart Selection Candidates**: The inspector automatically prioritizes elements based on automation best practices (`resource-id` > `content-desc` > `text`).
*   **Multi-Attribute Locators**: Build complex, stable locators using multiple attributes (clickable, enabled, focusable) with support for match types (Equals, Contains, Regex).
*   **Hierarchy Visualization**: Deep-dive into the view hierarchy with an interactive breadcrumb system and XML dump analysis.

### 📊 Real-Time Diagnostics & Performance Monitoring
*   **Smart Logcat**: Real-time system and app logs with advanced package-based filtering and search.
*   **Deep Performance Insights**: Track **CPU usage**, **RAM consumption**, and **Battery health** (including temperature) in real-time.
*   **App-Specific Metrics**: Monitor **FPS** and specific resource usage for the application under test.
*   **Data-Driven QA**: Record performance sessions and export them to **CSV** for detailed bottleneck analysis and reporting.

### 🧠 AI-Driven Mapping & Test Design
*   **Visual App Mapping**: Create a digital twin of your application by mapping screens, modals, and drawers.
*   **Flowchart Visualization**: Automatically generate interactive flowcharts of your app's navigation logic.
*   **Screen Tagging**: Organize large-scale applications using custom tags for targeted filtering and analysis.
*   **AI Artifact Generation**: Leverage **Google Gemini AI** to transform your app mapping into professional-grade **BDD Test Cases**, **Product Backlog Items (PBIs)**, or **Bug Reports**, exportable directly to **XLSX** and **DOCX**.

### ⚡ Professional-Grade Execution
*   **Execution Modes**: Native support for individual `.robot` files, entire directories, and complex `.args` configurations. Maestro is also supported.
*   **Automation Root**: Intelligent working directory management to ensure relative path resolution for complex projects.
*   **Configuration Profiles**: Instantly switch between multiple project setups, API keys, and environment variables.
*   **Execution History**: Detailed historical logs and reports, organized by device, OS version, or date, with single-click "Re-run" capability.

---

## 📥 Installation

### Windows
```powershell
winget install lucasdeeiroz.RobotRunner
```
Or download the latest `.exe` or `.msi` from the [Releases Page](https://github.com/lucasdeeiroz/robot_runner/releases).

### Linux & macOS
Support for **AppImage**, **.deb**, **.rpm**, and **.dmg** available on the [Releases Page](https://github.com/lucasdeeiroz/robot_runner/releases).

---

## 🛠️ Technical Stack & Architecture

Robot Runner is built with modern, industrial-grade technologies for maximum performance and security:
*   **Backend**: Rust (Fast, thread-safe process management).
*   **Frontend**: React + TypeScript (Strict typing, responsive UI).
*   **Runtime**: Tauri v2 (Low memory footprint, native system integration).
*   **Automation Core**: Robot Framework + Appium.
*   **Diagnostics**: ADB + Scrcpy integration.

---

## ⚙️ Configuring Your Automation Project

To use Robot Runner with your project, you need to configure the paths in the **Settings** tab.

### 1. Project Structure
Robot Runner works best with a standard Robot Framework structure:
```
my-automation-project/    # Your Automation Root
├── suites/               # Your .robot test files
├── resources/            # Resource files (.resource, .py, variables)
├── args/                 # Argument files for complex runs
└── results/              # Output directory (handled by Runner)
```

### 2. Setting Up Paths
Go to **Settings > Paths** and configure:
*   **Suites Directory**: Point to your `suites/` folder.
*   **Automation Root**: If your project uses relative paths (e.g., `Resource  ../resources/common.robot`), set this to your project's root folder.

### 3. Running Tests
1.  Go to the **Run** tab.
2.  Select your target **Device**.
3.  Choose your mode (**File**, **Folder**, or **Args**).
97. Click **Run**.

### 4. Reserved Variables (Robot Framework)
Robot Runner automatically injects device metadata into your Robot Framework sessions. You can access these variables without declaring them:
*   `${udid}`: The unique identifier (Serial Number) of the target device.
*   `${device_name}`: The human-readable model name (e.g., Pixel 7, Samsung Galaxy S23).
*   `${os_version}`: The Android version currently running on the device.

> [!IMPORTANT]
> Do not use these names for your own variables in project suites if you wish to use the values provided by the Runner's device selection.

---

## 📄 License
This project is licensed under the MIT License.
Copyright (c) 2026 Lucas de Eiroz Rodrigues
