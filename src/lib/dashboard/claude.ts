import { ScreenMap, UIElementMap } from '@/lib/types';
import { AIGenerationType } from './gemini';
import { DeepAnalysisContext } from "./historyAnalysisUtils";
import { getExplorationPrompt, formatExistingMaps, getRefinedTestCasesPrompt, getRefinedPBIPrompt, getRefinedImprovementPrompt, getRefinedBugPrompt, getRefinedRobotScriptPrompt, getFlowchartLayoutPrompt, getElementNamingPrompt, getScreenTaggingPrompt, getTestHistoryAnalysisPrompt, getExecutionSummaryPrompt, getQAAssistantWrapper } from "./prompts";

function extractBase64Data(imageBase64: string): { mimeType: string, data: string } {
    const trimmed = imageBase64.trim();
    if (trimmed.includes(',')) {
        const [meta, data] = trimmed.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/png';
        return { mimeType, data: data.trim() };
    }
    return { mimeType: 'image/png', data: trimmed };
}

export async function generateRefinedTestCases(
    requirements: string,
    apiKey: string,
    model: string,
    language: string,
    appMapping?: ScreenMap[],
    generationType: AIGenerationType = 'test_case'
): Promise<string> {
    if (!apiKey) {
        throw new Error("Missing Claude API Key");
    }

    let mappingContext = "";
    if (appMapping && appMapping.length > 0) {
        mappingContext = "\n\nAPPLICATION MAPPING (Use these element names and types for precision):\n";
        appMapping.forEach(screen => {
            mappingContext += `- Screen: "${screen.name}" (${screen.type})\n`;
            screen.elements.forEach(el => {
                mappingContext += `  * Element: "${el.name}" (Type: ${el.type})\n`;
            });
        });
    }

    let promptString = "";
    switch (generationType) {
        case 'test_case': promptString = getRefinedTestCasesPrompt(language); break;
        case 'pbi': promptString = getRefinedPBIPrompt(language); break;
        case 'improvement': promptString = getRefinedImprovementPrompt(language); break;
        case 'bug': promptString = getRefinedBugPrompt(language); break;
        case 'robot_script': promptString = getRefinedRobotScriptPrompt(language); break;
    }

    const systemInstruction = getQAAssistantWrapper(promptString, !!appMapping, mappingContext);

    const url = "https://api.anthropic.com/v1/messages";

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 4096,
                system: systemInstruction,
                messages: [
                    { role: 'user', content: requirements }
                ],
                temperature: 0.4
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || (typeof errData === 'string' ? errData : JSON.stringify(errData));
            throw (new Error(errMsg || `API Error: ${response.statusText}`));
        }

        const data = await response.json();
        const text = data.content?.[0]?.text;

        if (!text) {
            throw new Error("Empty response from Claude");
        }

        return text.trim();

    } catch (error: any) {
        console.error("Claude API Error:", error);
        throw error;
    }
}

/**
 * Generic AI query for Claude with multi-modal (image) support.
 */
export async function askClaude(
    prompt: string,
    apiKey: string,
    model: string,
    systemInstruction?: string,
    imageBase64?: string
): Promise<string> {
    if (!apiKey) throw new Error("Missing Claude API Key");

    const url = "https://api.anthropic.com/v1/messages";

    const content: any[] = [];

    if (imageBase64) {
        const { mimeType, data } = extractBase64Data(imageBase64);
        content.push({
            type: "image",
            source: {
                type: "base64",
                media_type: mimeType,
                data
            }
        });
    }

    content.push({ type: "text", text: prompt });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                system: systemInstruction,
                messages: [{ role: 'user', content }],
                temperature: 0.4
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || (typeof errData === 'string' ? errData : JSON.stringify(errData));
            throw (new Error(errMsg || `API Error: ${response.statusText}`));
        }

        const data = await response.json();
        const text = data.content?.[0]?.text;
        if (!text) throw new Error("Empty response from Claude");

        return text.trim();
    } catch (error: any) {
        console.error("Claude API Error (askClaude):", error, content);
        throw error;
    }
}

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    const fallbackModels = [
        "claude-opus-4-6",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001"
    ];

    if (!apiKey) return fallbackModels;

    try {
        const response = await fetch("https://api.anthropic.com/v1/models", {
            method: 'GET',
            headers: {
                'anthropic-version': '2023-06-01',
                'X-Api-Key': apiKey
            }
        });

        if (!response.ok) {
            console.warn("Failed to fetch Anthropic models, using fallback.", response.statusText);
            return fallbackModels;
        }

        const data = await response.json();
        if (data && Array.isArray(data.data)) {
            return data.data.map((m: any) => m.id).sort();
        }
        return fallbackModels;
    } catch (error) {
        console.error("Error fetching Anthropic models:", error);
        return fallbackModels;
    }
}

