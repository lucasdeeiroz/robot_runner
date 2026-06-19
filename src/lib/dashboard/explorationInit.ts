import { ExplorationConfig, DEFAULT_EXPLORATION_CONFIG } from './explorationEngine';
import { getExplorationInitPrompt } from './prompts';
import type { AppSettings } from '@/lib/settings';

const LIGHT_MODELS: Record<string, string> = {
    gemini: 'gemini-2.5-flash',
    claude: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
};

/**
 * Calls the lightest available model to extract ExplorationConfig from the user's prompt.
 * Always resolves — on any failure or timeout it returns DEFAULT_EXPLORATION_CONFIG.
 */
export async function analyzeExplorationPrompt(
    baseConfig: ExplorationConfig,
    userPrompt: string,
    useAi: boolean,
    settings: AppSettings,
    signal?: AbortSignal
): Promise<ExplorationConfig> {
    if (!useAi || !userPrompt || userPrompt.trim() === '') {
        return baseConfig;
    }

    const { aiProvider, geminiApiKey, claudeApiKey, openaiApiKey } = settings;

    const apiKey = aiProvider === 'gemini' ? geminiApiKey
                 : aiProvider === 'claude'  ? claudeApiKey
                 : openaiApiKey;

    if (!apiKey && aiProvider !== 'claude-code' && aiProvider !== 'antigravity-cli') {
        return baseConfig;
    }

    const lightModel = LIGHT_MODELS[aiProvider] ?? '';
    const systemPrompt = getExplorationInitPrompt();

    // Internal 15s timeout — slightly longer to accommodate CLI startup
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const effectiveSignal = signal ?? controller.signal;

    try {
        let rawText = '';

        if (aiProvider === 'gemini') {
            rawText = await callGeminiText(userPrompt, systemPrompt, apiKey as string, lightModel, effectiveSignal);
        } else if (aiProvider === 'claude') {
            rawText = await callClaudeText(userPrompt, systemPrompt, apiKey as string, lightModel, effectiveSignal);
        } else if (aiProvider === 'openai') {
            rawText = await callOpenAIText(userPrompt, systemPrompt, apiKey as string, lightModel, effectiveSignal);
        } else if (aiProvider === 'claude-code') {
            const { askClaudeCode } = await import('@/lib/dashboard/claudeCode');
            // Try to wrap CLI call in a Promise.race with signal
            const cliPromise = askClaudeCode(userPrompt, settings.paths?.automationRoot || '', systemPrompt, settings.claudeCodeToken);
            const result = await Promise.race([
                cliPromise,
                new Promise<any>((_, reject) => {
                    if (effectiveSignal.aborted) reject(new Error('Timeout'));
                    effectiveSignal.addEventListener('abort', () => reject(new Error('Timeout')));
                })
            ]);
            rawText = typeof result === 'string' ? result : result.result;
        } else if (aiProvider === 'antigravity-cli') {
            const { askAntigravityCli } = await import('@/lib/dashboard/antigravityCode');
            const cliPromise = askAntigravityCli(userPrompt, settings.paths?.automationRoot || '', systemPrompt, settings.antigravityApiKey);
            const result = await Promise.race([
                cliPromise,
                new Promise<any>((_, reject) => {
                    if (effectiveSignal.aborted) reject(new Error('Timeout'));
                    effectiveSignal.addEventListener('abort', () => reject(new Error('Timeout')));
                })
            ]);
            rawText = typeof result === 'string' ? result : result.result;
        }

        const aiConfig = parseConfig(rawText);

        // Merge AI rules with base config
        return {
            ...baseConfig,
            priorityKeywords: [...new Set([...baseConfig.priorityKeywords, ...aiConfig.priorityKeywords])],
            avoidKeywords: [...new Set([...baseConfig.avoidKeywords, ...aiConfig.avoidKeywords])],
            escapeTargets: [...new Set([...(baseConfig.escapeTargets || []), ...(aiConfig.escapeTargets || [])])],
            forceReexplore: [...new Set([...(baseConfig.forceReexplore || []), ...(aiConfig.forceReexplore || [])])]
        };

    } catch {
        console.log('[ExplorationInit] Failed to parse config, using base config.');
        return baseConfig;
    } finally {
        clearTimeout(timeoutId);
    }
}

// ---------------------------------------------------------------------------
// Minimal provider wrappers — text-in / text-out, no image, no history
// ---------------------------------------------------------------------------

async function callGeminiText(
    userPrompt: string,
    systemPrompt: string,
    apiKey: string,
    model: string,
    signal: AbortSignal
): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callClaudeText(
    userPrompt: string,
    systemPrompt: string,
    apiKey: string,
    model: string,
    signal: AbortSignal
): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        signal,
        body: JSON.stringify({
            model,
            max_tokens: 512,
            temperature: 0.1,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });
    if (!response.ok) throw new Error(`Claude ${response.status}`);
    const data = await response.json();
    return data.content?.[0]?.text ?? '';
}

async function callOpenAIText(
    userPrompt: string,
    systemPrompt: string,
    apiKey: string,
    model: string,
    signal: AbortSignal
): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        signal,
        body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 512,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
}

// ---------------------------------------------------------------------------
// JSON parsing — tolerant, never throws
// ---------------------------------------------------------------------------

function parseConfig(raw: string): ExplorationConfig {
    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return DEFAULT_EXPLORATION_CONFIG;
        const parsed = JSON.parse(match[0]);
        const config = {
            priorityKeywords: Array.isArray(parsed.priorityKeywords) ? parsed.priorityKeywords.map(String) : [],
            avoidKeywords:    Array.isArray(parsed.avoidKeywords)    ? parsed.avoidKeywords.map(String)    : [],
            escapeTargets:    Array.isArray(parsed.escapeTargets)    ? parsed.escapeTargets.map(String)    : [],
            forceReexplore:   Array.isArray(parsed.forceReexplore)   ? parsed.forceReexplore.map(String)   : [],
            revisitKnownScreens: Boolean(parsed.revisitKnownScreens),
        };
        console.log('[ExplorationInit] Parsed Configuration from AI:', config);
        return config;
    } catch {
        console.log('[ExplorationInit] Failed to parse config, using defaults.');
        return DEFAULT_EXPLORATION_CONFIG;
    }
}
