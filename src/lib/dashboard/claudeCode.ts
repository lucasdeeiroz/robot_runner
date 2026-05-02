import { invoke } from '@tauri-apps/api/core';
import { ScreenMap, UIElementMap } from '@/lib/types';
import { AIGenerationType } from './gemini';
import { getExplorationPrompt, formatExistingMaps, getRefinedTestCasesPrompt, getRefinedPBIPrompt, getRefinedImprovementPrompt, getRefinedBugPrompt, getRefinedRobotScriptPrompt, getFlowchartLayoutPrompt, getQAAssistantWrapper, getExecutionSummaryPrompt } from "./prompts";

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

export async function askClaudeCode(
    prompt: string,
    projectRoot: string,
    systemInstruction?: string,
    token?: string,
    screenshotPath?: string
): Promise<string> {
    const formatReminder = "\n\nIMPORTANT: Respond ONLY with the requested format. Do NOT include greetings, pleasantries, or introductory text.";

    let fullPrompt = systemInstruction
        ? `SYSTEM_INSTRUCTIONS:\n${systemInstruction}${formatReminder}\n\nUSER_REQUEST:\n${prompt}`
        : prompt + formatReminder;

    if (screenshotPath) {
        fullPrompt += `\n\nNote: A screenshot is available at: ${screenshotPath}`;
    }

    try {
        const result = await invoke<string>('call_claude_code_cli', {
            prompt: fullPrompt,
            projectRoot,
            token,
            screenshotPath
        });

        if (!result) return "";

        const parsed = safeParseJson<any>(result);
        if (parsed && typeof parsed === 'object') {
            // Priority 1: The "result" field from Claude Code CLI --output-format json
            if (parsed.result !== undefined) {
                return String(parsed.result);
            }
            // Priority 2: Common AI completion fields
            const content = parsed.completion || parsed.text || parsed.content;
            if (content && typeof content === 'string') {
                return content;
            }
            // Priority 3: Error results
            if (parsed.is_error && parsed.result) {
                return String(parsed.result);
            }
            // If it's a small object that isn't the metadata wrapper, stringify it
            if (Object.keys(parsed).length < 5) {
                return JSON.stringify(parsed);
            }
        }
        return String(result);
    } catch (error: any) {
        console.error("[Claude CLI] Invocation failed:", error);
        const errorStr = String(error);

        if (errorStr.includes("Not logged in") || errorStr.includes("/login")) {
            throw new Error("Claude CLI: You are not logged in. If you provided a token in settings, check if it is correct. Otherwise, please run 'claude login' in your terminal.");
        }
        throw error;
    }
}

export async function generateRefinedTestCases(
    requirements: string,
    projectRoot: string,
    language: string,
    appMapping?: ScreenMap[] | string,
    generationType: AIGenerationType = 'test_case',
    customPrompt?: string,
    token?: string
): Promise<string> {
    let mappingContext = "";
    if (typeof appMapping === 'string') {
        mappingContext = appMapping;
    } else if (Array.isArray(appMapping) && appMapping.length > 0) {
        mappingContext = "\n\nAPPLICATION MAPPING:\n";
        appMapping.forEach(screen => {
            mappingContext += `- Screen: "${screen.name}" (${screen.type})\n`;
            screen.elements.forEach(el => {
                mappingContext += `  * Element: "${el.name}" (Type: ${el.type})\n`;
            });
        });
    }

    let promptString = "";
    switch (generationType) {
        case 'test_case': promptString = getRefinedTestCasesPrompt(language, customPrompt); break;
        case 'pbi': promptString = getRefinedPBIPrompt(language, customPrompt); break;
        case 'improvement': promptString = getRefinedImprovementPrompt(language, customPrompt); break;
        case 'bug': promptString = getRefinedBugPrompt(language, customPrompt); break;
        case 'robot_script': promptString = getRefinedRobotScriptPrompt(language, customPrompt); break;
    }

    const fullPrompt = `${getQAAssistantWrapper(promptString, !!appMapping, mappingContext, customPrompt)}\n\nINPUT REQUIREMENTS:\n${requirements}`;

    return await askClaudeCode(fullPrompt, projectRoot, undefined, token);
}

