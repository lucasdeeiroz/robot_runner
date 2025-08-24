# Robot Runner - ADB & Scrcpy GUI

A comprehensive desktop application built with Python and Tkinter for managing and executing Robot Framework tests on Android devices. It integrates ADB, Scrcpy, and Appium into a single, user-friendly interface.

## Key Features

*   **Device Management**:
    *   Automatically detect and list connected Android devices (USB & Wireless).
    *   Display device information (Model, Android Version, UDID).
    *   One-click refresh to update the device list.

*   **Live Screen Mirroring (Windows Only)**:
    *   Embeds a live Scrcpy mirror of the selected device directly into the application window.
    *   Automatically downloads the latest version of Scrcpy if not found.
    *   Maintains the device's aspect ratio when resizing the window.
    *   In-app controls to take screenshots and record the screen during test execution or mirroring.
    *   View or hide the Scrcpy console output.

*   **Robot Framework Test Runner**:
    *   Integrated file browser to navigate and select test suites (`.txt`) or individual test files (`.robot`).
    *   Run tests against any connected device.
    *   View live test execution output directly in the app.
    *   Forcefully stop a running test and automatically generate the final report using `rebot`.
    *   Option to run tests with or without the live screen mirror.

*   **Test Log Dashboard**:
    *   A dedicated tab to view a summary of all historical test runs.
    *   Parses `output.xml` files to display pass/fail statistics.
    *   Group and aggregate results by Device, Suite, or a combined view.

*   **Appium Server Control**:
    *   Start and stop the Appium server from within the application.
    *   Automatically clears the port (4723) before starting to prevent conflicts.
    *   View live Appium server logs.
    *   Automatically detects and displays the server's listener addresses.

*   **Wireless Debugging**:
    *   A simple interface to pair and connect to devices over Wi-Fi using ADB's wireless debugging feature.

## Prerequisites

Before running the application, ensure you have the following software installed and configured in your system's PATH:

1.  **Python 3.8+**: The application is built on Python.
2.  **Android SDK Platform-Tools (ADB)**: Required for all device communication. Make sure `adb.exe` is in your system's PATH.
3.  **Appium Server**: The `appium` command must be executable from your terminal. It's typically installed via npm:
    ```sh
    npm install -g appium
    ```

## Setup and Installation

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
    *   `suites/`: Place your Robot Framework suite files (`.txt`) here.
    *   `tests/`: Place your individual Robot Framework test case files (`.robot`) here.
    *   `logs/`: Test reports and logs will be generated here.
    *   `screenshots/`: Screenshots taken from the app are saved here.
    *   `recordings/`: Screen recordings are saved here.

## How to Use

1.  **Run the application:**
    ```sh
    python robot_runner.py
    ```
2.  Follow the on-screen instructions in the various tabs to connect to devices, manage the Appium server, and run your tests.

## License

This project is licensed under the MIT License.