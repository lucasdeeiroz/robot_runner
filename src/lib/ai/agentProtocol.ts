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
    | 'change_setting';

export interface AgentAction {
    type: AgentActionType;
    // Context-specific properties
    target?: string; // For navigate (e.g. 'settings', 'tests')
    path?: string; // For run_test (e.g. 'tests/login.robot')
    device?: string; // For adb, logcat, screenshot, run_test
    command?: string; // For execute_adb
    setting_key?: string; // For change_setting
    setting_value?: any; // For change_setting
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
                        enum: ["navigate", "run_test", "execute_adb", "capture_logcat", "take_screenshot", "open_toolbox", "change_setting"]
                    },
                    target: { type: "string", description: "Target tab for navigate (home, run, tests, dashboard, settings, about)." },
                    path: { type: "string", description: "File path or name of the test. ALWAYS provide this if the action is run_test." },
                    device: { type: "string", description: "Device name or serial. Provide this if the user specifies a device." },
                    command: { type: "string", description: "ADB command to execute." },
                    setting_key: { type: "string", description: "Setting key to change." },
                    setting_value: { type: "string", description: "Setting value to apply." },
                    description: { type: "string", description: "A brief, human-readable description of this action (e.g., 'Navigating to Settings')." }
                },
                required: ["type", "description"]
            }
        }
    },
    required: ["reply"]
};

export function getAgentSystemInstruction(context: string, language: string = "en_US"): string {
    return `You are the integrated AI Agent for Robot Runner, a desktop application for QA Mobile Automation.
Your goal is to assist the user by answering questions, analyzing logs, and executing tasks directly within the app.

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

JSON SCHEMA TO FOLLOW:
${JSON.stringify(AGENT_JSON_SCHEMA, null, 2)}
`;
}