export async function suggestElementName(
    elementAttr: Record<string, string>,
    screenName: string,
    apiKey: string,
    model: string,
    language: string,
    appMapping?: ScreenMap[]
): Promise<{ name: string; justification: string }> {
    if (!apiKey) throw new Error("Missing Claude API Key");

    let mappingContext = "";
    if (appMapping && appMapping.length > 0) {
        mappingContext = "\n\nAPPLICATION MAPPING (Context of other screens for naming consistency):\n";
        appMapping.forEach(screen => {
            mappingContext += `- Screen: "${screen.name}"\n`;
            screen.elements.forEach(el => {
                mappingContext += `  * Element: "${el.name}" (Type: ${el.type})\n`;
            });
        });
    }

    const prompt = getElementNamingPrompt(screenName, elementAttr, language, mappingContext);

    const url = "https://api.anthropic.com/v1/messages";

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: 40,
                system: "You are a professional QA automation naming assistant. Return ONLY the name requested.",
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || JSON.stringify(errData);
            throw new Error(errMsg || `API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.content?.[0]?.text;
        if (!content) {
            throw new Error("Empty AI response");
        }

        try {
            const parsed = JSON.parse(content);
            return {
                name: parsed.name?.replace(/["']/g, '') || "Unknown Element",
                justification: parsed.justification || ""
            };
        } catch (e) {
            console.error("Failed to parse Claude response:", content);
            throw new Error("Invalid AI response format");
        }
    } catch (e: any) {
        console.error("Claude suggestElementName failure:", e);
        throw e;
    }
}

/**
 * Suggests dynamic semantic tags for a screen based on its context.
 */
export async function suggestScreenTags(
    screenName: string,
    elements: any[],
    apiKey: string,
    model: string,
    language: string,
    imageBase64?: string
): Promise<string[]> {
    if (!apiKey) throw new Error("Missing Claude API Key");

    const systemInstruction = getScreenTaggingPrompt(language);

    const prompt = `
Screen Name: ${screenName}
Visible Elements:
${elements.map(el => `- Name: "${el.name}" (Type: ${el.type})`).join('\n')}
`.trim();

    try {
        const result = await askClaude(prompt, apiKey, model, systemInstruction, imageBase64);
        return result.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } catch (e) {
        console.error("Claude suggestScreenTags failure:", e);
        throw e;
    }
}

/**
 * Analyzes test history for flakiness and trends.
 */
export async function analyzeTestHistory(
    history: any[],
    apiKey: string,
    model: string,
    language: string,
    deepContext?: Record<string, DeepAnalysisContext>
): Promise<string> {
    const systemInstruction = getTestHistoryAnalysisPrompt(language);

    const historySummary = history
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 60)
        .map(log => ({
            suite: log.suite_name,
            status: log.status,
            device: log.device_model,
            os: log.android_version,
            time: log.timestamp,
            duration: log.duration,
            pass: log.pass_count,
            fail: log.fail_count,
            failedTests: log.failed_tests || []
        }));

    const deepContextStr = deepContext && Object.keys(deepContext).length > 0
        ? `\n\nDEEP CONTEXT (Performance & Detailed Logs):\n${JSON.stringify(deepContext, null, 2)}`
        : "";

    const prompt = `History Data (JSON):\n${JSON.stringify(historySummary)}${deepContextStr}`;

    try {
        return await askClaude(prompt, apiKey, model, systemInstruction);
    } catch (e) {
        console.error("Claude analyzeTestHistory failure:", e);
        throw e;
    }
}

/**
 * Summarizes the current execution suite.
 */
export async function summarizeExecution(
    tree: any[],
    apiKey: string,
    model: string,
    language: string,
    failureContext?: any[]
): Promise<string> {
    const cleanAnsi = (l: string) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');

    const failures: string[] = [];

    const extractFailures = (nodes: any[]) => {
        nodes.forEach(n => {
            if (n.status === 'FAIL') {
                let failInfo = `NODE: ${n.name} (${n.type})\n`;
                if (n.summary) failInfo += `SUMMARY: ${n.summary}\n`;

                const collectedLogs: string[] = [];
                if (n.failureDetail?.message) collectedLogs.push(`ERROR MESSAGE: ${n.failureDetail.message}`);
                if (n.logs && n.logs.length > 0) collectedLogs.push(...n.logs.slice(-20).map((l: string) => cleanAnsi(l)));
                if (n.children) {
                    const textChildren = n.children
                        .filter((c: any) => c.type === 'text')
                        .map((c: any) => cleanAnsi(c.content));
                    collectedLogs.push(...textChildren.slice(-20));
                }

                if (collectedLogs.length > 0) {
                    failInfo += `TECHNICAL DETAILS:\n${collectedLogs.join('\n')}\n`;
                }
                failures.push(failInfo);
            }
            if (n.children && n.children.length > 0) extractFailures(n.children);
        });
    };

    extractFailures(tree);

    const stats = { passed: 0, failed: 0 };
    const calculateStats = (nodes: any[]) => {
        if (!nodes || !Array.isArray(nodes)) return;
        nodes.forEach(n => {
            if (n.type === 'test') {
                if (n.status === 'PASS') stats.passed++;
                else stats.failed++;
            }
            if (n.children && Array.isArray(n.children) && n.children.length > 0) {
                calculateStats(n.children);
            }
        });
    };

    // Optimization: if the root is a single suite with pre-calculated stats, use them
    if (tree.length === 1 && tree[0].type === 'suite' && tree[0].stats) {
        stats.passed = tree[0].stats.passed || 0;
        stats.failed = tree[0].stats.failed || 0;
    } else {
        calculateStats(tree);
    }

    const totalTests = stats.passed + stats.failed;
    const successRate = totalTests > 0 ? ((stats.passed / totalTests) * 100).toFixed(1) : "0";

    const systemInstruction = getExecutionSummaryPrompt(language, totalTests);

    // Simplify tree for tokens (only structure + stats)
    const simplify = (nodes: any[]): any[] => {
        return nodes.map(n => ({
            name: n.name,
            status: n.status,
            type: n.type,
            stats: n.stats,
            children: n.children ? simplify(n.children) : undefined
        }));
    };

    const overallStats = `\n\nOVERALL STATISTICS:\n- Total Tests: ${totalTests}\n- Passed: ${stats.passed}\n- Failed: ${stats.failed}\n- Success Rate: ${successRate}%\n`;

    const failureContextStr = failureContext && failureContext.length > 0
        ? `\n\nFAILURE CONTEXT (Detailed logs for failed tests):\n${failureContext.map(f => {
            let info = `TEST: ${f.name}\n`;
            if (f.failureDetail?.message) info += `ERROR: ${f.failureDetail.message}\n`;
            if (f.logs && f.logs.length > 0) info += `LOGS:\n${f.logs.slice(-10).join('\n')}\n`;
            return info;
        }).join('\n---\n')}`
        : failures.length > 0
            ? `\n\nFAILURE CONTEXT (Detailed logs for failed tests):\n${failures.join('\n---\n')}`
            : "\n\nNo failures detected in the technical logs.";

    const prompt = `Execution Tree Structure:\n${JSON.stringify(simplify(tree))}${overallStats}${failureContextStr}`;

    try {
        return await askClaude(prompt, apiKey, model, systemInstruction, undefined);
    } catch (e) {
        console.error("Claude summarizeExecution failure:", e);
        throw e;
    }
}

/**
 * Autonomous Exploration: Analyzes a screen and decides the next action.
 */
export async function exploreScreen(
    xmlDump: string,
    screenshotBase64: string,
    apiKey: string,
    model: string,
    language: string,
    existingMaps: ScreenMap[],
    sessionHistory: string[]
): Promise<{
    screen: Partial<ScreenMap>;
    elements: UIElementMap[];
    nextAction: { type: 'click' | 'back' | 'swipe' | 'finish' | 'type_text'; targetId?: string; direction?: 'up' | 'down' | 'left' | 'right'; text?: string; details?: string };
    rationale: string;
}> {
    if (!apiKey) throw new Error("Missing Claude API Key");

    const systemInstruction = getExplorationPrompt(language);

    const actionLogs = sessionHistory.filter(log =>
        log.includes("--- Step") ||
        log.includes("Clicking element:") ||
        log.includes("Swiping") ||
        log.includes("Navigating back") ||
        log.includes("AI mapped:") ||
        log.includes("Typing text on:") ||
        log.includes("Loop detected") ||
        log.includes("Exploration stopped") ||
        log.includes("App exit detected") ||
        log.includes("Exploration finished")
    );

    const prompt = `
EXISTING MAPS (Mapped screens so far):
${formatExistingMaps(existingMaps)}

SESSION HISTORY (Action logs):
${actionLogs.slice(-50).join('\n')}

XML DUMP:
${xmlDump.substring(0, 15000)}
`.trim();

    const url = "https://api.anthropic.com/v1/messages";
    const { mimeType, data } = extractBase64Data(screenshotBase64);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                system: systemInstruction,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: mimeType,
                                    data
                                }
                            },
                            {
                                type: "text",
                                text: prompt
                            }
                        ]
                    }
                ],
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `API Error: ${response.statusText}`);
        }

        const resData = await response.json();
        const content = resData.content?.[0]?.text;
        if (!content) throw new Error("Empty response from Claude");

        return JSON.parse(content);
    } catch (error: any) {
        console.error("Claude exploreScreen Error:", error);
        throw error;
    }
}

/**
 * AI-powered flowchart reorganization using Claude.
 */
export async function reorganizeFlowchartLayout(
    maps: ScreenMap[],
    apiKey: string,
    model: string,
    language: string
): Promise<Record<string, { gridX: number; gridY: number }>> {
    if (!apiKey) throw new Error("Missing Claude API Key");

    const systemInstruction = getFlowchartLayoutPrompt(language);
    const mappingContext = formatExistingMaps(maps);

    const url = "https://api.anthropic.com/v1/messages";

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                system: systemInstruction,
                messages: [
                    { role: 'user', content: `Current Application Mapping:\n${mappingContext}` }
                ],
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `API Error: ${response.statusText}`);
        }

        const resData = await response.json();
        const content = resData.content?.[0]?.text;
        if (!content) throw new Error("Empty response from Claude");

        return JSON.parse(content);
    } catch (error: any) {
        console.error("Claude reorganizeFlowchartLayout Error:", error);
        throw error;
    }
}
