# 📖 User Guide: Getting Started with Robot Runner

This document provides a comprehensive overview of how to use **Robot Runner** to manage your Android automation workflow.

---

## 📱 Device Management

### Device Connection
Robot Runner can connect to devices in 4 different ways. You must have ADB installed and configured on your computer to use this feature. You can get it at https://developer.android.com/studio/releases/platform-tools. 
- **USB**: Simply plug in your Android device with **USB Debugging** enabled. Robot Runner will detect it in the Device Selector list (click in refresh button to refresh the list).
- **Wireless (TCP/IP)**: You can also connect your device to the computer via Wi-Fi. Note that the device and computer must be on the same network.
    1. First, you need to enable **TCP/IP debugging** on the device using port 5555 (default). You can easily do it in Robot Runner by connecting your device via USB for the first time and clicking the **Enable 5555** button in the **Connect** tab in the main page.
    2. IP and Port will be automatically populated. Click in the **Connect** button to connect.
    3. Once connected, you can disconnect the USB cable. The device will remain connected via Wi-Fi until the app is closed or the device is disconnected.
- **Wi-Fi Pairing (Android 11+)**: Use the "Pair Device" option to connect using a pairing code.
    1. First, you need to enable **Wireless debugging** on the device.
    2. IP and Port will be automatically populated. Enter the pairing code shown on the device screen. Click in the **Pair** button to pair. You will only need to do this once for each device.
    3. If your device is already paired, just click the **Connect** button to connect.
    4. Once connected, you can disconnect the USB cable. The device will remain connected via Wi-Fi until the app is closed or the device is disconnected.
- **Remote via ngrok**: You can share your device with others by enabling remote connection. The device will be connected via ngrok tunneling.
    1. First, you need to enable **Remote Connection** in Robot Runner. Click in **Enable Remote Connection** button in the **Connect** tab in the main page.
    2. Read the warning message and, if you agree, click in the **Enable Ngrok** button.
    3. Choose the desired device in the Device Selector list. Then, click in **Start Public Tunnel** button. 
    4. Once the tunnel is established, a message "Public Tunnel: [URL]" will be displayed. You can share this URL with others to access your device.
    5. To stop the remote connection, click in **Stop Public Tunnel** button.
    * Note: You will need to have an ngrok account and API key to use this feature. You can get one at https://ngrok.com.

### Device Toolbox
Device toolbox offers a variety of tools to help you with your automation tasks. You can access the device toolbox by clicking the wrench icon next to the desired device in the Device Selector list. Here are some of them:
- **Mirroring via scrcpy**: Mirror your device screen to your computer.
    1. Click in the **Screen Mirroring** button to open a new window with your device screen.
    * Note: You will need to install scrcpy on your computer to use this feature. The directory where it's installed must be added to the PATH environment variable. You can get it at https://github.com/Genymobile/scrcpy.
- **Screenshot**: Take a screenshot of your device screen.
    1. Click in the **Take Screenshot** button to take a screenshot of your device screen.
    * The screenshot will be saved to the **screenshots** folder in your project directory.
- **Screen Recording**: Record a video of your device screen.
    1. Click in the **Start Screen Recording** button to start recording a video of your device screen.
    2. Click in the **Stop Screen Recording** button to stop recording the video.
    * The video will be saved to the **screen_recordings** folder in your project directory.
- **Logcat**: Capture logs from your device.
    1. Open the **Logcat** tab in the Device Toolbox.
    2. Choose the desired log level in the **Level** dropdown (Verbose, Debug, Info, Warn, Error, Fatal or Silent).
    3. Choose the desired package name in the **Package** dropdown (or change it to "Entire System" to see all logs).
    4. Click in the **Start** button to start capturing logs.
    5. Click in the **Stop** button to stop capturing logs.
    * The logs will be saved to the **logs** folder in your project directory.
- **Performance**: Track CPU, RAM, and Battery (Temp/Voltage) in real-time charts.
    1. Open the **Performance** tab in the Device Toolbox.
    2. Click in the **REC** button to start collecting performance metrics.
    3. Click in the **Stop** button to stop collecting performance metrics.
    * The performance metrics will be saved to the **logs** folder in your project directory.
- **ADB Commands**: Run custom ADB commands on your device.
    1. Open the **ADB** tab in the Device Toolbox.
    2. Type your ADB command in the **Command** field.
    3. Click in the **Run** button to execute the command.
    4. You can also save your ADB commands so you can run them again later.
