# Robot Runner AI - AI Assistant Hub

Welcome to the **Robot Runner AI** project! This repository contains highly optimized context files tailored for different Artificial Intelligence models and agentic workflows. 

To achieve the best results, use the correct profile/instructions file for your specific AI assistant.

## Available AI Profiles

### 1. Claude 3.5 Sonnet (Cursor, Windsurf, Claude.ai)
*   **File:** [`CLAUDE.md`](./CLAUDE.md)
*   **Best For:** Complex Frontend (React + TypeScript + Tailwind) tasks, pixel-perfect UI/UX design, precise refactoring, and strict component integrity.
*   **Why:** Claude excels at following structured XML prompts and handling intricate React state and layout rendering without breaking existing styles.

### 2. Gemini 3.1 Pro (Google AI Studio, Gemini Advanced)
*   **File:** [`GEMINI.md`](./GEMINI.md)
*   **Best For:** Massive context window tasks, Rust (Tauri v2) backend architecture, designing Inter-Process Communication (IPC), and parsing massive datasets (like our 1GB XML log viewer).
*   **Why:** Gemini's enormous context window allows it to reason over the entire Rust backend architecture simultaneously, making it ideal for deep system orchestration.

### 3. Antigravity (Google DeepMind Agentic Assistant)
*   **File:** [`ANTIGRAVITY.md`](./ANTIGRAVITY.md)
*   **Best For:** Autonomous execution, autonomous testing, repository-wide searches, and proactive bug fixing.
*   **Why:** Antigravity operates agentically with direct access to terminal commands (`cargo check`, `npm run dev`), `grep_search`, and direct file modifications. It is designed to act as an independent developer pair.

---

## Modular Skills (Contextual Rules)

For IDEs that support dynamic rule injection based on file context (like Cursor or Windsurf), we have established specific "Skills" in the `.agent/rules/` directory:

*   **[`desktop-dev.md`](./.agent/rules/desktop-dev.md)**: Generic desktop development rules.
*   **[`rust-backend.md`](./.agent/rules/rust-backend.md)**: Triggered for `src-tauri/**/*.rs` and `Cargo.toml`. Strict Rust async/IPC rules.
*   **[`react-frontend.md`](./.agent/rules/react-frontend.md)**: Triggered for `src/**/*.tsx` and `src/**/*.ts`. Strict React, Hooks, and virtualization rules.
*   **[`ui-ux-design.md`](./.agent/rules/ui-ux-design.md)**: Aesthetic guidelines for Tailwind and Framer Motion.

## How to Use
When prompting your AI, simply mention or attach the specific markdown file associated with its model to load the optimized context. For example:
> *"@CLAUDE.md Please refactor the Inspector component to use virtualized lists."*
