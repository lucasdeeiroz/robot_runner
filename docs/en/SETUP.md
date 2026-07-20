# 🛠️ Setup & Configuration Guide

This guide covers the prerequisites and steps required to get **Robot Runner** fully operational on your system.

---

## 📋 System Prerequisites

Before running the application, ensure you have the following tools installed and configured:

### 1. Android Debug Bridge (ADB)
- Required for all device interactions.
- **Path**: Ensure `adb` is in your system `PATH`.
- **Test**: Run `adb devices` in your terminal.

### 2. Scrcpy
- Required for high-performance screen mirroring.
- **Path**: Ensure `scrcpy` is installed and accessible via `PATH`.
- **Download**: [scrcpy GitHub](https://github.com/Genymobile/scrcpy)

### 3. Python & Robot Framework
- **Python 3.8+**: Required for executing test suites.
- **Robot Framework**: Install via pip: `pip install robotframework`
- **AppiumLibrary**: Install via pip: `pip install robotframework-appiumlibrary`

---

## 🔧 Initial Configuration

After launching Robot Runner, navigate to the **Settings** tab to finalize your setup.

### 1. Paths Configuration
- **Suites Directory**: The default location where your `.robot` files are stored.
- **Automation Root**: The "Root" of your project. This is critical for resolving relative paths in your suites (e.g., `Resource  ../resources/common.resource`).
- **Reports Directory**: Where you want the test execution logs and reports to be saved.

### 2. AI Providers (Optional but Highly Recommended)
To use the AI Mapping and Generator features, you must provide an API Key for one of the following:
- **Google Gemini**: [Get API Key](https://aistudio.google.com/app/apikey)
- **OpenAI**: [Get API Key](https://platform.openai.com/api-keys)
- **Anthropic (Claude)**: [Get API Key](https://console.anthropic.com/settings/keys)

### 3. Appium Server
Robot Runner assumes an Appium server is running or will be managed by your scripts.
- **Note**: Ensure the Appium server version is compatible with your `AppiumLibrary` version.

---

## 🏗️ Development Setup (For Contributors)

If you intend to build Robot Runner from source:

1. **Install Rust**: [rustup.rs](https://rustup.rs/)
2. **Install Node.js**: [nodejs.org](https://nodejs.org/)
3. **Clone the Repo**: `git clone https://github.com/lucasdeeiroz/robot_runner.git`
4. **Install Dependencies**: `npm install`
5. **Run in Dev Mode**: `npm run tauri dev`
6. **Build Production App**: `npm run tauri build`
