# Robot Runner AI - Central Agent Knowledge

Welcome to the Robot Runner AI central intelligence hub. This workspace employs a **modular rules structure** to optimize token usage for various AI models. 

Below is an index of the existing rules and best practices. AIs operating in this workspace should refer to these files when working on their respective domains.

## Modular Rules Index (`.agents/rules/`)

### Core & Engineering
* **`ai-engineering.md`**: Prompt optimization, JSON enforcement, token limit prevention, and AI architecture integration.

* **`documentation.md`**: Guidelines for maintaining and generating multilingual documentation.

### Desktop & Backend
* **`rust-backend.md`**: Tauri v2, async Rust (`tokio`), cross-platform paths, and strict error handling.
* **`desktop-dev.md`**: Process management (ADB), IPC streams, and overall desktop architecture constraints.

### Frontend UI/UX
* **`react-frontend.md`**: Virtualization for large lists, strict typing, and IPC syncing via React Hooks.
* **`ui-ux-design.md`**: Premium aesthetics, Glassmorphism, Dark mode implementation, and Tailwind class merging rules.
* **`atomic-design.md`**: Creating and updating atomic components (src/components/atoms) and type mapping.

### Android Companion & Mobile Execution
* **`android-companion-dev.md`**: Kotlin Compose guidelines, NanoHTTPd REST servers, memory leak prevention in AccessibilityService, and dual independence architecture.
* **`exploration-engine.md`**: Rules for maintaining the DFS graph (Autonomous Explorer) and preventing cyclic loops.
* **`qa-automation-specialist.md`**: QA Automation specialist behaviors, Robot Framework/Appium testing standards (Gherkin syntax, POM pattern), device connectivity, and test runner processes.
* **`adb-best-practices.md`**: Reliable ADB commands for device management.

### Integrations
* **`firebase-integration.md`**: Security rules, cloud architecture, and Firebase logic for Robot Runner.
* **`companion-integration.md`**: Establishing the synergistic P2P connection and UI sync between the Desktop host and the Companion app.

## Extensible Skills (`.agents/skills/`)
The workspace also contains active **Skills** (agentic workflows) that you can utilize dynamically. They are located in the `.agents/skills/` directory. Each skill is defined by a `SKILL.md` file. Examples include:
* `adb-diagnostics`
* `fetch-ai-models`
* `ui-visual-bug-resolution`
* `evidence-based-debugging`
* `create-robot-test`
