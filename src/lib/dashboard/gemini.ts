
interface GeminiResponse {
    candidates: {
        content: {
            parts: {
                text: string;
            }[];
        };
    }[];
    error?: {
        message: string;
    };
}

import { ScreenMap } from '@/lib/types';

export type AIGenerationType = 'test_case' | 'pbi' | 'improvement' | 'bug';

export async function generateRefinedTestCases(
    requirements: string,
    apiKey: string,
    model: string = 'gemini-2.5-flash',
    language: string = 'en',
    appMapping?: ScreenMap[],
    generationType: AIGenerationType = 'test_case'
): Promise<string> {
    if (!apiKey) {
        throw new Error("Missing Gemini API Key");
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text: requirements }]
                }],
                system_instruction: {
                    parts: [{ text: systemInstruction }]
                },
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 8192,
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || `API Error: ${response.statusText}`);
        }

        const data: GeminiResponse = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error("Empty response from Gemini");
        }

        return text.trim();

    } catch (error: any) {
        console.error("Gemini API Error:", error);
        throw error;
    }
}

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) return [];

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.statusText}`);
        }
        const data = await response.json();
        return data.models
            .map((m: any) => m.name.replace('models/', ''))
            .filter((name: string) => name.includes('gemini'));
    } catch (e) {
        console.error("Failed to fetch Gemini models:", e);
        throw e;
    }
}
