# Robot Runner AI - AI Assistant Instructions

Welcome! You are assisting in the development of **Robot Runner AI**, a modern desktop application designed for Software Quality Assurance (QA). Your primary goal is to write performant, secure, and user-friendly code.

## 1. Project Overview
Robot Runner AI is a desktop tool built to solve critical bottlenecks in mobile test automation and regression analysis. It replaces legacy tools (like Appium Inspector and Rebot HTML reports) with a highly optimized, native solution.
Key features include:
*   **Dynamic Locator Generation**: Instantly generate optimized XPaths and chained `UiSelector` methods.
*   **Visual Selection**: Select elements directly from the screen mirroring.
*   **Smart Selection Candidates**: The inspector automatically prioritizes elements based on automation best practices (`resource-id` > `content-desc` > `text`).
*   **Multi-Attribute Locators**: Build complex, stable locators using multiple attributes (clickable, enabled, focusable) with support for match types (Equals, Contains, Regex).
*   **Asynchronous Log Viewer**: A virtualized, lazy-loaded viewer capable of parsing and rendering massive XML test logs (up to 1GB) instantly without CPU/RAM spikes.
*   **Smart Logcat**: Real-time system and app logs with advanced package-based filtering and search.
*   **Deep Performance Insights**: Track **CPU usage**, **RAM consumption**, and **Battery health** (including temperature) in real-time.
*   **App-Specific Metrics**: Monitor **FPS** and specific resource usage for the application under test.
*   **Data-Driven QA**: Record performance sessions and export them to **CSV** for detailed bottleneck analysis and reporting.
*   **Smart Mapper**: An AI-powered tool that captures Android UI trees via ADB in <2s and generates resilient, semantic locators.
*   **Flowchart Visualization**: Automatically generate interactive flowcharts of your app's navigation logic.
*   **Screen Tagging**: Organize large-scale applications using custom tags for targeted filtering and analysis.
*   **AI Artifact Generation**: Leverage **Google Gemini AI** to transform your app mapping into professional-grade **BDD Test Cases**, **Product Backlog Items (PBIs)**, or **Bug Reports**, exportable directly to **XLSX** and **DOCX**.
*   **Execution Modes**: Native support for individual `.robot` files, entire directories, and complex `.args` configurations. Maestro is also supported.
*   **Automation Root**: Intelligent working directory management to ensure relative path resolution for complex projects.
*   **Configuration Profiles**: Instantly switch between multiple project setups, API keys, and environment variables.
*   **Execution History**: Detailed historical logs and reports, organized by device, OS version, or date, with single-click "Re-run" capability.

## 2. Architecture
The application uses a modern web-to-native architecture:
*   **Backend (Rust + Tauri v2)**: Handles all heavy lifting, including system commands (ADB, ngrok, executing Robot Framework processes), file system operations, and asynchronous XML parsing.
*   **Frontend (React + TypeScript)**: Provides a highly responsive, virtualized UI. Communicates with the backend via Tauri's IPC (`invoke`, `listen`, `emit`).

## 3. Build & Test
*   **Prerequisites**: Node.js, Rust (cargo), and platform-specific build tools for Tauri.
*   **Development Server**: Run `npm run tauri dev` to start the application with hot-reloading.
*   **Building**: Use `npm run tauri build` to compile the final executable.
*   **Testing**: Ensure any Rust logic is covered by `cargo test`. Frontend logic should be tested using Jest/React Testing Library (if configured). Always run linters and type-checkers before finalizing code.

## 4. Key Patterns & Conventions
When writing code for Robot Runner AI, adhere strictly to the following rules:

*   **Tauri Commands (Rust)**:
    *   Implement system commands (ADB, processes) asynchronously (`async fn`) to avoid blocking the Main Thread.
    *   Implement rigorous error handling. Always return `Result<T, E>` where `E` is a string or a custom serializable error type.
    *   Use Tauri events (`app_handle.emit`) to stream real-time logs or progress to the frontend to prevent memory leaks.
*   **Frontend (React + TS)**:
    *   Use Functional Components and strictly typed TypeScript. Avoid `any`.
    *   Keep the UI state synchronized with backend events.
    *   **Performance is Critical**: When rendering large lists (like logs), ALWAYS use virtualization strategies (e.g., `react-window` or `react-virtuoso`) and lazy-loading.
    *   **Modular Hooks**: Create custom React hooks to encapsulate complex Tauri IPC logic.
*   **UX & Design**:
    *   Use rich, premium aesthetics (dark mode, glassmorphism, subtle animations). Avoid generic, plain colors.
    *   Provide clear visual feedback (e.g., Toast notifications) when backend commands fail or succeed.
    *   **i18n**: All new UI text elements must support internationalization keys (EN, PT-BR, ES).
*   **Cross-Platform Paths**: When dealing with the file system (test paths, `.args` files), ensure all path manipulations are OS-agnostic (Windows/Linux/macOS compatible).
*   **Communication Style**: Provide direct code snippets. Explain logic in concise bullet points. Keep code and comments entirely in English (US). Do not use comments to express doubts or echo user requests.

## 5. Key Files & Directories
*   `src-tauri/src/main.rs`: The entry point for the Rust backend. Registers Tauri commands and plugins.
*   `src/`: The React frontend root.
*   `src/components/`: Reusable UI components.
*   `src/hooks/`: Custom React hooks, especially for Tauri IPC.
*   `src/utils/`: Helper functions and utilities.
*   `docs/`: Project documentation.

## 6. AI Guidelines (Self-Correction & Reasoning)
*   **Performance First**: Before proposing a solution, consider its impact on memory and CPU. If parsing XML or JSON, stream it if possible.
*   **Do not block the thread**: Never propose synchronous blocking operations in Rust that could freeze the Tauri UI.
*   **Aesthetics**: When writing CSS/UI code, prioritize a modern, "wow" factor design.
