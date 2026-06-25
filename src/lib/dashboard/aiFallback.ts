export const modelsByProvider: Record<string, string[]> = {
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
        "gpt-5.5-pro"
    ]
};

/**
 * Higher-Order Function to execute an AI call with automatic model rotation on failure.
 * @param provider 'openai' | 'gemini' | 'claude'
 * @param baseModel The preferred model to try first
 * @param executeFn A callback containing the actual fetch/execution logic
 * @param logCallback Optional callback for logging fallback events
 */
export async function withModelRotation<T>(
    provider: 'openai' | 'gemini' | 'claude',
    baseModel: string,
    executeFn: (currentModel: string) => Promise<T>,
    logCallback?: (msg: string) => void
): Promise<T> {
    const fallbackList = modelsByProvider[provider] || [];

    // Construct the actual list to try: [baseModel, ...fallbacks_excluding_baseModel]
    const modelsToTry = [baseModel];
    for (const fb of fallbackList) {
        if (fb !== baseModel && !modelsToTry.includes(fb)) {
            modelsToTry.push(fb);
        }
    }

    let lastError: any;

    for (let i = 0; i < modelsToTry.length; i++) {
        const currentModel = modelsToTry[i];
        try {
            if (i > 0 && logCallback) {
                logCallback(`[Fallback] Switching to ${currentModel}...`);
            }
            const result = await executeFn(currentModel);
            return result;
        } catch (e: any) {
            lastError = e;
            const errMsg = e.message || e.toString() || "";

            // Do not retry on explicit authorization failures
            if (errMsg.includes("API Key") || errMsg.includes("401") || errMsg.includes("Unauthorized")) {
                throw e;
            }

            if (i < modelsToTry.length - 1) {
                if (logCallback) logCallback(`[Fallback] Failed with ${currentModel} (${errMsg}). Waiting 4s before retry...`);
                await new Promise(r => setTimeout(r, 4000));
            }
        }
    }

    throw lastError;
}
