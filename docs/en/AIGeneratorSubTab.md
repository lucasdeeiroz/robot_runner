# AI Generator

The AI Generator leverages Large Language Models (Gemini, Claude, OpenAI) to accelerate your test scripting.

### Key Features

- **Prompt-to-Code:** Type a natural language description (e.g., 'Write a test that logs into the app with valid credentials') and the AI will generate proper Robot Framework BDD syntax.
- **Recording Conversion:** Import macros recorded in the InspectorTab. The AI will convert your generic clicks and swipes into properly structured Robot Keywords using Page Object Model best practices.
- **Context Injection:** The AI is aware of your `Settings` configurations, injecting the correct language locales and project constraints into its output.

### How to Use
1. Ensure you have configured an API Key in Settings (or use Claude Code CLI integration).
2. Write your prompt or import a recorded macro session.
3. Click 'Generate' and review the generated `.robot` code.
