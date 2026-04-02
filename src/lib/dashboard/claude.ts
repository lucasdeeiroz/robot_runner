import { ScreenMap } from '@/lib/types';
import { AIGenerationType } from './gemini';

export async function generateRefinedTestCases(
    requirements: string,
    apiKey: string,
    model: string = 'claude-3-5-sonnet-20240620',
    language: string = 'en',
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
   Tags: [@tag1, ...]
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
            const errData = await response.json();
            throw new Error(errData.error?.message || `API Error: ${response.statusText}`);
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

export async function getAvailableModels(_apiKey: string): Promise<string[]> {
    // Anthropic doesn't have a reliable publicly accessible endpoint for this via simple fetch like Gemini's /models
    // We'll return a curated list of relevant Claude-3 models
    return [
        "claude-3-5-sonnet-20240620",
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307"
    ];
}
