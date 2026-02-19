


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

export async function generateRefinedTestCases(
    requirements: string,
    apiKey: string,
    model: string = 'gemini-2.5-flash',
    language: string = 'en'
): Promise<string> {
    if (!apiKey) {
        throw new Error("Missing Gemini API Key");
    }

    const systemInstruction = `
You are a Senior QA Automation Engineer expert in Robot Framework (BDD).
Your task is to convert the user's raw requirements/acceptance criteria into well-structured Gherkin (BDD) test scenarios.

RULES:
1. Output ONLY the raw test scenarios. Do not include markdown code blocks (like \`\`\`gherkin), headers, or introductory text.
2. Use the following format for each scenario:
'''   
   Story: [Story ID] - [Concise Story Title]

   Scenario [number]: [Concise Test Title]
   Tags: [@tag1, @tag2, ...]

   Given [context]
   When [action]
   Then [expected result]

   Steps:
   - [step 1]
   - [step 2]
   - [step 3]
   ...
'''
3. Maintain the language specified by the user (${language}). If needed, translate the Gherkin steps and the words 'Scenario', 'Story' and 'Steps' to the specified language.
4. If the input is vague, infer the most logical Happy Path and at least one Sad Path.
5. Keep steps concise and reusable.
6. Identify the story id and names if possible. If not found, use "000000" as the ID and "N/A" as the name.
7. The output has only one story, but it can have multiple scenarios.
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
        // data.models is an array of objects like { name: "models/gemini-pro", ... }
        // We want to extract "gemini-pro" from "models/gemini-pro"
        return data.models
            .map((m: any) => m.name.replace('models/', ''))
            .filter((name: string) => name.includes('gemini'));
    } catch (e) {
        console.error("Failed to fetch Gemini models:", e);
        throw e;
    }
}
