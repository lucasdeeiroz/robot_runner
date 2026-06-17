/**
 * This file defines the Action Protocol for the Robot Runner AI Agent.
 * It provides the Types and the JSON Schema that the AI provider must adhere to.
 */

export type AgentActionType =
    | 'navigate'
    | 'run_test'
    | 'execute_adb'
    | 'capture_logcat'
    | 'take_screenshot'
    | 'open_toolbox'
    | 'open_inspector'
    | 'open_inspector'
    | 'open_scrcpy'
    | 'change_setting'
    | 'create_file'
    | 'modify_file'
    | 'delete_file';

export interface AgentAction {
    type: AgentActionType;
    // Context-specific properties
    target?: string; // For navigate (e.g. 'settings', 'tests')
    path?: string; // For run_test (e.g. 'tests/login.robot')
    device?: string; // For adb, logcat, screenshot, run_test
    command?: string; // For execute_adb
    setting_key?: string; // For change_setting
    setting_value?: any; // For change_setting
    content?: string; // For create_file and modify_file
    description?: string; // Human readable description of what this action does
}

export interface AgentResponse {
    reply: string;
    suggested_prompts?: string[];
    actions?: AgentAction[];
}

export const AGENT_JSON_SCHEMA = {
    type: "object",
    properties: {
        reply: {
            type: "string",
            description: "The main text response to the user. Use Markdown."
        },
        suggested_prompts: {
            type: "array",
            items: { type: "string" },
            description: "Optional array of 2-3 short follow-up prompts the user could ask."
        },
        actions: {
            type: "array",
            description: "Optional array of actions to execute within the Robot Runner application.",
            items: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        enum: ["navigate", "run_test", "execute_adb", "capture_logcat", "take_screenshot", "open_toolbox", "open_inspector", "open_scrcpy", "change_setting", "create_file", "modify_file", "delete_file"]
                    },
                    target: { type: "string", description: "Target tab or subtab for navigate: 'home' (Home), 'run' (Executar testes/tests subtab), 'connect' (Conectar/connect subtab), 'inspector' (Inspector subtab), 'history' (Test history), 'scenarios' (Scenario Generator), 'images' (Image Editor), 'dashboard_history' (Dashboard History), 'mapper' or 'mapeador' (Device Mapper)." },
                    path: { type: "string", description: "File path or name. ALWAYS provide this if the action is run_test, create_file, modify_file, or delete_file. For file manipulation, it must be the relative path inside the automation root." },
                    device: { type: "string", description: "Device name or serial. Provide this if the user specifies a device." },
                    command: { type: "string", description: "ADB command to execute." },
                    setting_key: { type: "string", description: "Setting key to change." },
                    setting_value: { description: "Setting value to apply. Can be a string, number, or boolean." },
                    content: { type: "string", description: "The complete string content of the file. Required for create_file and modify_file. WARNING: For modify_file, you MUST provide the ENTIRE updated file content without any placeholders or omissions, as the file will be completely overwritten." },
                    description: { type: "string", description: "A brief, human-readable description of this action (e.g., 'Navigating to Settings', 'Creating login test')." }
                },
                required: ["type", "description"]
            }
        }
    },
    required: ["reply"]
};

export function getAgentSystemInstruction(context: string, language: string = "en_US"): string {
    return `You are the integrated AI Agent for Robot Runner, a desktop application for QA Mobile Automation, called 'Rai'.
As 'Rai', your goal is to assist the user by answering questions, analyzing logs, and executing tasks directly within the app.

CURRENT CONTEXT:
${context}

RULES:
1. You MUST ALWAYS respond with a VALID JSON object matching the provided schema.
2. If you need to perform an action (e.g., run a test, change a setting, open the toolbox), add it to the "actions" array.
3. Before running tests or destructive commands, always ask the user for confirmation if you are unsure.
4. If the user asks to run a test but does not provide the file extension (like .robot, .yaml, .txt), you MUST NOT use the run_test action. Instead, ask the user to clarify the exact file name and extension.
5. Your text response should be in the "reply" field. Use Markdown for formatting.
6. Provide 2-3 follow-up suggestions in "suggested_prompts".
7. The user is on a desktop app. Do not ask them to use a terminal if you can do it via an action (like execute_adb).
8. VERY IMPORTANT: You must generate your "reply", "description", and "suggested_prompts" in the user's preferred language: ${language}.
9. If the user asks to inspect a device, inspect an element, or open the inspector, you MUST use the "open_inspector" action instead of "open_toolbox".
10. If the user asks to mirror the screen, control the screen, or launch screen sharing/scrcpy, you MUST use the "open_scrcpy" action.
11. If the user asks to go to a feature, screen, or functionality, trigger a 'navigate' action with the correct target. For example:
    - "mapeador", "mapper", "map" -> 'mapper'
    - "gerador", "scenarios", "generator" -> 'scenarios'
    - "editor de imagem", "editor de imagens", "images", "image editor" -> 'images'
    - "conectar", "conexão", "connect" -> 'connect'
    - "inspetor", "inspector", "inspect" -> 'inspector'
    - "executar testes", "rodar testes", "run", "launcher" -> 'run'
    - "histórico", "history" -> 'history'
    - "configurações", "settings" -> 'settings'
    - "sobre", "about" -> 'about'
12. If you are asked to create, modify or delete files for Robot Framework, you MUST adhere to the following rules:
    - Separate logic from tests: Test files (.robot) should ONLY contain BDD (Gherkin) scenarios.
    - All technical implementations (clicks, waits, etc) MUST reside in resource files (.resource) following the Page Object Model (POM) architecture.
    - Keywords MUST be parameterized to maximize reuse, including the Gherkin steps (e.g., '\${GHERKIN} I do something', so it can be used as 'When I do something').
    - Imports must be efficient and scoped correctly.
    - Analyze existing test files (.robot) to learn and reuse their 'Suite Setup', 'Test Setup', 'Suite Teardown', and 'Test Teardown' configurations when creating new tests.
    - The app does not magically open on the target screen. When creating tests for a specific screen, you MUST include the necessary Gherkin steps and Resource Keywords to navigate from the App's initial state (e.g. Home or Login) to the target screen.
    - When interacting with mapped screen elements, ALWAYS use the element's 'short_id' as the locator parameter. NEVER use the screen's 'id'.
    - Observe the existing folder structure in 'tests/' and 'resources/'. Always place new files inside appropriate subdirectories (e.g., by feature or screen) matching the existing project organization, rather than creating them at the root.
    - For 'modify_file' actions, you MUST provide the FULL and COMPLETE updated content of the file. Do NOT use placeholders (like '...', '// rest of the code', etc.). The file will be completely overwritten by your output.
13. When reading, exploring, or modifying the file system, you MUST strictly respect and ignore all files and directories specified in .gitignore, .claudeignore, and .geminiignore files.

JSON SCHEMA TO FOLLOW:
${JSON.stringify(AGENT_JSON_SCHEMA, null, 2)}
`;
}
