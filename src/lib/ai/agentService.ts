import { askGeminiCode } from '@/lib/dashboard/geminiCode';
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
    const trimmed = content.trim();
    try {
        return JSON.parse(trimmed);
    } catch (e) {
        const firstBrace = content.indexOf('{');
        const firstBracket = content.indexOf('[');
        const startIndex = (firstBrace !== -1 && firstBracket !== -1)
            ? Math.min(firstBrace, firstBracket)
            : (firstBrace !== -1 ? firstBrace : (firstBracket !== -1 ? firstBracket : -1));

        const lastBrace = content.lastIndexOf('}');
        const lastBracket = content.lastIndexOf(']');
        const endIndex = Math.max(lastBrace, lastBracket);

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const jsonString = content.substring(startIndex, endIndex + 1);
            try {
                return JSON.parse(jsonString);
            } catch (e2: any) {
                console.error("[AI Agent] Failed to parse extracted JSON content:", jsonString);
                throw new Error(`Failed to parse extracted JSON: ${e2.message}`);
            }
        }
        console.error("[AI Agent] No valid JSON structure found in content:", content);
        throw e;
    }
}

export async function askAgent(
    message: string,
    history: { role: 'user' | 'agent'; content: string }[],
    context: string,
    settings: AppSettings,
    resumeSessionId?: string
): Promise<AgentServiceResponse> {
    const systemInstruction = getAgentSystemInstruction(context, settings.language);
    const provider = settings.aiProvider;

    // For APIs that don't support native continuous sessions like the CLIs do,
    // we would format the history into the prompt.
    // However, for CLIs (Gemini/Claude Code), we just pass the resumeSessionId.
    let fullPrompt = message;
    
    // If not using a CLI provider or no session id, inject history
    if ((provider !== 'gemini-code' && provider !== 'claude-code') || !resumeSessionId) {
        if (history.length > 0) {
            const historyText = history.map(h => `${h.role === 'user' ? 'USER' : 'AGENT'}: ${h.content}`).join('\n\n');
            fullPrompt = `PREVIOUS CONVERSATION HISTORY:\n${historyText}\n\nCURRENT USER MESSAGE:\n${message}`;
        }
    }

    try {
        let result: any;
        let newSessionId = resumeSessionId;

        if (provider === 'gemini-code') {
            const response = await askGeminiCode(
                fullPrompt,
                settings.paths.automationRoot,
                systemInstruction,
                settings.geminiCodeApiKey,
                {
                    jsonSchema: AGENT_JSON_SCHEMA,
                    resumeSessionId
                }
            );
            
            if (typeof response !== 'string' && response.structured_output) {
                result = response.structured_output;
                newSessionId = response.session_id || resumeSessionId;
            } else {
                 result = typeof response === 'string' ? JSON.parse(response) : JSON.parse(response.result);
            }
        } 
        else if (provider === 'claude-code') {
            const response = await askClaudeCode(
                fullPrompt,
                settings.paths.automationRoot,
                systemInstruction,
                settings.claudeCodeToken,
                {
                    jsonSchema: AGENT_JSON_SCHEMA,
                    resumeSessionId,
                    allowedTools: ['Read', 'View', 'Edit', 'Glob', 'Grep', 'LS', 'Bash'] // Allow Claude to fully assist with reading, writing, and executing
                }
            );

            if (typeof response !== 'string' && response.structured_output) {
                result = response.structured_output;
                newSessionId = response.session_id || resumeSessionId;
            } else {
                 result = typeof response === 'string' ? JSON.parse(response) : JSON.parse(response.result);
            }
        }
        else if (provider === 'gemini') {
             const raw = await askGemini(fullPrompt, settings.geminiApiKey || '', settings.geminiModel, systemInstruction);
             result = safeParseJson(raw);
        }
        else if (provider === 'claude') {
             const raw = await askClaude(fullPrompt, settings.claudeApiKey || '', settings.claudeModel, systemInstruction);
             result = safeParseJson(raw);
        }
        else if (provider === 'openai') {
             const raw = await askOpenAI(fullPrompt, settings.openaiApiKey || '', settings.openaiModel, systemInstruction);
             result = safeParseJson(raw);
        }
        else {
            throw new Error(`Unsupported provider: ${provider}`);
        }

        return {
            response: result as AgentResponse,
            sessionId: newSessionId
        };
    } catch (error) {
        console.error("Agent Service Error:", error);
        throw error;
    }
}
