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
    abortSignal?: AbortSignal,
    t: (key: string, defaultText: string, options?: any) => string = (_k, d) => d
): Promise<EnhanceResult> {
    const logs: string[] = [];
    const log = (msg: string) => {
        logs.push(msg);
        onProgress(msg);
    };

    log(t('mapper.enhancer.starting_linter', 'Iniciando Linter Programático...'));

    // 1. Programmatic Linter
    const enhancedMaps = structuredClone(maps) as ScreenMap[];

    // De-duplicate elements
    for (const map of enhancedMaps) {
        const uniqueElements = new Map<string, UIElementMap>();
        for (const el of map.elements) {
            const key = el.id; // Use strict XPath ID. Fallbacks like 'text' incorrectly merge distinct elements
            if (!uniqueElements.has(key)) {
                uniqueElements.set(key, el);
            } else {
                // Merge exploration state from duplicates to prevent data loss
                const existing = uniqueElements.get(key)!;
                if (el.explored) existing.explored = true;
                if (el.navigates_to && !existing.navigates_to) existing.navigates_to = el.navigates_to;
            }
        }
        if (map.elements.length !== uniqueElements.size) {
            log(t('mapper.enhancer.removed_duplicates', 'Removidas {{count}} duplicatas de {{name}}', { count: map.elements.length - uniqueElements.size, name: map.name }));
            map.elements = Array.from(uniqueElements.values());
        }
    }

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
        log(t('mapper.enhancer.no_enhancement_needed', 'Todas as telas e elementos já estão nomeados semanticamente. Nenhuma melhoria por IA necessária.'));
        return { enhancedMaps, logs };
    }

    // Fallback CLI providers to Gemini for batch enhancement
    let effectiveProvider = provider;
    if (provider === 'claude-code' || provider === 'antigravity-cli') {
        effectiveProvider = 'gemini';
        log(t('mapper.enhancer.cli_fallback', 'Provedor CLI selecionado. Usando Gemini como fallback para a Melhoria em Lote.'));
    }

    if (effectiveProvider === 'gemini' && !keys.gemini) {
        log(t('mapper.enhancer.api_key_required', 'Chave API do Gemini é necessária. Parando após o Linter programático.'));
        return { enhancedMaps, logs };
    }
    if (effectiveProvider === 'claude' && !keys.claude) {
        log(t('mapper.enhancer.api_key_required', 'Chave API do Claude é necessária. Parando após o Linter programático.'));
        return { enhancedMaps, logs };
    }
    if (effectiveProvider === 'openai' && !keys.openai) {
        log(t('mapper.enhancer.api_key_required', 'Chave API da OpenAI é necessária. Parando após o Linter programático.'));
        return { enhancedMaps, logs };
    }

    log(t('mapper.enhancer.found_screens', 'Encontradas {{count}} telas precisando de melhoria por IA. Processando em lotes...', { count: mapsToEnhance.length }));

    // 3. Chunk and call AI
    const CHUNK_SIZE = 3;
    for (let i = 0; i < mapsToEnhance.length; i += CHUNK_SIZE) {
        if (abortSignal?.aborted) {
            log(t('mapper.exploration.cancelled', 'Enhancement cancelled'));
            throw new Error('Cancelled by user');
        }

        const chunk = mapsToEnhance.slice(i, i + CHUNK_SIZE);
        const currentBatch = Math.floor(i / CHUNK_SIZE) + 1;
        const totalBatches = Math.ceil(mapsToEnhance.length / CHUNK_SIZE);
        log(t('mapper.enhancer.processing_batch', 'Processando lote IA {{current}}/{{total}}...', { current: currentBatch, total: totalBatches }));

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
        const { withModelRotation } = await import('./aiFallback');

        await withModelRotation(
            effectiveProvider as 'openai' | 'gemini' | 'claude',
            '', // No base model, just use the fallback list sequentially
            async (currentModel) => {
                let aiOutput = '';

                if (effectiveProvider === 'gemini') {
                    aiOutput = await askGemini(prompt, keys.gemini!, currentModel, getEnhancerSystemPrompt(), undefined, abortSignal);
                } else if (effectiveProvider === 'claude') {
                    aiOutput = await askClaude(prompt, keys.claude!, currentModel, getEnhancerSystemPrompt(), undefined, abortSignal);
                } else if (effectiveProvider === 'openai') {
                    const { askOpenAI } = await import('./openai');
                    aiOutput = await askOpenAI(prompt, keys.openai!, currentModel, getEnhancerSystemPrompt(), undefined, abortSignal);
                } else {
                    throw new Error(`Provider ${effectiveProvider} is not supported for Batch Enhancement yet.`);
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
                            if (Array.isArray(aiScreen.tags)) {
                                targetMap.tags = aiScreen.tags
                                    .filter((t: any) => typeof t === 'string' && t.trim() !== '')
                                    .map((t: string) => t.trim())
                                    .slice(0, 3);
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
            },
            log
        );

        // Wait 4 seconds between batches to respect free tier rate limits (15 RPM)
        if (i + CHUNK_SIZE < mapsToEnhance.length) {
            await new Promise(resolve => setTimeout(resolve, 4000));
        }
    }

    log('Enhancement complete.');
    return { enhancedMaps, logs };
}
