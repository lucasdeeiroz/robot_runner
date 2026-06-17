import { askAntigravityCli } from '@/lib/dashboard/antigravityCode';
import { askClaudeCode } from '@/lib/dashboard/claudeCode';
import { askGemini } from '@/lib/dashboard/gemini';
import { askClaude } from '@/lib/dashboard/claude';
import { askOpenAI } from '@/lib/dashboard/openai';
import { getAgentSystemInstruction, AGENT_JSON_SCHEMA, AgentResponse } from './agentProtocol';
import { AppSettings } from '@/lib/settings';

export interface AgentServiceResponse {
    response: AgentResponse;
    sessionId?: string;
}

/**
 * Safely parses JSON from a provider response string that may contain
 * markdown code fences or extra text before/after the JSON object.
 */
function safeParseJson<T>(content: string): T {
    if (!content || typeof content !== 'string') return content as any;
    const trimmed = content.trim();
    try {
        return JSON.parse(trimmed);
    } catch (e) {
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
            // ignore
        }
        console.error("[AI Agent] No valid JSON structure found in content:", content);
        throw e;
    }
}

async function getProjectAgentContext(automationRoot: string): Promise<string> {
    try {
        const { join } = await import('@tauri-apps/api/path');
        const { invoke } = await import('@tauri-apps/api/core');

        let indexContext = "AVAILABLE PROJECT FILES INDEX:\n";
        const agentsDir = await join(automationRoot, '.agents');

        const scanAndIndex = async (subDir: string, categoryName: string) => {
            try {
                const targetDir = await join(agentsDir, subDir);
                const entries = await invoke<any[]>('list_directory', { path: targetDir });
                for (const entry of entries) {
                    if (!entry.is_dir && entry.name && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
                        const relativePath = `.agents/${subDir}/${entry.name}`;
                        indexContext += `- [${categoryName}] ${entry.name} (Path: ${relativePath})\n`;
                    }
                }
            } catch (e) {
                // Ignore if directory doesn't exist
            }
        };

        await scanAndIndex('profiles', 'Profile');
        await scanAndIndex('rules', 'Rule');
        await scanAndIndex('workflows', 'Workflow');

        return indexContext;
    } catch (e) {
        console.error("Error reading project agent context:", e);
        return "";
    }
}

