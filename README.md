# Robot Runner - Modern Application

A modernized desktop application for Android automation, rewriting the legacy Python version with **Tauri**, **React**, and **TypeScript**. It combines the power of Robot Framework, Appium, Scrcpy, and AI assistance into a sleek, high-performance interface.

## 🚀 Features

*   **⚡ Modern Tech Stack:** Built with Tauri v2 (Rust), React 19, and TypeScript for native performance and a small footprint.
*   **📱 Device Management:** 
    *   Real-time detection of USB and Wireless devices.
    *   One-click wireless connection (QR Code / Pairing Code).
    *   Remote connection support via **ngrok**.
*   **🤖 AI Assistant:** 
    *   Integrated Google Gemini AI to help write, debug, and explain Robot Framework tests.
    *   Context-aware chat related to your test files and logs.
*   **🔍 Advanced Inspector:**
    *   Real-time UI hierarchy inspection.
    *   Bi-directional element selection (Tree ↔ Screenshot).
    *   Swipe and Tap simulation directly from the inspector.
*   **📺 Screen Mirroring:** Embedded high-performance screen mirroring using `scrcpy`.
*   **📊 Performance Monitoring:**
    *   Real-time CPU, RAM, and Battery stats.
    *   Record performance sessions to CSV.
*   **📜 History & Reporting:**
    *   Comprehensive test history with filtering and grouping.
    *   Automatic Allure report generation.
    *   Smart log caching for instant loading.

## 🛠️ Prerequisites

Before running the application, ensure you have the following installed:

1.  **Node.js** (v18+) and **npm**: [Download](https://nodejs.org/)
2.  **Rust** (latest stable): [Install Rust](https://www.rust-lang.org/tools/install)
3.  **Android Studio** (or just Command Line Tools):
    *   Ensure `adb` is in your system PATH.
    *   Ensure `ANDROID_HOME` environment variable is set.
4.  **Appium**:
    ```bash
    npm install -g appium
    appium driver install uiautomator2
    ```
5.  **Scrcpy**: [Download](https://github.com/Genymobile/scrcpy) and add to PATH.

## 💻 Development Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/lucasdeeiroz/robot_runner.git
    cd robot_runner
    ```

2.  **Install frontend dependencies:**
    ```bash
    npm install
    ```

3.  **Run in Development Mode:**
    This command starts the React dev server and the Tauri Rust backend.
    ```bash
    npm run tauri dev
    ```

4.  **Build for Production:**
    ```bash
    npm run tauri build
    ```
    The installer will be located in `src-tauri/target/release/bundle/nsis/`.

## 📁 Project Structure

*   `src/`: React frontend code.
    *   `src/components/`: Reusable UI components.
    *   `src/pages/`: Main application views (Run, Tests, AI, Settings).
    *   `src/lib/`: Utilities, state management, and settings logic.
    *   `src/i18n/`: Localization files (en, pt, es).
*   `src-tauri/`: Rust backend code.
    *   `src/lib.rs`: Main entry point and command registration.
    *   `src/adb/`: ADB interaction logic.
    *   `src/runner/`: Test execution logic using subprocesses.

## 🤝 Contributing

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

## 📄 License

This project is licensed under the MIT License.
Copyright (c) 2025 Lucas de Eiroz Rodrigues
