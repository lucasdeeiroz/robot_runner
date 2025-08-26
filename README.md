# Robot Runner - A GUI for Robot Framework Automation

A comprehensive desktop application, built with Python and Tkinter, for managing and running Robot Framework tests on Android devices. It integrates ADB, Scrcpy, and Appium into a single, user-friendly interface.

## Key Features

* **Device Management**:
    * Automatically detects and lists connected Android devices (USB & Wireless).
    * Displays device information (Model, Android Version, UDID).
    * Tools to pair, connect, and disconnect devices over Wi-Fi.
    * Execute manual ADB commands with output display.

* **Live Screen Mirroring (Windows Only)**:
    * Embeds a live Scrcpy screen mirror directly into the application window.
    * Automatically downloads the latest version of Scrcpy if it's not found.
    * Maintains the device's aspect ratio when resizing the window.
    * Integrated controls to take screenshots and record the screen during test execution or mirroring.

* **Robot Framework Test Execution**:
    * Integrated file browser to select test suites (`.txt`) or individual test files (`.robot`).
    * Run tests on any connected device.
    * View live test execution output directly in the app, with syntax highlighting for status (PASS/FAIL).
    * Button to forcefully stop a running test.
    * Automatic final report generation using `rebot` after test completion.
    * Option to run tests with or without the live screen mirror.

* **Test Logs Dashboard**:
    * A dedicated tab to view a summary of all historical test runs.
    * Parses all `output.xml` files to build the dashboard.
    * Groups results by **Device**, **Suite**, or **Status**.
    * Presents data in a hierarchical, indented format for better readability.
    * Allows opening the full HTML report with a double-click.

* **Settings & Tools**:
    * Start and stop the Appium server directly from the GUI.
    * Configure paths for the Scrcpy executable and project directories (suites, tests, logs, etc.).
    * Customize the application theme (light or dark).

## Prerequisites

Before installing, make sure you have the following software installed and configured in your system's PATH:

1.  **Python**: Version 3.8 or higher.
2.  **Android Debug Bridge (ADB)**: Required for all device communication.
3.  **Appium Server**: The `appium` command must be executable from your terminal. It's typically installed via npm:
    ```sh
    npm install -g appium
    ```

## Installation and Setup

1.  **Clone the repository:**
    ```sh
    git clone <repository-url>
    cd robot_runner
    ```

2.  **Create a virtual environment (recommended):**
    ```sh
    python -m venv .venv
    # On Windows
    .venv\Scripts\activate
    # On macOS/Linux
    source .venv/bin/activate
    ```

3.  **Install the required Python packages:**
    ```sh
    pip install -r requirements.txt
    ```

4.  **Directory Structure:**
    The application expects the following directories in its root folder. They will be created automatically if they don't exist.
    * `config/`: Stores the `settings.json` file.
    * `suites/`: Place your Robot Framework suite files (`.txt`) here.
    * `tests/`: Place your individual Robot Framework test case files (`.robot`) here.
    * `logs/`: Test reports and logs will be generated here.
    * `screenshots/`: Screenshots taken from the app are saved here.
    * `recordings/`: Screen recordings are saved here.

## How to Use

1.  **Run the application:**
    ```sh
    python robot_runner.py
    ```
2.  **Configure the paths** in the "Settings" tab, if necessary, and save.
3.  **Start the Appium server** in the "Settings" tab.
4.  **Select a device** and a test/suite file in the "Run Tests" tab and click **Run Test**.

## License

This project is licensed under the MIT License.

**Copyright (c) 2025 Lucas de Eiroz Rodrigues**
