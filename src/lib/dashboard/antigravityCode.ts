import { invoke } from '@tauri-apps/api/core';
import { ScreenMap, UIElementMap } from '@/lib/types';
import { AIGenerationType, AutonomousActionResponse } from './gemini';
import { getExplorationPrompt, formatExistingMaps, getRefinedTestCasesPrompt, getRefinedPBIPrompt, getRefinedImprovementPrompt, getRefinedBugPrompt, getRefinedRobotScriptPrompt, getFlowchartLayoutPrompt, getQAAssistantWrapper, getExecutionSummaryPrompt, getAutonomousAgentPrompt } from "./prompts";

/**
 * Robustly parses JSON from a string that might contain markdown backticks or other noise.
 */
function safeParseJson<T>(content: string): T {
    if (!content || typeof content !== 'string') return content as any;

    const trimmed = content.trim();
    try {
        return JSON.parse(trimmed);
    } catch (e) {
        // If that fails, look for JSON-like structures
        try {
            const firstBrace = content.indexOf('{');
            const lastBrace = content.lastIndexOf('}');
            const firstBracket = content.indexOf('[');
            const lastBracket = content.lastIndexOf(']');

            let startIndex = -1;
            let endIndex = -1;

            if (firstBrace !== -1 && (firstBracket === -1 || (firstBrace < firstBracket && firstBrace !== -1))) {
                startIndex = firstBrace;
                endIndex = lastBrace;
            } else if (firstBracket !== -1) {
                startIndex = firstBracket;
                endIndex = lastBracket;
            }

            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                const jsonString = content.substring(startIndex, endIndex + 1);
                return JSON.parse(jsonString);
            }
        } catch (innerError) {
            // Ignore inner error
        }
        return content as any;
    }
}

export interface AntigravityCLIResponse {
    result: string;
    structured_output?: any;
    session_id?: string;
    usage?: any;
}

/**
 * Inspects a parsed CLI response for Google API / Gemini error payloads and throws
 * a descriptive Error if found. Handles quota exhaustion (429), auth failures (401),
 * and other API-level errors so callers receive a clean, translatable message.
 */
function detectApiError(parsed: any): void {
    const err = parsed?.error;
    if (!err) return;

    const code: number = err.code ?? 0;
    const message: string = err.message ?? 'Unknown API error';
    const status: string = err.status ?? '';

    if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
        // Extract the human-readable reset delay from ErrorInfo details if present
        let resetDelay = '';
        const details: any[] = err.details ?? [];
        for (const detail of details) {
            if (detail?.metadata?.quotaResetDelay) {
                resetDelay = detail.metadata.quotaResetDelay;
                break;
            }
        }
        const resetSuffix = resetDelay ? ` Resets in ${resetDelay}.` : '';
        throw new Error(`QUOTA_EXHAUSTED:${resetSuffix || message}`);
    }

    if (code === 401 || status === 'UNAUTHENTICATED') {
        throw new Error(`AUTH_ERROR:${message}`);
    }

    // Generic API error fallback
    throw new Error(`API_ERROR:${message}`);
}


