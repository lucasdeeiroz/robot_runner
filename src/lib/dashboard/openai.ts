import { ScreenMap } from '@/lib/types';
import { AIGenerationType } from './gemini';

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
    model: string = 'gpt-4o',
    language: string = 'en',
    appMapping?: ScreenMap[],
    generationType: AIGenerationType = 'test_case'
): Promise<string> {
    if (!apiKey) {
        throw new Error("Missing OpenAI API Key");
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

    let typeSpecificRules = "";
    let mainObjective = "";

    switch (generationType) {
        case 'test_case':
            mainObjective = "convert the user's raw requirements into well-structured Gherkin (BDD) test scenarios.";
            typeSpecificRules = `
1. Use the Gherkin format (Given/When/Then).
2. For each scenario, include:
   Story: [Story ID] - [Title]
   Scenario [number]: [Title]
   Given [context]
   When [action]
   Then [expected result]
   Steps:
   - [step 1]
   ...
3. If input is vague, infer Happy Path and at least one Sad Path.
4. Separate multiple scenarios for the same story.
`.trim();
            break;
        case 'pbi':
            mainObjective = "convert requirements into detailed Product Backlog Items (PBIs/User Stories).";
            typeSpecificRules = `
1. Format each PBI as:
   PBI: [ID] - [Title]
   As a [role], I want [action], so that [value/benefit].
   
   Acceptance Criteria:
   - [point 1]
   - [point 2]
   ...
2. Focus on the user perspective and business value.
`.trim();
            break;
        case 'improvement':
            mainObjective = "analyze requirements and suggest UI/UX or functional improvements.";
            typeSpecificRules = `
1. Format as a list of improvements:
   Improvement [number]: [Title]
   Description: [What to change]
   Rationale: [Why this is an improvement]
   Priority: [Low/Medium/High]
2. Suggest enhancements that would make the feature more robust or user-friendly.
`.trim();
            break;
        case 'bug':
            mainObjective = "transform a bug description into a professional, structured bug report.";
            typeSpecificRules = `
1. Format as:
   Bug Report: [Title]
   Severity: [S1/S2/S3]
   
   Summary: [Brief description]
   
   Steps to Reproduce:
   1. [Step 1]
   2. [Step 2]
   ...
   
   Actual Result: [What currently happens]
   Expected Result: [What should happen]
   
   Notes: [Optional environment details or hints]
`.trim();
            break;
        case 'robot_script':
            mainObjective = "generate a complete, functional Robot Framework (.robot) script block.";
            typeSpecificRules = `
1. Use the standard structure: *** Settings ***, *** Variables ***, *** Keywords ***, *** Test Cases ***.
2. In *** Settings ***, include Library AppiumLibrary.
3. In *** Keywords ***, create high-level keywords based on the user requirement. Use the provided APPLICATION MAPPING elements for locators.
4. If an element name from mapping is found, use it as a basis for the keyword action (e.g., if mapped "Login Button", use its XPath/ID).
5. Ensure the script is valid and follows best practices for mobile automation.
`.trim();
            break;
    }

    const systemInstruction = `
You are a Senior QA Specialist and Product Owner assistant.
Your task is to ${mainObjective}

RULES:
1. Output ONLY the raw content without markdown code blocks, headers, or introductory text.
2. ${typeSpecificRules}
3. Maintain the language specified by the user (${language}). Translate all headers (Scenario, Bug Report, etc.) and the response structure to this language.
4. Keep the content professional, concise, and technically accurate.
5. ${appMapping ? "PRIORITIZE using the names and screens provided in the APPLICATION MAPPING context below. If a requirement mentions an action that matches a mapped element, use that element's specific name." : "Use generic but clear terminology."}
${mappingContext}
`.trim();

    const url = "https://api.openai.com/v1/chat/completions";

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemInstruction },
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
        const text = data.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error("Empty response from OpenAI");
        }

        return text.trim();

    } catch (error: any) {
        console.error("OpenAI API Error:", error);
        throw error;
    }
}

/**
 * Generic AI query for OpenAI with multi-modal (image) support.
 */