export async function exploreScreen(
    xmlDump: string,
    projectRoot: string,
    language: string,
    existingMaps: ScreenMap[],
    sessionHistory: string[],
    customPrompt?: string,
    token?: string
): Promise<{
    screen: Partial<ScreenMap>;
    elements: UIElementMap[];
    nextAction: { type: 'click' | 'back' | 'swipe' | 'finish' | 'type_text'; targetId?: string; direction?: 'up' | 'down' | 'left' | 'right'; text?: string; details?: string };
    rationale: string;
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
${systemInstruction}

EXISTING MAPS:
${formatExistingMaps(existingMaps)}

SESSION HISTORY:
${actionLogs.slice(-20).join('\n')}

XML DUMP:
${xmlDump.substring(0, 15000)}
`.trim();

    const responseText = await askClaudeCode(prompt, projectRoot, undefined, token);
    return safeParseJson(responseText);
}

export async function summarizeExecution(
    tree: any[],
    projectRoot: string,
    language: string,
    failures: string[] = [],
    failureContext?: any[],
    customPrompt?: string,
    token?: string
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
${systemInstruction}

Execution Tree Structure:
${JSON.stringify(simplify(tree))}

FAILURES:
${failures.join('\n---\n')}

DETAILED CONTEXT (Includes screenshot paths if available):
${failureContext ? JSON.stringify(failureContext, null, 2) : 'None'}
`.trim();

    return await askClaudeCode(prompt, projectRoot, undefined, token);
}

export async function reorganizeFlowchartLayout(
    context: string,
    projectRoot: string,
    language: string,
    _history?: any[],
    customPrompt?: string,
    token?: string
): Promise<{ nodes: Record<string, { gridX: number; gridY: number }>; missed: string[] }> {
    const systemInstruction = getFlowchartLayoutPrompt(language, customPrompt);

    const prompt = `
${systemInstruction}

CONTEXT DATA:
${context}
`.trim();

    const responseText = await askClaudeCode(prompt, projectRoot, undefined, token);
    return safeParseJson(responseText);
}

export async function suggestElementName(
    attributes: any,
    screenName: string,
    projectRoot: string,
    language: string,
    existingMaps: any[],
    _model?: string,
    customPrompt?: string,
    token?: string
): Promise<{ name: string; justification: string }> {
    const prompt = `
You are a Senior QA Automation Engineer. Suggest a clean, descriptive name for a UI element in CamelCase, in ${language}.
Consider the screen name: "${screenName}" and existing element names in the application maps.

ELEMENT ATTRIBUTES:
${JSON.stringify(attributes, null, 2)}

EXISTING MAPS (context):
${JSON.stringify(existingMaps.slice(-5), null, 2)}

${customPrompt ? `ADDITIONAL INSTRUCTIONS:\n${customPrompt}` : ""}

RESPOND ONLY IN JSON FORMAT:
{
  "name": "SuggestedName",
  "justification": "Short reason why"
}
`.trim();

    const responseText = await askClaudeCode(prompt, projectRoot, undefined, token);
    return safeParseJson(responseText);
}

export async function suggestScreenTags(
    screenName: string,
    elements: any[],
    projectRoot: string,
    language: string,
    screenshotPath?: string,
    _model?: string,
    customPrompt?: string,
    token?: string
): Promise<string[]> {
    const prompt = `
Suggest 3 to 5 relevant tags (keywords) for this application screen based on its name and elements, in ${language}.
Screen Name: "${screenName}"
Elements: ${JSON.stringify(elements.slice(0, 20), null, 2)}

${customPrompt ? `ADDITIONAL INSTRUCTIONS:\n${customPrompt}` : ""}

RESPOND ONLY IN JSON FORMAT:
["tag1", "tag2", "tag3"]
`.trim();

    const responseText = await askClaudeCode(prompt, projectRoot, undefined, token, screenshotPath);
    return safeParseJson(responseText);
}

export async function analyzeTestHistory(
    historyData: any[],
    projectRoot: string,
    language: string,
    deepContext?: string,
    _signal?: AbortSignal,
    customPrompt?: string,
    token?: string
): Promise<string> {
    const prompt = `
You are an expert Test Lead. Analyze the following test execution history and identify patterns, common failures, and potential risks.
Execution Language: ${language}

HISTORY DATA SUMMARY:
${JSON.stringify(historyData.map(h => ({ name: h.name, status: h.status, device: h.device })), null, 2)}

DEEP CONTEXT ON FAILURES:
${deepContext || "No additional context available."}

${customPrompt ? `USER SPECIFIC REQUEST:\n${customPrompt}` : "Provide a comprehensive executive summary of the execution health."}
`.trim();

    return await askClaudeCode(prompt, projectRoot, undefined, token);
}