export async function askAntigravityCli(
    prompt: string,
    projectRoot: string,
    systemInstruction?: string,
    apiKey?: string,
    options?: {
        jsonSchema?: any;
        resumeSessionId?: string;
        imageBase64?: string;
    }
): Promise<string | AntigravityCLIResponse> {
    const formatReminder = options?.jsonSchema 
        ? `\n\nIMPORTANT: Respond ONLY with a valid JSON object matching this schema:\n${JSON.stringify(options.jsonSchema, null, 2)}\nDo NOT include greetings, markdown backticks, or any text outside the JSON object.` 
        : "\n\nIMPORTANT: Respond ONLY with the requested format. Do NOT include greetings, pleasantries, or introductory text.";

    let fullPrompt = prompt + formatReminder;

    let tempFilePath: string | null = null;
    let promptToPass = fullPrompt;

    try {
        if (fullPrompt.length > 7000) {
            const { join } = await import('@tauri-apps/api/path');
            tempFilePath = await join(projectRoot, '.rr_prompt.tmp');
            await invoke('fs_write_text_file', { path: tempFilePath, content: fullPrompt });
            promptToPass = "Read the file .rr_prompt.tmp for your full instructions and history. Execute the request.";
        }

        const cleanBase64 = options?.imageBase64?.includes('base64,') 
            ? options.imageBase64.split('base64,')[1] 
            : options?.imageBase64;

        const rawResult = await invoke<string>('call_antigravity_cli', {
            prompt: promptToPass,
            projectRoot,
            apiKey,
            systemInstruction,
            imageBase64: cleanBase64,
            jsonSchema: options?.jsonSchema ? JSON.stringify(options.jsonSchema) : undefined,
            resumeSessionId: options?.resumeSessionId
        });

        if (tempFilePath) {
            try {
                await invoke('fs_remove_file', { path: tempFilePath });
            } catch(e) {}
        }

        if (!rawResult) return "";

        const parsed = safeParseJson<any>(rawResult);
        if (parsed && typeof parsed === 'object') {
            // Detect and surface API-level errors (quota, auth, etc.) before any extraction
            detectApiError(parsed);
            detectApiError(parsed.response);

            if (options?.jsonSchema) {
                const targetObject = parsed.response !== undefined ? parsed.response : parsed;
                const structured = typeof targetObject === 'string' ? safeParseJson<any>(targetObject) : targetObject;
                if (structured && typeof structured === 'object') {
                    return {
                        result: typeof targetObject === 'string' ? targetObject : JSON.stringify(targetObject),
                        structured_output: structured,
                        session_id: parsed.session_id,
                        usage: parsed.usage || parsed.stats
                    };
                }
            }

            let mainContent = parsed.response !== undefined 
                ? parsed.response 
                : (parsed.result !== undefined ? parsed.result : (parsed.completion || parsed.text || parsed.content));

            if (mainContent === undefined) {
                mainContent = parsed;
            }

            if (mainContent && typeof mainContent === 'object') {
                mainContent = mainContent.reply !== undefined 
                    ? mainContent.reply 
                    : (mainContent.result !== undefined 
                        ? mainContent.result 
                        : (mainContent.text !== undefined 
                            ? mainContent.text 
                            : (mainContent.content !== undefined 
                                ? mainContent.content 
                                : mainContent)));
            }

            if (mainContent !== undefined) {
                return typeof mainContent === 'object' ? JSON.stringify(mainContent) : String(mainContent);
            }
        }
        return String(rawResult);
    } catch (error: any) {
        if (tempFilePath) {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('fs_remove_file', { path: tempFilePath });
            } catch(e) {}
        }
        console.error("[Antigravity CLI] Invocation failed. Raw Error:", error, "Type:", typeof error);
        const errorStr = typeof error === 'string' ? error : (error?.message || String(error));
        throw new Error(errorStr);
    }
}

export async function generateRefinedTestCases(
    requirements: string,
    projectRoot: string,
    language: string,
    appMapping?: ScreenMap[] | string,
    generationType: AIGenerationType = 'test_case',
    customPrompt?: string,
    apiKey?: string
): Promise<string> {
    let mappingContext = "";
    if (typeof appMapping === 'string') {
        mappingContext = appMapping;
    } else if (Array.isArray(appMapping) && appMapping.length > 0) {
        mappingContext = "\n\nAPPLICATION MAPPING:\n";
        mappingContext += formatExistingMaps(appMapping);
    }

    let promptString = "";
    switch (generationType) {
        case 'test_case': promptString = getRefinedTestCasesPrompt(language, customPrompt); break;
        case 'pbi': promptString = getRefinedPBIPrompt(language, customPrompt); break;
        case 'improvement': promptString = getRefinedImprovementPrompt(language, customPrompt); break;
        case 'bug': promptString = getRefinedBugPrompt(language, customPrompt); break;
        case 'robot_script': promptString = getRefinedRobotScriptPrompt(language, customPrompt); break;
    }

    const systemInstruction = getQAAssistantWrapper(promptString, !!appMapping, mappingContext, customPrompt);
    const prompt = `INPUT REQUIREMENTS:\n${requirements}`;

    const response = await askAntigravityCli(prompt, projectRoot, systemInstruction, apiKey);
    return typeof response === 'string' ? response : response.result;
}

