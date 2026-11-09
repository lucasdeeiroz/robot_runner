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

## 🚀 Startup Tool Detection

Robot Runner remembers which tools were found on the last launch, so it opens **instantly**, and confirms everything in the background.

**Regular launches (tools already detected before):**

1. The app opens **with no loading screen**, applying the versions saved on the last launch.
2. A small pill at the bottom of the screen shows **"Confirming tool versions... X/Y"** while every tool is checked again in the background.
3. If something changed since the last launch (a tool was installed, removed or the custom ADB path changed), the related feature is enabled or disabled automatically and a notification lists the tools that changed. If **ADB** is no longer found, the **Missing Critical Tools** screen is shown.

**First launch (or after switching usage mode / framework for the first time):** there are no saved versions yet, so the detection below runs. Only **ADB** blocks the startup — everything else is identified in the background.

1. **Opening the app**: a short loading screen is shown **only while ADB is being located**. This usually takes about a second.
2. **ADB found**: the loading screen closes and the app is ready to use (device list, Inspector, Mapper, Toolbox, etc.).
3. **ADB not found**: the **Missing Critical Tools** screen is shown with a download link for the Platform Tools, since nothing works without ADB.
4. **Background detection**: while the remaining tools (Scrcpy, Node.js, Appium, UiAutomator2, Python, Robot Framework, AppiumLibrary, Java, Maven, Maestro, Ngrok, Claude Code, Antigravity) are being identified, a small pill at the bottom of the screen shows **"Identifying tools in background... X/Y"**.
5. **Features unlock one by one**: each feature is enabled as soon as the tools it depends on are confirmed:
   - **Launcher** tab (Run page) — waits for the testing tools of the selected framework (e.g. Python + Robot Framework + AppiumLibrary). While pending, its tooltip says **"Checking required tools..."**. If you have not picked another tab, the app switches to the Launcher automatically when it becomes available.
   - **Screen mirroring** button (Toolbox) — waits for **Scrcpy**.
   - **Start Appium** button (Settings) — waits for **Node.js**, **Appium** and **UiAutomator2**.
   - **Remote access** card (Connect) — waits for **Ngrok** (only when Ngrok is enabled).
6. **Missing optional tools**: once the background detection finishes, if a testing or mirroring tool is missing, the usual warning dialog is shown so you can install it.
7. **Settings > System Versions**: tools still being checked show a **Checking...** spinner and are filled in as soon as each one is identified. Clicking **Refresh** ignores the saved versions and reads every tool again from scratch — use it right after installing or updating a tool.

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

### 🚀 Publishing a Release (Maintainers)

Releases are fully automated by `.github/workflows/release.yml`. The only manual steps are:

1. **Bump the version**: `node scripts/bump_version.js 3.0.1-beta1` (updates `package.json`, `tauri.conf.json`, `Cargo.toml`, the Companion and the MSI settings).
2. **Commit and tag**: `git commit -am "chore: bump version to 3.0.1-beta1"` then `git tag v3.0.1-beta1`.
3. **Push the tag**: `git push origin v3.0.1-beta1`.

The workflow then, without any intervention:

- **Validates** that the tag matches every project version (fails early with the exact fix command otherwise).
- **Generates the release notes** from the commits since the previous tag, grouped into Features / Improvements / Bug Fixes / etc., plus a download table for every platform. Stable releases list changes since the previous **stable** release.
- **Builds** Windows, macOS, Linux and the Companion APK, and **fails if any expected file is missing**.
- **Publishes** the release with a `SHA256SUMS.txt` only after every build succeeded.
- **Channels**: tags containing `-alpha`, `-dev`, `-beta` or `-rc` are published as **pre-releases** (not offered to the Stable update channel and not sent to Winget). `-stableN` and plain `X.Y.Z` tags are **stable** releases.
- **Winget**: stable releases are submitted automatically when the `WINGET_TOKEN` secret is configured.

To rebuild an existing tag, open **Actions > Release > Run workflow** and type the tag (e.g. `v3.0.1-beta1`).

**Companion signing (one-time setup):** to let users update `companion.apk` without uninstalling it, create a release keystore and add these repository secrets: `COMPANION_KEYSTORE_BASE64` (the `.jks` file in Base64), `COMPANION_KEYSTORE_PASSWORD`, `COMPANION_KEY_ALIAS` and `COMPANION_KEY_PASSWORD`. Without them, the APK is signed with a temporary debug key and the workflow shows a warning.
