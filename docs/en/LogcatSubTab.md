# Toolbox: Logcat

A high-performance implementation of Android's Logcat, tailored for QA engineers.

### Key Features

- **Virtualization:** Capable of rendering tens of thousands of log lines without slowing down the UI, thanks to React virtualized lists.
- **PID/Package Filtering:** Automatically isolate logs that belong exclusively to your App Under Test, filtering out the system noise.
- **Log Levels & Regex:** Filter visually by Log Level (Verbose, Debug, Info, Warn, Error, Fatal) and use Regular Expressions for powerful string matching.
- **Pause/Resume:** Freeze the log stream to investigate an exception without losing your scroll position.

### How to Use
1. Select your target application package from the dropdown.
2. The view will automatically filter the chaos of Android logs to only show messages emitted by your app. Use the search bar to find exceptions.