export async function exploreScreen(
    xmlDump: string,
    projectRoot: string,
    language: string,
    existingMaps: ScreenMap[],
    sessionHistory: string[],
    customPrompt?: string,
    apiKey?: string,
    resumeSessionId?: string,
    imageBase64?: string
): Promise<{
    screen: { name: string; type: string; description?: string; tags?: string[] };
    elements: UIElementMap[];
    nextAction: { type: 'click' | 'back' | 'swipe' | 'finish' | 'type_text'; targetId?: string; direction?: 'up' | 'down' | 'left' | 'right'; text?: string; details?: string };
    rationale: string;
    thought?: string;
    session_id?: string;
    needs_context_files?: string[];
}> {
    const systemInstruction = getExplorationPrompt(language, customPrompt);

    const actionLogs = sessionHistory.filter(log =>
        log.includes("---") ||
        log.includes("ACTION:") ||
        log.includes("AI:") ||
        log.includes("RATIONALE:") ||
        log.includes("ERROR:") ||
        log.includes("WARNING:") ||
        log.includes("FINISHED:")
    );

    const prompt = `
EXISTING MAPS:
${formatExistingMaps(existingMaps)}

SESSION HISTORY:
${actionLogs.slice(-20).join('\n')}

XML DUMP:
${xmlDump.substring(0, 15000)}
`.trim();

    const schema = {
        type: "object",
        properties: {
            screen: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    description: { type: "string" },
                    tags: { type: "array", items: { type: "string" } }
                }
            },
            elements: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        type: { type: "string" },
                        selector: { type: "string" },
                        id: { type: "string" }
                    }
                }
            },
            nextAction: {
                type: "object",
                properties: {
                    type: { type: "string", enum: ["click", "back", "swipe", "finish", "type_text"] },
                    targetId: { type: "string" },
                    direction: { type: "string" },
                    text: { type: "string" },
                    details: { type: "string" }
                }
            },
            rationale: { type: "string" },
            thought: { type: "string" }
        },
        required: ["screen", "elements", "nextAction", "rationale"]
    };

    const response = await askAntigravityCli(prompt, projectRoot, systemInstruction, apiKey, {
        jsonSchema: schema,
        resumeSessionId,
        imageBase64
    });

    let result: any;
    if (typeof response !== 'string' && response.structured_output) {
        result = response.structured_output;
        if (response.session_id) {
            result.session_id = response.session_id;
        }
    } else {
        result = safeParseJson(typeof response === 'string' ? response : response.result);
    }
    return result;
}

export async function summarizeExecution(
    tree: any[],
    projectRoot: string,
    language: string,
    failures: string[] = [],
    failureContext?: any[],
    customPrompt?: string,
    apiKey?: string,
    imageBase64?: string
): Promise<string> {
    const stats = { passed: 0, failed: 0 };
    const calculateStats = (nodes: any[]) => {
        nodes.forEach(n => {
            if (n.status === 'PASS') stats.passed++;
            else if (n.status === 'FAIL') stats.failed++;
            if (n.children) calculateStats(n.children);
        });
    };
    calculateStats(tree);

    const totalTests = stats.passed + stats.failed;
    const systemInstruction = getExecutionSummaryPrompt(language, totalTests, customPrompt);

    const simplify = (nodes: any[]): any[] => {
        return nodes.map(n => ({
            name: n.name,
            status: n.status,
            type: n.type,
            children: n.children ? simplify(n.children) : undefined
        }));
    };

    const prompt = `
Execution Tree Structure:
${JSON.stringify(simplify(tree))}

FAILURES:
${failures.join('\n---\n')}

DETAILED CONTEXT (Includes screenshot paths if available):
${failureContext ? JSON.stringify(failureContext, null, 2) : 'None'}
`.trim();

    const response = await askAntigravityCli(prompt, projectRoot, systemInstruction, apiKey, {
        imageBase64
    });
    return typeof response === 'string' ? response : response.result;
}

export async function reorganizeFlowchartLayout(
    context: string,
    projectRoot: string,
    language: string,
    _history?: any[],
    customPrompt?: string,
    apiKey?: string
): Promise<{ nodes: Record<string, { gridX: number; gridY: number }>; missed: string[] }> {
    const systemInstruction = getFlowchartLayoutPrompt(language, customPrompt);

    const prompt = `
CONTEXT DATA:
${context}
`.trim();

    const schema = {
        type: "object",
        properties: {
            nodes: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    properties: {
                        gridX: { type: "number" },
                        gridY: { type: "number" }
                    }
                }
            },
            missed: {
                type: "array",
                items: { type: "string" }
            }
        },
        required: ["nodes", "missed"]
    };

    const response = await askAntigravityCli(prompt, projectRoot, systemInstruction, apiKey, {
        jsonSchema: schema
    });

    if (typeof response !== 'string' && response.structured_output) {
        return response.structured_output;
    }
    return safeParseJson(typeof response === 'string' ? response : response.result);
}