- **App Manager**: Manage your app installations on the device.
    1. Open the **Apps** tab in the Device Toolbox.
    2. Click in the **Install APK** button to install an APK file on your device.
    3. You can uninstall, reinstall, clear data or freeze/unfreeze any app on your device.

---

## 🔍 UI Inspector & Locator Strategy

The Inspector is your primary tool for designing stable automation locators.

### How to Inspect
1. Open the **Inspector** sub-tab in the **Run** page.
2. Ensure your device is connected (see Device Connection section, must have USB Debugging enabled). In the Devices panel, select the desired device.
3. Click an element on the screen or navigate through the **Hierarchy Tree**.
4. All element attributes will be displayed in the **Attributes** panel.

### Locator Generation
- **Auto-Priority**: The tool automatically suggests the best locator using the hierarchy `resource-id` > `content-desc` > `text`.
- **Advanced Locators**: Select multiple attributes to create chained `UiSelector` or complex XPaths.
- **Validation**: Use the "Search" field to verify that your locator uniquely identifies the target element.

### Screen Interactions
- **Click**: Double-click on an element.
- **Swipe**: Click and drag on the screen to swipe in the desired direction.
- **Back**: Click in the **Back** button.
- **Home**: Click in the **Home** button.
- **Recent**: Click in the **Recent** button.

### Steps Recorder
1. Open the **Inspector** sub-tab in the **Run** page.
2. Ensure your device is connected (see Device Connection section, must have USB Debugging enabled). In the Devices panel, select the desired device.
3. Click the **Steps Recorder** button to open the Recorder panel.
4. Choose the interaction you want to perform (e.g., tap, swipe, drag and drop). 
5. Select the element you want to interact with (either by clicking on it in the mirror or by selecting it in the Hierarchy Tree).
6. Each interaction mode offers different option to interaction with the element (e.g., tap, swipe right, long press, etc). Select one to generate the Robot Framework automation code.
7. Perform all interactions you want to record. 
8. You can copy the generated code to use in your Robot Framework test suite. 

---

## 🧠 AI Mapping & Generator

Robot Runner uses AI to bridge the gap between UI exploration and documentation. You can use the data to generate artifacts to help you with your QA tasks.

### Mapping the App
1. Open the **Mapper** sub-tab in the **Dashboard** page.
2. Ensure your device is connected (see Device Connection section, must have USB Debugging enabled). In the Devices panel, select the desired device.
3. You can save the current screen and map all its elements manually, so you can have more control over the data that is sent to the AI.
4. Or you can use AI to automatically explore and map your app, by clicking the **Star Autonomous Exploration** button. The AI will handle the navigation and exploration process and save the data to the mapper.
5. Click **Open Flowchart** to open the flowchart editor and see the data that was captured.

### Generating Artifacts
Use the **AI Generator** to transform your captured screens into:
- **Test Cases (Gherkin/BDD)**
- **User Stories & PBIs**
- **Bug Reports**
- **Page Object Models (POM)**

*Note: Requires a valid Gemini, OpenAI, or Claude API Key in Settings.*

---

## ⚡ Running and Debugging Automation Tests

### Execution Modes
1. **File**: Run a single `.robot` file.
2. **Folder**: Run all suites within a directory.
3. **Args**: Use a `.args` or `.txt` file for complex configurations (headless mode, variables, etc.).

### Automation Root
Ensure your **Automation Root** is correctly set in Settings. This is the base directory used to resolve relative paths for resources and libraries.

### Injected Variables
Robot Runner automatically provides these variables to your scripts:
- `${udid}`: Serial number of the device.
- `${device_name}`: Model name.
- `${os_version}`: Android version.

### Custom Test Suites
You can mix and match different test suites for a custom automation execution.
1. Click the icon nexto to each test suite to select tests you want to run. You can select multiple test suites or individual tests within a suite.
2. Ensure the correct device is selected in the Device Selector list. You can select more than one device to run your tests in parallel.
3. Click the **Run Selected** button to run the selected tests.

### Debugging Automation Tests
1. Open the **History** sub-tab in the **Tests** page.
2. Select the test execution you want to debug.
3. The entire test logs will be displayed, and you can see the test status, duration, and other information.
4. You can use AI to analyze the test logs and find the root cause of the failure.
