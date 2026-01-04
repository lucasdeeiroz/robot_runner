# Robot Runner

**Robot Runner** is a modern, high-performance desktop application designed to streamline Android automation with **Robot Framework** and **Appium**. Built with **Tauri v2**, **React**, and **TypeScript**, it offers a native, resource-efficient experience for QA engineers and developers.

## 🚀 Key Features

### 📱 Device Management
*   **Real-time Detection:** Automatically detects devices connected via USB or Wi-Fi.
*   **Wireless Connection:** Connect devices wirelessly effortlessly using **QR Code** or **Pairing Code** (Android 11+).
*   **Remote Access:** Full support for remote devices via **ngrok** tunneling.
*   **Device Diagnostics:** Built-in toolbox to fix common ADB issues, restart servers, and check device details.

### ⚡ Test Execution
*   **Flexible Running Modes:**
    *   **File Mode:** Select and run individual `.robot` files.
    *   **Folder Mode:** Execute all tests within a specific directory.
    *   **Argument Files:** Run complex test suites defined in `.args` or `.txt` files.
*   **Smart Automation Root:** Define a specific working directory ("Automation Root") to resolve relative paths correctly in your argument files.
*   **Live Logs:** View Appium and Robot Framework logs in real-time within the app.

### 🛠️ Advanced Tools
*   **Configuration Profiles:** Create and switch between multiple configuration profiles (e.g., "Work", "Personal", "Project A") to manage different path setups and settings instantly.
*   **Inspector:** A powerful UI Inspector to visualize the app hierarchy, select elements, and generate XPaths/IDs bi-directionally (Screenshot ↔ Tree).
*   **Screen Mirroring:** Embedded high-performance screen mirroring powered by `scrcpy` (works over USB and Wi-Fi).
*   **Performance Monitoring:** Track CPU, RAM, and Battery usage of your device in real-time and export session data to CSV.

### 📜 History & Reports
*   **Historical Logs:** Access past test runs, grouped by **Date**, **Device**, or **OS Version**.
*   **Re-run Capabilities:** Quickly re-run any test from the history with the exact same parameters.
*   **Logcat Viewer:** integrated Logcat viewer with filtering and search capabilities.

### 🌍 Internationalization
*   Fully translated into **English**, **Portuguese (Brazil)**, and **Spanish**.

---

## 📥 Installation

### Windows
You can install Robot Runner using **WinGet** (recommended) or by downloading the installer from GitHub.

**Option 1: WinGet (Recommended)**
Open PowerShell or Command Prompt and run:
```powershell
winget install lucasdeeiroz.RobotRunner
```

**Option 2: GitHub Releases**
Download the latest version from the [Releases Page](https://github.com/lucasdeeiroz/robot_runner/releases).
*   **Installer (.exe / .msi):** Standard installation wizard.
*   **Portable (.exe):** Standalone executable (no installation required).

### Linux
Robot Runner is available for major Linux distributions. Download the appropriate file from [Releases](https://github.com/lucasdeeiroz/robot_runner/releases):
*   **.AppImage:** Universal Linux package (recommended). Make it executable (`chmod +x`) and run.
*   **.deb:** For Debian/Ubuntu-based systems (`sudo dpkg -i ...`).
*   **.rpm:** For Fedora/RHEL-based systems (`sudo rpm -i ...`).

### macOS
Download for macOS from [Releases](https://github.com/lucasdeeiroz/robot_runner/releases):
*   **.dmg:** Standard disk image installer. Drag to Applications.
*   **.app.tar.gz:** Compressed application bundle.

---

## ⚙️ Configuring Your Automation Project

To use Robot Runner with your project, you need to configure the paths in the **Settings** tab.

### 1. Project Structure
Robot Runner works best with a standard Robot Framework structure. Recommended structure:
```
my-automation-project/    # Your Automation Root
├── suites/               # Your .robot test files
├── resources/            # Resource files (.resource, .py, variables)
├── args/                 # Argument files for complex runs
└── results/              # Output directory (handled by Runner)
```

### 2. Setting Up Paths
Go to **Settings > Paths** and configure:
*   **Suites Directory:** Point to your `suites/` folder. This is where the File Explorer will open by default.
*   **Automation Root (Optional):** If your project uses relative paths (e.g., `Resource  ../resources/common.robot`), set this to your project's root folder (`my-automation-project/`). This ensures all imports resolve correctly during execution.

### 3. Appium Configuration
*   Ensure **Appium** is installed (`npm install -g appium`).
*   In **Settings > Appium**, configure the Host (default: `127.0.0.1`) and Port (default: `4723`).
*   Robot Runner will attempt to automaticall start Appium if it's not running.
*   If you use a custom Appium configuration, you can set arguments in the **Appium Arguments** field.

### 4. Running Tests
1.  Go to the **Run** tab.
2.  Select your target **Device**.
3.  Choose your mode:
    *   **File:** Browse and select a `.robot` file.
    *   **Folder:** Select a folder to run all tests inside it.
    *   **Args:** Select an argument file to run a specific configuration.
4.  Click **Run**.

### 5. History
Go to **History** tab to view past test runs. You can:
*   **View Logs:** View the logs for any test run.
*   **View Report:** View the report for any test run.
*   **Organize:** Organize your test runs by date, device, or OS version.

---

## 🛠️ Prerequisites

*   **Node.js** (v18+) & **npm**
*   **Python** (3.8+) with `robotframework` and `robotframework-appiumlibrary` installed.
*   **Appium Server** (`npm install -g appium`)
*   **UiAutomator2 Driver** (`appium driver install uiautomator2`)
*   **Android SDK Platform-Tools** (`adb` in system PATH)
*   **Scrcpy** (Optional, for screen mirroring, in system PATH) - [Download](https://github.com/Genymobile/scrcpy)

## 💻 Building from Source

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/lucasdeeiroz/robot_runner.git
    cd robot_runner
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run in Development Mode:**
    ```bash
    npm run tauri dev
    ```

4.  **Build for Production:**
    ```bash
    npm run tauri build
    ```

## 📄 License
This project is licensed under the MIT License.
Copyright (c) 2025 Lucas de Eiroz Rodrigues