export async function suggestElementName(
    attributes: any,
    screenName: string,
    projectRoot: string,
    language: string,
    existingMaps: any[],
    customPrompt?: string,
    apiKey?: string,
    imageBase64?: string
): Promise<{ name: string; justification: string }> {
    const prompt = `
Suggest a clean, descriptive name for a UI element in CamelCase, in ${language}.
Consider the screen name: "${screenName}" and existing element names in the application maps.

ELEMENT ATTRIBUTES:
${JSON.stringify(attributes, null, 2)}

EXISTING MAPS (context):
${JSON.stringify(existingMaps.slice(-5), null, 2)}

${customPrompt ? `ADDITIONAL INSTRUCTIONS:\n${customPrompt}` : ""}
`.trim();

    const systemInstruction = "You are a Senior QA Automation Engineer expert in Robot Framework and Appium.";

    const schema = {
        type: "object",
        properties: {
            name: { type: "string" },
            justification: { type: "string" }
        },
        required: ["name", "justification"]
    };

    const response = await askAntigravityCli(prompt, projectRoot, systemInstruction, apiKey, {
        jsonSchema: schema,
        imageBase64
    });

    if (typeof response !== 'string' && response.structured_output) {
        return response.structured_output;
    }
    return safeParseJson(typeof response === 'string' ? response : response.result);
}

export async function suggestScreenTags(
    screenName: string,
    elements: any[],
    projectRoot: string,
    language: string,
    customPrompt?: string,
    apiKey?: string,
    imageBase64?: string
): Promise<string[]> {
    const prompt = `
Suggest 3 to 5 relevant tags (keywords) for this application screen based on its name and elements, in ${language}.
Screen Name: "${screenName}"
Elements: ${JSON.stringify(elements.slice(0, 20), null, 2)}

${customPrompt ? `ADDITIONAL INSTRUCTIONS:\n${customPrompt}` : ""}
`.trim();

    const schema = {
        type: "array",
        items: { type: "string" },
        minItems: 1
    };

    const response = await askAntigravityCli(prompt, projectRoot, undefined, apiKey, {
        imageBase64,
        jsonSchema: schema
    });

    if (typeof response !== 'string' && response.structured_output) {
        return response.structured_output;
    }
    return safeParseJson(typeof response === 'string' ? response : response.result);
}

export async function analyzeTestHistory(
    historyData: any[],
    projectRoot: string,
    language: string,
    deepContext?: string,
    _signal?: AbortSignal,
    customPrompt?: string,
    apiKey?: string,
    imageBase64?: string
): Promise<string> {
    const prompt = `
Analyze the following test execution history and identify patterns, common failures, and potential risks.
Execution Language: ${language}

HISTORY DATA SUMMARY:
${JSON.stringify(historyData.map(h => ({ name: h.name, status: h.status, device: h.device })), null, 2)}

DEEP CONTEXT ON FAILURES:
${deepContext || "No additional context available."}

${customPrompt ? `USER SPECIFIC REQUEST:\n${customPrompt}` : "Provide a comprehensive executive summary of the execution health."}
`.trim();

    const systemInstruction = "You are an expert Test Lead and QA Architect.";

    const response = await askAntigravityCli(prompt, projectRoot, systemInstruction, apiKey, {
        imageBase64
    });
    return typeof response === 'string' ? response : response.result;
}

/**
 * Autonomous Action Generation using Antigravity CLI
 */
export async function generateAutonomousAction(
    xmlDump: string,
    targetScenario: string,
    history: string[],
    projectRoot: string,
    language: string,
    customPrompt?: string,
    apiKey?: string
): Promise<AutonomousActionResponse> {
    const systemInstruction = getAutonomousAgentPrompt(language, customPrompt);
    const prompt = `
TARGET SCENARIO:
${targetScenario}

SESSION HISTORY:
${history.join('\n')}

CURRENT XML DUMP:
${xmlDump.substring(0, 15000)}
`.trim();

    const schema = {
        type: "object",
        properties: {
            thought: { type: "string" },
            action: {
                type: "object",
                properties: {
                    type: { type: "string", enum: ["click", "type", "swipe", "back", "wait", "finish", "fail"] },
                    command: { type: "string" },
                    details: { type: "string" }
                },
                required: ["type", "command", "details"]
            },
            isStepCompleted: { type: "boolean" },
            nextExpectedState: { type: "string" }
        },
        required: ["thought", "action", "isStepCompleted", "nextExpectedState"]
    };

    const response = await askAntigravityCli(prompt, projectRoot, systemInstruction, apiKey, {
        jsonSchema: schema
    });

    if (typeof response !== 'string' && response.structured_output) {
        return response.structured_output;
    }
    return safeParseJson<AutonomousActionResponse>(typeof response === 'string' ? response : response.result);
}
