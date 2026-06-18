import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';

export interface NeedsContextFiles {
    needs_context_files?: string[];
}

export type AiCallFn<T> = (customPrompt: string | undefined) => Promise<T>;

/**
 * Wraps an AI function call with a RAG loop that reads files requested by the AI
 * and resubmits the prompt with the file contents appended.
 *
 * @param automationRoot The root path for the files.
 * @param initialCustomPrompt The initial custom prompt from the user.
 * @param onContextRequested Callback when files are requested.
 * @param aiCall The function that performs the AI call.
 */
export async function withRagLoop<T extends NeedsContextFiles>(
    automationRoot: string,
    initialCustomPrompt: string | undefined,
    onContextRequested: ((files: string[]) => void) | undefined,
    aiCall: AiCallFn<T>
): Promise<T> {
    let currentCustomPrompt = initialCustomPrompt;
    let result = await aiCall(currentCustomPrompt);
    
    // limit RAG loops to 3 to prevent infinite loops
    let loops = 0;
    while (result && result.needs_context_files && Array.isArray(result.needs_context_files) && result.needs_context_files.length > 0 && loops < 3) {
        loops++;
        const requestedFiles = result.needs_context_files;
        
        if (onContextRequested) {
            onContextRequested(requestedFiles);
        }
        
        let extraFileContents = "";
        
        for (const path of requestedFiles) {
            try {
                const fullPath = await join(automationRoot, path);
                const content = await invoke<string>('fs_read_text_file', { path: fullPath });
                extraFileContents += `\n--- CONTENT OF ${path} ---\n${content}\n`;
            } catch (e) {
                extraFileContents += `\n--- CONTENT OF ${path} ---\n(File could not be read: ${e})\n`;
            }
        }
        
        const followUpPrompt = `Here are the contents of the files you requested:\n${extraFileContents}\nNow please provide your final answer to the original request.`;
        currentCustomPrompt = currentCustomPrompt ? `${currentCustomPrompt}\n\n${followUpPrompt}` : followUpPrompt;
        
        // Call the AI again with the updated prompt
        result = await aiCall(currentCustomPrompt);
    }
    
    return result;
}
