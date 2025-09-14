# Robot Runner - A GUI for Android Automation with Robot Framework

A comprehensive desktop application, built with Python and Tkinter, for managing and running Robot Framework tests on Android devices. It integrates ADB, Scrcpy, Appium, and a UI Inspector into a single, user-friendly, multilingual interface (English, Portuguese, and Spanish).

![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![License](https://img.shields.io/github/license/lucasdeeiroz/robot_runner)
![GitHub repo size](https://img.shields.io/github/repo-size/lucasdeeiroz/robot_runner)

<!-- Add a GIF demonstrating the application here -->
<!-- <p align="center">
  <img src="path/to/your/demo.gif" alt="Robot Runner Demo" width="800"/>
</p> -->

## Key Features

*   **Device Management:**
    *   Automatic detection of connected Android devices (USB & Wireless).
    *   Displays device information (Model, Android Version, UDID).
    *   Tools to pair, connect, and disconnect devices over Wi-Fi.
    *   Execute manual ADB commands with output display.

*   **Interactive UI Inspector:**
    *   Inspect the UI of any application in real-time to easily create selectors.
    *   View the UI element hierarchy in an easy-to-navigate tree.
    *   **Bidirectional Interaction:**
        *   Click an element in the tree to highlight it on the device screenshot.
        *   Click an element on the screenshot to automatically select it in the tree.
    *   Simulate a `tap` on the device by double-clicking a selected element.
    *   Generate and copy XPaths with a single click (by `resource-id`, `text`, `content-desc`, etc.).
    *   Search for elements in the current UI using XPath queries.
    *   Optional automatic refresh when the device's UI changes, keeping the inspector always in sync.

*   **Screen Mirroring & Control (Windows):**
    *   Low-latency Scrcpy screen mirroring embedded directly into the application window.
    *   Automatic download of the latest Scrcpy version if not found on the system.
    *   Integrated controls to take screenshots and record the device screen.

*   **Robot Framework Test Execution:**
    *   Integrated file browser to select argumentfile test suites (`.txt`) or individual test files (`.robot`).
    *   Run tests on one or more selected devices simultaneously.
    *   View live test output with syntax highlighting for status (PASS/FAIL).
    *   Button to forcefully stop a running test.

*   **Performance Monitor:**
    *   Monitor real-time usage of **CPU**, **RAM**, **GPU** memory, and **FPS** for a specific application.
    *   View "Janky frames" and "Missed Vsyncs" data to identify rendering issues.
    *   Save performance logs to a text file for later analysis.

*   **Test Logs Dashboard:**
    *   View a summary of all historical test runs.
    *   Group results by **Device**, **Suite**, or **Status**.
    *   Filter results by time period (Today, Last 7 days, etc.).
    *   Open the full Robot Framework HTML report with a double-click.
    *   Uses a caching system for fast data loading.

*   **Settings & Tools:**
    *   Start and stop the Appium server directly from the GUI.
    *   Configure paths for Scrcpy, project directories (suites, tests, logs), etc.
    *   Customize the appearance with themes (light/dark) and change the application language.

## Prerequisites

Before installing, make sure you have the following software installed and configured in your system's PATH:

1.  **Python**: Version 3.8 or later.
2.  **Node.js and npm**: Required to install Appium.
3.  **Android Debug Bridge (ADB)**: Essential for all device communication.
4.  **Appium Server**: The `appium` command must be executable from your terminal. It's typically installed via npm:
    ```sh
    npm install -g appium
    ```
5.  **(Windows Only)** For the embedded screen mirroring functionality, the `pywin32` library is required.

## How to Use

### For Users

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/lucasdeeiroz/robot_runner.git
    cd robot_runner
    ```

2.  **Create and activate a virtual environment (recommended):**
    ```sh
    python -m venv .venv
    # On Windows
    .venv\Scripts\activate
    # On macOS/Linux
    source .venv/bin/activate
    ```

3.  **Install Python dependencies:**
    ```sh
    pip install -r requirements.txt
    ```

4.  **(Windows Only)** If you want embedded screen mirroring, install `pywin32`:
    ```sh
    pip install pywin32
    ```

5.  **Run the application:**
    ```sh
    python robot_runner.py
    ```

6.  On first launch, go to the **Settings** tab, verify that the directory paths are correct, and click **Save Settings**.

7.  In the **Settings** tab, click **Start Appium**.

8.  Connect your Android device (via USB or Wireless ADB). It should appear in the list on the **Run Tests** tab.

9.  Select a device, a test/suite file, and click **Run Test**.

### For Developers

The development environment is the same as for users. The main source code is centralized in `robot_runner.py`. Interface translations are located in the `locales/` folder. To add a new language, simply create a new `.json` file following the structure of `en_US.json` and add it to the `LANGUAGES` dictionary in the `RobotRunnerApp` class.

## Building the Project

You can create a standalone executable using `PyInstaller`.

1.  **Install PyInstaller:**
    ```sh
    pip install pyinstaller
    ```

2.  **Run the build command:**
    From the project root, run the following command. It ensures that the translation and configuration folders are included in the executable.
    ```sh
    # On Windows
    pyinstaller --noconsole --onefile --add-data "locales;locales" --add-data "config;config" robot_runner.py

    # On macOS/Linux
    pyinstaller --noconsole --onefile --add-data "locales:locales" --add-data "config:config" robot_runner.py
    ```
    *   `--noconsole`: Prevents a console window from opening when running the application.
    *   `--onefile`: Bundles everything into a single executable file.
    *   `--add-data`: Includes necessary additional folders and files.

The executable will be created in the `dist/` folder.

## How to Contribute

Contributions are very welcome! If you have a suggestion to improve the application or have found a bug, feel free to open an Issue.

If you wish to contribute code, please follow the steps below:

1.  **Fork** the repository.
2.  **Create a new branch** for your feature or fix (`git checkout -b feature/my-new-feature`).
3.  **Make your changes** and commit them (`git commit -m 'Add my new feature'`).
4.  **Push** to your branch (`git push origin feature/my-new-feature`).
5.  **Open a Pull Request**.

## License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

**Copyright (c) 2025 Lucas de Eiroz Rodrigues**