export async function askAgent(
    message: string,
    history: { role: 'user' | 'agent'; content: string }[],
    context: string,
    settings: AppSettings,
    resumeSessionId?: string,
    onProgress?: (event: { type: 'context_requested', file?: string }) => void
): Promise<AgentServiceResponse> {
    let projectSpecificContext = "";
    if (settings.paths?.automationRoot) {
        projectSpecificContext = await getProjectAgentContext(settings.paths.automationRoot);
    }
    
    const combinedContext = projectSpecificContext 
        ? `${context}\n\n${projectSpecificContext}` 
        : context;

    const systemInstruction = getAgentSystemInstruction(combinedContext, settings.language);
    const provider = settings.aiProvider;

    // For APIs that don't support native continuous sessions like the CLIs do,
    // we would format the history into the prompt.
    // However, for CLIs (Gemini/Claude Code), we just pass the resumeSessionId.
    let fullPrompt = message;
    
    // If not using a CLI provider or no session id, inject history
    if ((provider !== 'antigravity-cli' && provider !== 'claude-code') || !resumeSessionId) {
        if (history.length > 0) {
            const historyText = history.map(h => `${h.role === 'user' ? 'USER' : 'AGENT'}: ${h.content}`).join('\n\n');
            fullPrompt = `PREVIOUS CONVERSATION HISTORY:\n${historyText}\n\nCURRENT USER MESSAGE:\n${message}`;
        }
    }

    const invokeProvider = async (promptToUse: string, sessionIdToUse?: string): Promise<{ result: AgentResponse, newSessionId?: string }> => {
        let result: any;
        let newSessionId = sessionIdToUse;

        if (provider === 'antigravity-cli') {
            const response = await askAntigravityCli(
                promptToUse,
                settings.paths.automationRoot,
                systemInstruction,
                settings.antigravityApiKey,
                {
                    jsonSchema: AGENT_JSON_SCHEMA,
                    resumeSessionId: sessionIdToUse
                }
            );
            
            if (typeof response !== 'string' && response.structured_output) {
                result = response.structured_output;
                newSessionId = response.session_id || sessionIdToUse;
            } else {
                 const rawText = typeof response === 'string' ? response : response.result;
                 result = safeParseJson(rawText);
            }
        } 
        else if (provider === 'claude-code') {
            const response = await askClaudeCode(
                promptToUse,
                settings.paths.automationRoot,
                systemInstruction,
                settings.claudeCodeToken,
                {
                    jsonSchema: AGENT_JSON_SCHEMA,
                    resumeSessionId: sessionIdToUse,
                    allowedTools: ['Read', 'View', 'Edit', 'Glob', 'Grep', 'LS', 'Bash'] // Allow Claude to fully assist with reading, writing, and executing
                }
            );

            if (typeof response !== 'string' && response.structured_output) {
                result = response.structured_output;
                newSessionId = response.session_id || sessionIdToUse;
            } else {
                 const rawText = typeof response === 'string' ? response : response.result;
                 result = safeParseJson(rawText);
            }
        }
        else if (provider === 'gemini') {
             const raw = await askGemini(promptToUse, settings.geminiApiKey || '', settings.geminiModel, systemInstruction);
             result = safeParseJson(raw);
        }
        else if (provider === 'claude') {
             const raw = await askClaude(promptToUse, settings.claudeApiKey || '', settings.claudeModel, systemInstruction);
             result = safeParseJson(raw);
        }
        else if (provider === 'openai') {
             const raw = await askOpenAI(promptToUse, settings.openaiApiKey || '', settings.openaiModel, systemInstruction);
             result = safeParseJson(raw);
        }
        else {
            throw new Error(`Unsupported provider: ${provider}`);
        }
        
        return { result: result as AgentResponse, newSessionId };
    };

    try {
        let { result, newSessionId } = await invokeProvider(fullPrompt, resumeSessionId);

        // RAG loop implementation for API providers
        if (result.needs_context_files && Array.isArray(result.needs_context_files) && result.needs_context_files.length > 0) {
            if (onProgress) {
                onProgress({ type: 'context_requested', file: result.needs_context_files.join(', ') });
            }

            const { join } = await import('@tauri-apps/api/path');
            const { invoke } = await import('@tauri-apps/api/core');
            let extraFileContents = "";

            for (const path of result.needs_context_files) {
                try {
                    const fullPath = await join(settings.paths.automationRoot || '', path);
                    const content = await invoke<string>('fs_read_text_file', { path: fullPath });
                    extraFileContents += `\n--- CONTENT OF ${path} ---\n${content}\n`;
                } catch (e) {
                    extraFileContents += `\n--- CONTENT OF ${path} ---\n(File could not be read: ${e})\n`;
                }
            }

            const followUpPrompt = `Here are the contents of the files you requested:\n${extraFileContents}\nNow please provide your final answer to the user's original request.`;
            
            if (provider !== 'antigravity-cli' && provider !== 'claude-code') {
                // Manually append the previous interaction to the prompt
                fullPrompt += `\n\nAGENT: ${JSON.stringify(result)}\n\nUSER (SYSTEM): ${followUpPrompt}`;
            } else {
                fullPrompt = followUpPrompt;
                resumeSessionId = newSessionId; 
            }

            // Re-invoke with the added context
            const secondCall = await invokeProvider(fullPrompt, resumeSessionId);
            result = secondCall.result;
            newSessionId = secondCall.newSessionId;
        }

        return {
            response: result,
            sessionId: newSessionId
        };
    } catch (error) {
        console.error("Agent Service Error:", error);
        throw error;
    }
}
