# Tests

The Tests tab is the execution engine. It allows you to browse your automation project and trigger test runs.

### Key Features

- **File Explorer:** An intuitive tree-view of your `Automation Root` directory. Browse `.robot` files effortlessly.
- **Execution Modes:**
  - **File:** Run an entire `.robot` suite.
  - **Folder:** Execute all suites within a selected directory.
  - **Args:** Select a `.args` configuration file to run tests with complex dynamic variables and environments.
- **Test Case Granularity:** When you select a `.robot` file, the UI fetches its internal Test Cases. You can check specific boxes to run only particular scenarios.
- **Device Binding:** Robot Runner seamlessly injects the selected device's UDID, OS version, and Manufacturer into the execution context.

### How to Use
1. Ensure your Automation Root is configured in Settings.
2. In the Tests Tab, navigate the file tree and click a file or folder.
3. Select specific test cases if desired.
4. Click 'Run Tests' to dispatch the execution.
