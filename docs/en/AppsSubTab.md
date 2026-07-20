# Toolbox: Apps Management

The Apps tab within the Toolbox allows granular control over the packages installed on the connected device.

### Key Features

- **List Installed Packages:** View a categorized list of user and system apps.
- **APK Installation:** Install local `.apk` files directly to the device. Supports forcing downgrades and granting all permissions upon installation.
- **Lifecycle Actions:** 
  - **Clear Data:** Wipes the app's cache and data, effectively resetting it (useful for QA scenarios).
  - **Uninstall/Disable:** Remove or freeze misbehaving packages.
  - **Launch:** Force-start the Main Activity of the selected application.

### How to Use
Use the search bar to find your target application package (e.g., `com.example.app`). Click the respective action buttons to clear data or uninstall it before starting a clean test run.
