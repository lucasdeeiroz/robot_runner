import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sparkles, Send, Loader2, Bot, Play, AlertTriangle } from 'lucide-react';
import { useSettings } from "@/lib/settings";
import { askAgent } from '@/lib/ai/agentService';
import { AgentAction } from '@/lib/ai/agentProtocol';
import ReactMarkdown from 'react-markdown';
import { feedback } from '@/lib/feedback';

interface AiAgentPanelProps {
    onNavigate: (page: string) => void;
}

interface Message {
    id: string;
    role: 'user' | 'agent';
    content: string;
    actions?: AgentAction[];
}

export function AiAgentPanel({ onNavigate }: AiAgentPanelProps) {
    const { t } = useTranslation();
    const { updateSetting, settings } = useSettings();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const endOfMessagesRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleClose = () => {
        updateSetting('aiChatEnabled', false);
    };

    const buildContext = () => {
        // Here we build the context based on current app state.
        // For now, it's basic, but can be expanded.
        return `
- App Version: 2.2.56
- Active Workspace: ${settings.paths.automationRoot}
- Settings: ${JSON.stringify(settings)}
        `;
    };

    const handleSend = async (overrideInput?: string) => {
        const textToSend = overrideInput || input;
        if (!textToSend.trim()) return;

        setInput('');
        setIsLoading(true);

        const newUserMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: textToSend
        };

        setMessages(prev => [...prev, newUserMessage]);

        try {
            const context = buildContext();

            // Format history for the service
            const historyForService = messages.map(m => ({
                role: m.role,
                content: m.content
            }));

            const response = await askAgent(
                textToSend,
                historyForService,
                context,
                settings,
                settings.aiSessionId
            );

            if (response.sessionId && response.sessionId !== settings.aiSessionId) {
                updateSetting('aiSessionId', response.sessionId);
            }

            const agentMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'agent',
                content: response.response.reply,
                actions: response.response.actions
            };

            setMessages(prev => [...prev, agentMsg]);

        } catch (error: any) {
            console.error("AI Agent Error:", error);
            feedback.toast.error(t('ai_agent.error', 'Error communicating with AI: ') + error.message);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'agent',
                content: `**Error:** Failed to reach AI Provider. \n\n\`${error.message}\``
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecuteAction = (action: AgentAction) => {
        feedback.toast.info(t('ai_agent.executing_action', 'Executing Action: {{type}}', { type: action.type }));

        switch (action.type) {
            case 'navigate':
                if (action.target) {
                    onNavigate(action.target);
                    updateSetting('aiChatEnabled', false); // Optional: close panel on navigate
                }
                break;
            case 'change_setting':
                if (action.setting_key && action.setting_value !== undefined) {
                    updateSetting(action.setting_key as any, action.setting_value);
                    feedback.toast.success(t('ai_agent.settings_updated', 'Updated {{key}}', { key: action.setting_key }));
                }
                break;
            // Other actions (run_test, etc) will need IPC bindings or store actions
            default:
                feedback.toast.error(t('ai_agent.action_unwired', 'Action {{type}} is not yet fully wired to the backend.', { type: action.type }));
        }
    };

    return (
        <div className="w-96 h-full border-r border-outline-variant/30 flex flex-col bg-surface select-text overflow-hidden relative group shadow-2xl">
            {/* Background Decorative Element */}
            <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="p-4 h-16 flex items-center justify-between border-b border-outline-variant/20 relative z-10 shrink-0 bg-surface/80 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <Sparkles className="text-primary animate-pulse" size={18} />
                    <span className="font-bold text-on-surface tracking-tight">
                        {t('ai_agent.title', 'AI Agent')}
                    </span>
                    {settings.aiSessionId && (
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t('ai_agent.session_active', 'Session Active')}</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            setMessages([]);
                            updateSetting('aiSessionId', undefined);
                            feedback.toast.success(t('ai_agent.session_cleared', 'Session cleared'));
                        }}
                        className="text-xs text-on-surface-variant hover:text-error transition-colors"
                    >
                        {t('ai_agent.clear_session', 'Clear')}
                    </button>
                    <button
                        onClick={handleClose}
                        className="p-1.5 rounded-lg bg-surface-variant/20 hover:bg-error/20 text-on-surface-variant hover:text-error transition-all"
                        title={t('common.close', 'Close')}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4 relative z-10">
                {messages.length === 0 ? (
                    <div className="text-center mt-10 h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20 shadow-lg shadow-primary/5">
                            <Bot size={32} className="text-primary opacity-80" />
                        </div>
                        <h3 className="text-lg font-bold text-on-surface mb-2">{t('ai_agent.welcome_title', 'Robot Runner Agent')}</h3>
                        <p className="text-sm text-on-surface-variant max-w-[250px] mx-auto mb-6">
                            {t('ai_agent.welcome_desc', 'Hello! I can help you analyze logs, run tests, or navigate the application.')}
                        </p>
                        <div className="flex flex-col gap-2 w-full max-w-[280px]">
                            <button onClick={() => handleSend(t('ai_agent.suggested_prompts.settings', '"Go to settings"'))} className="text-xs text-left p-2 rounded-lg bg-surface-variant/30 hover:bg-primary/10 text-on-surface-variant transition-colors border border-outline-variant/30">
                                {t('ai_agent.suggested_prompts.settings', '"Go to settings"')}
                            </button>
                            <button onClick={() => handleSend(t('ai_agent.suggested_prompts.color', '"Change my primary color to green"'))} className="text-xs text-left p-2 rounded-lg bg-surface-variant/30 hover:bg-primary/10 text-on-surface-variant transition-colors border border-outline-variant/30">
                                {t('ai_agent.suggested_prompts.color', '"Change my primary color to green"')}
                            </button>
                            <button onClick={() => handleSend(t('ai_agent.suggested_prompts.help', '"What can you do?"'))} className="text-xs text-left p-2 rounded-lg bg-surface-variant/30 hover:bg-primary/10 text-on-surface-variant transition-colors border border-outline-variant/30">
                                {t('ai_agent.suggested_prompts.help', '"What can you do?"')}
                            </button>
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-end gap-2 max-w-[90%]">
                                {msg.role === 'agent' && (
                                    <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mb-1">
                                        <Bot size={14} className="text-primary" />
                                    </div>
                                )}
                                <div className={`p-3 rounded-2xl text-sm ${msg.role === 'user'
                                        ? 'bg-primary text-on-primary rounded-br-sm shadow-md shadow-primary/20'
                                        : 'bg-surface-variant/40 text-on-surface rounded-bl-sm border border-outline-variant/30'
                                    }`}>
                                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-snug prose-pre:bg-surface-variant/50 prose-pre:p-2 prose-pre:rounded-lg">
                                        <ReactMarkdown>
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>

                            {/* Render Action Cards */}
                            {msg.actions && msg.actions.length > 0 && (
                                <div className="mt-2 ml-8 flex flex-col gap-2 w-full max-w-[85%]">
                                    {msg.actions.map((action, idx) => (
                                        <div key={idx} className="bg-surface-variant/20 border border-primary/30 rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                                            <div className="flex items-center gap-2 text-primary">
                                                <AlertTriangle size={14} />
                                                <span className="text-xs font-bold uppercase tracking-wider">{t('ai_agent.action_proposed', 'Action Proposed')}</span>
                                            </div>
                                            <p className="text-sm text-on-surface">{action.description}</p>
                                            <button
                                                onClick={() => handleExecuteAction(action)}
                                                className="mt-1 flex items-center justify-center gap-2 w-full py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary rounded-lg transition-colors text-xs font-bold"
                                            >
                                                <Play size={12} fill="currentColor" />
                                                {t('ai_agent.confirm_execute', 'Confirm & Execute')}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}

                {isLoading && (
                    <div className="flex items-center gap-2 text-on-surface-variant/60 text-sm italic ml-8">
                        <Loader2 size={14} className="animate-spin" />
                        {t('ai_agent.thinking', 'Thinking...')}
                    </div>
                )}
                <div ref={endOfMessagesRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-outline-variant/20 bg-surface/80 backdrop-blur-md shrink-0 relative z-10">
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={t('ai_agent.placeholder', 'Ask me anything...')}
                        className="w-full bg-surface-variant/30 text-on-surface rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none custom-scrollbar border border-outline-variant/30"
                        rows={3}
                        disabled={isLoading}
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 bottom-2 p-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20"
                    >
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
