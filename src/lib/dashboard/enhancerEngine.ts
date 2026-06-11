import { ScreenMap, UIElementMap } from '@/lib/types';
import { askGemini } from './gemini';
import { askClaude } from './claude';
import { getEnhancerSystemPrompt } from './prompts';

export interface EnhanceResult {
    enhancedMaps: ScreenMap[];
    logs: string[];
}

export async function processAndEnhanceMaps(
    maps: ScreenMap[],
    provider: string,
    keys: { gemini?: string; claude?: string; openai?: string; antigravity?: string },
    onProgress: (msg: string) => void,
    abortSignal?: AbortSignal
): Promise<EnhanceResult> {
    const logs: string[] = [];
    const log = (msg: string) => {
        logs.push(msg);
        onProgress(msg);
    };

    log('Starting Programmatic Linter...');

    // 1. Programmatic Linter
    const enhancedMaps = JSON.parse(JSON.stringify(maps)) as ScreenMap[];

    // De-duplicate elements
    for (const map of enhancedMaps) {
        const uniqueElements = new Map<string, UIElementMap>();
        for (const el of map.elements) {
            const key = el.xpath || el.android_id || el.accessibility_id || el.text || el.id;
            if (!uniqueElements.has(key)) {
                uniqueElements.set(key, el);
            }
        }
        if (map.elements.length !== uniqueElements.size) {
            log(`Removed ${map.elements.length - uniqueElements.size} duplicates from ${map.name}`);
            map.elements = Array.from(uniqueElements.values());
        }
    }

    // Update navigates_to cross-references is not needed if we don't change screen IDs, 
    // but if the AI changes 'type' or suggests a better name, we might update it.
    // For now, we only ask AI to improve element names and screen descriptions.

    // 2. Filter maps needing enhancement
    const isGenericName = (name: string) => {
        return name.match(/^(Button|TextView|View|Image|EditText|ViewGroup)\s+\d+$/) || name.trim() === '';
    };

    const mapsToEnhance = enhancedMaps.filter(map => {
        const needsScreenDesc = !map.description || map.description.trim() === '';
        const hasGenericScreenName = map.name.startsWith('Screen_') || map.name.trim() === '';
        const hasGenericElements = map.elements.some(el => isGenericName(el.name));
        return needsScreenDesc || hasGenericElements || hasGenericScreenName;
    });

    if (mapsToEnhance.length === 0) {
        log('All screens and elements are already semantically named. No AI enhancement needed.');
        return { enhancedMaps, logs };
    }

    if (provider === 'gemini' && !keys.gemini) {
        log('Gemini API key is required. Stopping after programmatic Linter.');
        return { enhancedMaps, logs };
    }
    if (provider === 'claude' && !keys.claude) {
        log('Claude API key is required. Stopping after programmatic Linter.');
        return { enhancedMaps, logs };
    }
    if (provider === 'openai' && !keys.openai) {
        log('OpenAI API key is required. Stopping after programmatic Linter.');
        return { enhancedMaps, logs };
    }

    log(`Found ${mapsToEnhance.length} screens needing AI enhancement. Processing in batches...`);

    // 3. Chunk and call AI
    const CHUNK_SIZE = 3;
    for (let i = 0; i < mapsToEnhance.length; i += CHUNK_SIZE) {
        if (abortSignal?.aborted) {
            log('Enhancement cancelled by user.');
            throw new Error('Cancelled by user');
        }

        const chunk = mapsToEnhance.slice(i, i + CHUNK_SIZE);
        log(`Processing AI batch ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(mapsToEnhance.length / CHUNK_SIZE)}...`);

        const payload = chunk.map(m => {
            const genericElements = m.elements.filter(el => isGenericName(el.name));
            // Se não houver elementos genéricos, enviamos os 10 primeiros elementos nomeados apenas para dar contexto 
            // à IA para deduzir o 'newScreenName' e 'newDescription' (Rule: Context Reduction).
            const elementsToSend = genericElements.length > 0 ? genericElements : m.elements.slice(0, 10);

            return {
                id: m.id,
                name: m.name,
                elements: elementsToSend.map(el => ({
                    id: el.id,
                    name: el.name,
                    xpath: el.xpath,
                    text: el.text,
                    desc: el.accessibility_id
                }))
            };
        });

        const prompt = JSON.stringify(payload);

        const modelsByProvider: Record<string, string[]> = {
            'gemini': [
                'gemini-3.1-flash-lite',
                'gemini-2.5-flash-lite',
                'gemini-3.5-flash',
                'gemini-2.5-flash',
                'gemini-3-flash-preview'
            ],
            'claude': [
                "claude-haiku-4-5-20251001",
                "claude-sonnet-4-6",
                "claude-opus-4-8",
                "claude-fable"
            ],
            'openai': [
                "gpt-5.4-nano",
                "gpt-5.4-mini",
                "gpt-5.4",
                "gpt-5.5-pro",
                "gpt-3.5-turbo",
                "gpt-5.3-codex",
                "o4-mini-deep-research"
            ]
        };

        const activeModels = modelsByProvider[provider] || [];
        const maxRetries = activeModels.length > 0 ? activeModels.length - 1 : 2;

        let retryCount = 0;
        let success = false;
        while (retryCount <= maxRetries && !success) {
            try {
                let aiOutput = '';
                const currentModel = activeModels.length > 0 ? activeModels[retryCount] : '';

                if (retryCount > 0 && currentModel) {
                    log(`[Fallback] Switching to ${currentModel}...`);
                }

                if (provider === 'gemini') {
                    aiOutput = await askGemini(prompt, keys.gemini!, currentModel, getEnhancerSystemPrompt(), undefined, abortSignal);
                } else if (provider === 'claude') {
                    aiOutput = await askClaude(prompt, keys.claude!, currentModel, getEnhancerSystemPrompt(), undefined, abortSignal);
                } else if (provider === 'openai') {
                    const { askOpenAI } = await import('./openai');
                    aiOutput = await askOpenAI(prompt, keys.openai!, currentModel, getEnhancerSystemPrompt(), undefined, abortSignal);
                } else {
                    throw new Error(`Provider ${provider} is not supported for Batch Enhancement yet.`);
                }

                // Clean markdown code blocks
                let text = aiOutput.replace(/```json/gi, '').replace(/```/g, '').trim();

                // Extremely basic unterminated JSON array auto-fix
                if (!text.endsWith(']')) {
                    if (text.endsWith('}')) text += ']';
                    else if (text.endsWith('"')) text += '}]';
                }

                const aiResult = JSON.parse(text);

                // Merge AI result back into enhancedMaps
                if (Array.isArray(aiResult)) {
                    for (const aiScreen of aiResult) {
                        const targetMap = enhancedMaps.find(m => m.id === aiScreen.id);
                        if (targetMap) {
                            if (aiScreen.newScreenName && aiScreen.newScreenName.trim() !== '') {
                                targetMap.name = aiScreen.newScreenName.replace(/\s+/g, '');
                            }
                            if (aiScreen.newDescription) {
                                targetMap.description = aiScreen.newDescription;
                            }
                            if (aiScreen.type && ['screen', 'modal', 'tab', 'drawer'].includes(aiScreen.type)) {
                                targetMap.type = aiScreen.type as any;
                            }
                            if (Array.isArray(aiScreen.elements)) {
                                for (const aiEl of aiScreen.elements) {
                                    const targetEl = targetMap.elements.find(e => e.id === aiEl.id);
                                    if (targetEl && aiEl.newName && aiEl.newName.trim() !== '') {
                                        // Ensure camelCase or PascalCase for elements
                                        targetEl.name = aiEl.newName.replace(/\s+/g, '');
                                    }
                                }
                            }
                        }
                    }
                }

                success = true;
            } catch (err: any) {
                if (err.name === 'AbortError' || err.message === 'Cancelled by user') {
                    log('Enhancement request aborted.');
                    throw err;
                }
                retryCount++;
                log(`Error in batch (retry ${retryCount}/${maxRetries}): ${err.message}`);
                if (retryCount <= maxRetries) {
                    log(`Waiting 5 seconds before retry to respect rate limits...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    log(`Skipping batch after ${maxRetries} failures.`);
                }
            }
        }

        // Wait 4 seconds between batches to respect free tier rate limits (15 RPM)
        if (i + CHUNK_SIZE < mapsToEnhance.length) {
            await new Promise(resolve => setTimeout(resolve, 4000));
        }
    }

    log('Enhancement complete.');
    return { enhancedMaps, logs };
}
