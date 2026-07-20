# 🤖 Robot Runner

**The Professional Command Center for Android Automation.**

Robot Runner is a high-performance desktop ecosystem engineered to bridge the gap between manual exploration and professional automation. Built for **Quality Analysts**, **SDETs**, and **System Architects**, it streamlines the entire testing lifecycle—from initial device connection to AI-powered artifact generation—using a unified, resource-efficient interface.

---
Read this README in other languages:
- [Português](README.pt-BR.md)
- [Español](README.es.md)
---

## 🌟 The QA Advantage: Why Robot Runner?

In a traditional workflow, a QA engineer switches between Appium Inspector, terminal windows for ADB/Logcat and CLI commands, device monitoring tools, and various performance monitors. **Robot Runner eliminates this context-switching.** It provides a seamless, integrated environment where diagnostics and automation design happen in parallel.

---

## 🚀 Core Capabilities

### 🎛️ Unified Device Command Center
*   **Intelligent Discovery**: Instant detection of USB and Wi-Fi devices.
*   **Wireless Freedom**: Seamless pairing via Android 11+ Pairing Codes and TCP/IP.
*   **Global Reach**: Integrated **ngrok** tunneling for remote device testing across different networks.
*   **High-Fidelity Mirroring**: Ultra-low latency screen mirroring powered by `scrcpy`.

### 🔍 Precision UI Inspection & Locator Strategy
*   **Dynamic Locator Generation**: Instantly generate optimized XPaths and chained `UiSelector` methods.
*   **Visual Selection**: Select elements directly from the screen mirroring.
*   **Smart Selection Candidates**: The inspector automatically prioritizes elements based on automation best practices (`resource-id` > `content-desc` > `text`).
*   **AI Smart Selectors**: Automatically evaluate and extract the most resilient UI locator using AI logic.

### 📊 Real-Time Diagnostics & Performance Monitoring
*   **Smart Logcat**: Real-time system and app logs with advanced package-based filtering and search.
*   **Deep Performance Insights**: Track **CPU usage**, **RAM consumption**, and **Battery health** in real-time.
*   **App-Specific Metrics**: Monitor specific resource usage for the application under test via the Toolbox.

### 🧠 AI-Driven Mapping & Test Design
*   **Autonomous App Mapping**: Use the Mapper to create a digital twin of your application by automatically crawling screens, modals, and drawers.
*   **AI Prompt to Code**: Utilize the AI Generator to translate natural language or recorded actions into robust Robot Framework BDD scripts.
*   **Multi-Model Engine**: Connect directly with Gemini, Claude, and OpenAI for code generation.

### ⚡ Professional-Grade Execution
*   **Execution Modes**: Native support for individual `.robot` files, entire directories, and complex `.args` configurations.
*   **Live Output Console**: Watch stdout execution natively inside the application.
*   **Configuration Profiles**: Instantly switch between multiple project setups, API keys, and environment variables.
*   **Execution History**: Detailed historical logs and reports with single-click "Re-run" capability.

---

## 📚 Comprehensive Documentation

For detailed information on how to get the most out of Robot Runner, explore our detailed module guides:

### 📖 Core Guides
- [Setup & Configuration](docs/en/SETUP.md)
- [Usage Guide](docs/en/USAGE.md)
- [Troubleshooting](docs/en/TROUBLESHOOTING.md)

### 🏠 Main Modules
- [Home (Dashboard)](docs/en/HomeSubTab.md)
- [Connect (Ngrok/Wireless)](docs/en/ConnectSubTab.md)
- [Inspector (UI Mirroring & Recording)](docs/en/InspectorSubTab.md)
- [Tests (Execution Engine)](docs/en/TestsSubTab.md)
- [History (Logs & Metrics)](docs/en/HistorySubTab.md)
- [AI Generator](docs/en/AIGeneratorSubTab.md)
- [Mapper (Autonomous DFS)](docs/en/MapperSubTab.md)

### 🧰 Toolbox Modules
- [Apps (Package Manager)](docs/en/AppsSubTab.md)
- [Checkup (Diagnostics)](docs/en/CheckupSubTab.md)
- [Commands (Custom ADB)](docs/en/CommandsSubTab.md)
- [Dmesg (Kernel Logs)](docs/en/DmesgSubTab.md)
- [Hardware (CPU/RAM Specs)](docs/en/HardwareSubTab.md)
- [Logcat (Real-time Logs)](docs/en/LogcatSubTab.md)
- [Performance (Live Graphs)](docs/en/PerformanceSubTab.md)
- [Stopwatch (Benchmarking)](docs/en/StopwatchSubTab.md)

### ⚙️ System
- [Run Console](docs/en/RunConsole.md)
- [Settings Page](docs/en/SettingsPage.md)
- [About Page](docs/en/AboutPage.md)

---

## 📄 License

This project is licensed under a **Non-Commercial / No-Resale license**:
free to use, modify, and redistribute **for free**, as long as you keep credits
and link back to the original repository. Commercialization (selling/licensing)
requires written permission. See `LICENSE`.
