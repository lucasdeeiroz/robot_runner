import { useState, useRef, useEffect } from "react";
import { aiService } from "@/services/ai";
import { Send, Bot, User, Cpu } from "lucide-react";
import clsx from "clsx";

interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: Date;
}

import { useTranslation } from "react-i18next";

export function AIPage() {
    const { t } = useTranslation();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            text: t('ai_page.welcome'),
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: input,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        try {
            const responseText = await aiService.generateResponse(input);

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: responseText,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (err) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: t('ai_page.error'),
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="h-full flex flex-col h-[calc(100vh-2rem)]">
            {/* Header */}
            <div className="mb-4">
                <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                    <Cpu className="text-blue-500 dark:text-blue-400" /> {t('ai_page.title')}
                </h1>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">{t('ai_page.powered_by')}</p>
            </div>

            {/* Chat Area */}
            <div className="flex-1 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col shadow-sm dark:shadow-none">

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={clsx(
                                "flex gap-3 max-w-[80%]",
                                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                            )}
                        >
                            <div className={clsx(
                                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                msg.role === 'user' ? "bg-blue-600" : "bg-purple-100 dark:bg-purple-600"
                            )}>
                                {msg.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-purple-600 dark:text-white" />}
                            </div>

                            <div className={clsx(
                                "p-3 rounded-lg text-sm whitespace-pre-wrap",
                                msg.role === 'user' ? "bg-blue-600/20 text-gray-900 dark:text-blue-100" : "bg-zinc-100 dark:bg-zinc-800 text-gray-800 dark:text-zinc-100"
                            )}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex gap-3 mr-auto max-w-[80%]">
                            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-600 flex items-center justify-center shrink-0 animate-pulse">
                                <Bot size={16} className="text-purple-600 dark:text-white" />
                            </div>
                            <div className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-lg text-sm text-zinc-500 dark:text-zinc-400">
                                {t('ai_page.thinking')}
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-gray-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="flex gap-2">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={t('ai_page.placeholder')}
                            className="flex-1 bg-white dark:bg-black/40 border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2 text-gray-900 dark:text-zinc-200 focus:border-blue-500 outline-none"
                            disabled={loading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
