import { askGeminiCode } from '@/lib/dashboard/geminiCode';
import { askClaudeCode } from '@/lib/dashboard/claudeCode';
import { askGemini } from '@/lib/dashboard/gemini';
import { askClaude } from '@/lib/dashboard/claude';
import { getAgentSystemInstruction, AGENT_JSON_SCHEMA, AgentResponse } from './agentProtocol';
import { AppSettings } from '@/lib/settings';

export interface AgentServiceResponse {
    response: AgentResponse;
    sessionId?: string;
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
                    allowedTools: ['Read', 'View'] // Allow Claude to read the workspace
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
             result = JSON.parse(raw);
        }
        else if (provider === 'claude') {
             const raw = await askClaude(fullPrompt, settings.claudeApiKey || '', settings.claudeModel, systemInstruction);
             result = JSON.parse(raw);
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