export async function askOpenAI(
    prompt: string,
    apiKey: string,
    model: string = 'gpt-4o',
    systemInstruction?: string,
    imageBase64?: string
): Promise<string> {
    if (!apiKey) throw new Error("Missing OpenAI API Key");

    const url = "https://api.openai.com/v1/chat/completions";

    const userContent: any[] = [{ type: "text", text: prompt }];

    if (imageBase64) {
        const { mimeType, data } = extractBase64Data(imageBase64);
        userContent.push({
            type: "image_url",
            image_url: {
                url: `data:${mimeType};base64,${data}`
            }
        });
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    systemInstruction ? { role: 'system', content: systemInstruction } : null,
                    { role: 'user', content: userContent }
                ].filter(Boolean),
                temperature: 0.4
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || (typeof errData === 'string' ? errData : JSON.stringify(errData));
            throw (new Error(errMsg || `API Error: ${response.statusText}`));
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error("Empty response from OpenAI");

        return text.trim();
    } catch (error: any) {
        console.error("OpenAI API Error (askOpenAI):", error);
        throw error;
    }
}

export async function getAvailableModels(_apiKey: string): Promise<string[]> {
    return [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo"
    ];
}

export async function suggestElementName(
    elementAttr: Record<string, string>,
    screenName: string,
    apiKey: string,
    model: string = 'gpt-4o-mini',
    language: string = 'en',
    appMapping?: ScreenMap[]
): Promise<{ name: string; justification: string }> {
    if (!apiKey) throw new Error("Missing OpenAI API Key");

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

    const prompt = `
Context: Professional QA Engineering and Test Automation.
Task: Suggest a descriptive name and a brief justification for this UI element found in the screen "${screenName}".

Element Attributes:
${Object.entries(elementAttr).filter(([_, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
${mappingContext}

Rules:
1. Use "Space Separated" convention for the name (e.g., "Login Button", "Username Input").
2. Respond in this language: ${language}.
3. Return ONLY a valid JSON object with the following keys:
   - "name": The suggested name.
   - "justification": A brief explanation of why this name was chosen based on the attributes and existing context.
`.trim();

    const url = "https://api.openai.com/v1/chat/completions";

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: "You are a professional QA automation naming assistant. Respond with JSON." },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1,
                max_tokens: 512
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || JSON.stringify(errData);
            throw new Error(errMsg || `API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
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
            console.error("Failed to parse OpenAI response:", content);
            throw new Error("Invalid AI response format");
        }
    } catch (e: any) {
        console.error("OpenAI suggestElementName failure:", e);
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
    model: string = 'gpt-4o',
    language: string = 'en',
    imageBase64?: string
): Promise<string[]> {
    if (!apiKey) throw new Error("Missing OpenAI API Key");

    const systemInstruction = `
You are a QA Architect.
Analyze the screen components and optionally the provided screenshot to suggest 3 to 5 highly relevant semantic tags.
Tags should be dynamic, context-aware, and useful for organizing a large test suite.
Examples: "Authentication", "User Profile", "Social Media", "Shopping Cart", "Form Validation".
Respond ONLY in a comma-separated list of tags in this language: ${language}.
`.trim();

    const prompt = `
Screen Name: ${screenName}
Visible Elements:
${elements.map(el => `- Name: "${el.name}" (Type: ${el.type})`).join('\n')}
`.trim();

    try {
        const result = await askOpenAI(prompt, apiKey, model, systemInstruction, imageBase64);
        return result.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } catch (e) {
        console.error("OpenAI suggestScreenTags failure:", e);
        throw e;
    }
}

/**
 * Analyzes test history for flakiness and trends.
 */
export async function analyzeTestHistory(
    history: any[],
    apiKey: string,
    model: string = 'gpt-4o',
    language: string = 'en'
): Promise<string> {
    const systemInstruction = `
You are a Senior QA Automation Engineer and Data Analyst.
Analyze the provided test execution history to identify:
1. Flakiness: Tests that fail and pass intermittently under similar conditions.
2. Device/OS Specific issues: Patterns where failures occur only on certain setups.
3. Performance Trends: Significant increases in execution duration over time.
4. Overall suite health and recommendations for improvement.

Provide a comprehensive analysis in Markdown format.
Use professional tone and actionable insights.
Response language: ${language === 'pt' ? 'Portuguese' : language === 'es' ? 'Spanish' : 'English'}.
`.trim();

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
            fail: log.fail_count
        }));

    const prompt = `History Data (JSON):\n${JSON.stringify(historySummary)}`;

    try {
        return await askOpenAI(prompt, apiKey, model, systemInstruction);
    } catch (e) {
        console.error("OpenAI analyzeTestHistory failure:", e);
        throw e;
    }
}
