import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sparkles, Send, Loader2, Bot, Play, AlertTriangle, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useSettings } from "@/lib/settings";
import { logEvent } from '@/lib/analytics';
import { askAgent } from '@/lib/ai/agentService';
import { AgentAction } from '@/lib/ai/agentProtocol';
import ReactMarkdown from 'react-markdown';
import { feedback } from '@/lib/feedback';
import { invoke } from '@tauri-apps/api/core';
import { listScreenMaps } from '@/lib/dashboard/mapperPersistence';
import { useDevices } from '@/lib/deviceStore';
import { useFileSave } from '@/hooks/useFileSave';
import { useSelection } from '@/lib/selectionStore';
import { useTestSessions } from '@/lib/testSessionStore';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import packageJson from '../../../package.json';
import { Button } from "@/components/atoms/Button";
import { Modal } from "@/components/organisms/Modal";
import clsx from "clsx";

interface AiAgentPanelProps {
    onNavigate: (page: string) => void;
}

export interface Message {
    id: string;
    role: 'user' | 'agent';
    content: string;
    actions?: AgentAction[];
    suggestedPrompts?: string[];
}

const stripMarkdown = (text: string): string => {
    if (!text) return '';
    return text
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        // Remove inline code
        .replace(/`([^`]+)`/g, '$1')
        // Remove images
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        // Remove links (keep text)
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        // Remove bold/italic (double/single asterisk)
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        // Remove bold/italic (double/single underscore)
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove headers (# Header)
        .replace(/^#{1,6}\s+/gm, '')
        // Remove blockquotes (> quote)
        .replace(/^\s*>\s+/gm, '')
        // Remove list item bullets (- or * or +)
        .replace(/^\s*[-*+]\s+/gm, '')
        // Remove ordered list numbers (1. or 2.)
        .replace(/^\s*\d+\.\s+/gm, '')
        // Trim extra whitespaces
        .trim();
};

export function AiAgentPanel({ onNavigate }: AiAgentPanelProps) {
    const { t } = useTranslation();
    const { settings, updateSetting, activeProfileId } = useSettings();
    const { devices, selectedDevices, setSelectedDevices } = useDevices();
    const { clearSelection, addItem } = useSelection();
    const { addToolboxSession, setActiveSessionId } = useTestSessions();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            const stored = localStorage.getItem('robot_runner_ai_chat_messages');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error("Failed to parse stored chat messages:", e);
            return [];
        }
    });

    const [sentViaVoice, setSentViaVoice] = useState(false);
    const [currentlySpeakingMsgId, setCurrentlySpeakingMsgId] = useState<string | null>(null);

    const { speak, stop: stopSpeaking } = useTextToSpeech({
        lang: settings.language === 'pt_BR' ? 'pt-BR' : (settings.language === 'es_ES' ? 'es-ES' : 'en-US'),
        onEnd: () => setCurrentlySpeakingMsgId(null),
        onError: () => setCurrentlySpeakingMsgId(null)
    });

    const { isListening, startListening, stopListening } = useSpeechToText({
        lang: settings.language === 'pt_BR' ? 'pt-BR' : (settings.language === 'es_ES' ? 'es-ES' : 'en-US'),
        onResult: (text) => {
            if (text.trim()) {
                setInput(text);
                setSentViaVoice(true);
                handleSend(text);
            }
        },
        onError: (err) => {
            if (err === 'no-speech' || err === 'aborted') {
                return;
            }
            feedback.toast.error('ai_agent.mic_permission_error');
        }
    });

    useEffect(() => {
        if (messages.length > 0 && sentViaVoice) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === 'agent') {
                speak(stripMarkdown(lastMsg.content));
                setCurrentlySpeakingMsgId(lastMsg.id);
                setSentViaVoice(false);
            }
        }
    }, [messages, sentViaVoice, speak]);

    const [pendingFileAction, setPendingFileAction] = useState<AgentAction | null>(null);
    const [originalContent, setOriginalContent] = useState<string | null>(null);
    const endOfMessagesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        localStorage.setItem('robot_runner_ai_chat_messages', JSON.stringify(messages));
    }, [messages]);

    // Allowlist of top-level AppSettings keys the AI agent is permitted to change.
    // Excludes sensitive keys (API keys, tokens), complex objects (paths, tools),
    // and keys that could break the app state (aiChatEnabled, aiSessionId).
    const ALLOWED_AGENT_SETTING_KEYS = new Set<string>([
        'theme',
        'language',
        'primaryColor',
        'recycleDeviceViews',
        'allowActionsDuringTest',
        'saveLogs',
        'usageMode',
        'automationFramework',
        'presentationEnabled',
        'zoomFactor',
        'maxExplorationSteps',
    ]);

    const screenshotSaver = useFileSave({
        fileType: 'Image',
        extensions: ['png'],
        defaultNamePrefix: 'screenshot',
        settingPathKey: 'screenshots'
    });

    const activeDeviceUdid = selectedDevices[0] || (devices.length > 0 ? devices[0].udid : null);

    // Scroll to bottom when messages change
    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleClose = () => {
        updateSetting('aiChatEnabled', false);
    };

    const buildSafeSettingsContext = () => {
        return {
            aiChatEnabled: settings.aiChatEnabled,
            activeWorkspace: settings.paths?.automationRoot || null,
            hasScreenshotsPath: Boolean(settings.paths?.screenshots),
            deviceCounts: {
                total: devices.length,
                selected: selectedDevices.length
            }
        };
    };

    const buildContext = async () => {
        const safeSettingsContext = buildSafeSettingsContext();
        
        let mappingsContext = '';
        try {
            const maps = await listScreenMaps(activeProfileId, settings.paths?.mappings);
            if (maps && maps.length > 0) {
                mappingsContext = `\n- Mappings (${maps.length} screens):\n${JSON.stringify(maps.map(m => ({ id: m.id, name: m.name, elements: m.elements.map(e => ({ name: e.name, type: e.type, short_id: e.shortId })) })), null, 2)}`;
            }
        } catch (e) {
            console.warn("Could not load mappings for AI context", e);
        }

        let resourcesContext = '';
        try {
            if (settings.paths?.resources) {
                const resourcesDirFiles = await invoke<any[]>('list_directory_recursive', { path: settings.paths.resources });
                const resourceFiles = resourcesDirFiles.filter(f => !f.is_dir && (f.name.endsWith('.resource') || f.name.endsWith('.robot')));
                
                if (resourceFiles.length > 0) {
                    resourcesContext = `\n- Resource Files:\n`;
                    let resourceFilesRead = 0;
                    for (const rf of resourceFiles) {
                        if (resourceFilesRead < 3) {
                            try {
                                const content = await invoke<string>('fs_read_text_file', { path: rf.path });
                                const truncated = content.length > 2500 ? content.substring(0, 2500) + '\n...[TRUNCATED]' : content;
                                resourcesContext += `\n--- ${rf.name} ---\n${truncated}\n`;
                                resourceFilesRead++;
                            } catch (e) {
                                resourcesContext += `\n--- ${rf.name} --- (Failed to read)\n`;
                            }
                        } else {
                            resourcesContext += `\n--- ${rf.name} --- (Content hidden to save tokens)\n`;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Could not load resources for AI context", e);
        }

        let testsDir = '';
        try {
            if (settings.paths?.tests) {
                const testsDirFiles = await invoke<any[]>('list_directory_recursive', { path: settings.paths.tests });
                const testFiles = testsDirFiles.filter(f => !f.is_dir && (f.name.endsWith('.robot') || f.name.endsWith('.txt')));
                if (testFiles.length > 0) {
                    testsDir = `\n- Test Files:\n`;
                    let testFilesRead = 0;
                    for (const tf of testFiles) {
                        if (testFilesRead < 3) {
                            try {
                                const content = await invoke<string>('fs_read_text_file', { path: tf.path });
                                const truncated = content.length > 2500 ? content.substring(0, 2500) + '\n...[TRUNCATED]' : content;
                                testsDir += `\n--- ${tf.name} ---\n${truncated}\n`;
                                testFilesRead++;
                            } catch (e) {
                                testsDir += `\n--- ${tf.name} --- (Failed to read)\n`;
                            }
                        } else {
                            testsDir += `\n--- ${tf.name} --- (Content hidden to save tokens)\n`;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Could not load tests directory for AI context", e);
        }

        return `
- App Version: ${packageJson.version}
- Active Workspace: ${settings.paths?.automationRoot || 'None'}
- Active Device: ${activeDeviceUdid || 'None'}
- Settings Summary: ${JSON.stringify(safeSettingsContext)}${mappingsContext}${resourcesContext}${testsDir}
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
            const context = await buildContext();

            // Format history for the service, optimizing tokens by sending only the last 15 messages
            const historyForService = messages.slice(-15).map(m => ({
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

            logEvent('ai_interaction', {
                query_length: textToSend.length,
                has_actions: Boolean(response.response.actions && response.response.actions.length > 0),
                action_count: response.response.actions?.length || 0
            });

            const agentMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'agent',
                content: response.response.reply ? response.response.reply.replace(/\\n/g, '\n') : '',
                actions: response.response.actions,
                suggestedPrompts: response.response.suggested_prompts
            };

            setMessages(prev => [...prev, agentMsg]);

        } catch (error: any) {
            console.error("AI Agent Error:", error);
            const errMsg = typeof error === 'string' ? error : (error?.message || String(error));
            logEvent('ai_interaction_error', { error_message: errMsg });
            feedback.toast.raw.error(t('ai_agent.error', { error: errMsg }));
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'agent',
                content: `**Error:** Failed to reach AI Provider. \n\n\`${errMsg}\``
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const handleAiAgentPrompt = (e: CustomEvent) => {
            const { prompt } = e.detail;
            if (prompt && !isLoading) {
                handleSend(prompt);
            }
        };

        window.addEventListener('ai_agent_prompt', handleAiAgentPrompt as EventListener);
        return () => window.removeEventListener('ai_agent_prompt', handleAiAgentPrompt as EventListener);
    }, [isLoading, input, messages, settings]);

    const handleExecuteAction = async (action: AgentAction) => {
        if (action.type !== 'run_test' && action.type !== 'capture_logcat') {
            feedback.toast.info('ai_agent.executing_action', { type: action.type });
        }

        switch (action.type) {
            case 'navigate':
                if (action.target) {
                    const targetLower = action.target.toLowerCase();
                    if (targetLower === 'inspector' || targetLower === 'run/inspector' || targetLower === 'scaneye' || targetLower === 'inspetor' || targetLower === 'inspect') {
                        onNavigate('run');
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('ai_navigate_run_subtab', { detail: 'inspector' }));
                        }, 100);
                    } else if (targetLower === 'connect' || targetLower === 'run/connect' || targetLower === 'wifi' || targetLower === 'conectar' || targetLower === 'conexão') {
                        onNavigate('run');
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('ai_navigate_run_subtab', { detail: 'connect' }));
                        }, 100);
                    } else if (targetLower === 'launcher' || targetLower === 'run/launcher' || targetLower === 'tests_sub_tab' || targetLower === 'run' || targetLower === 'run_tests' || targetLower === 'executar testes' || targetLower === 'rodar testes') {
                        onNavigate('run');
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('ai_navigate_run_subtab', { detail: 'tests' }));
                        }, 100);
                    } else if (targetLower === 'history' || targetLower === 'tests/history' || targetLower === 'histórico') {
                        onNavigate('tests');
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('ai_navigate_tests_subtab', { detail: 'history' }));
                        }, 100);
                    } else if (targetLower === 'scenarios' || targetLower === 'dashboard/scenarios' || targetLower === 'generator' || targetLower === 'ai_generator' || targetLower === 'gerador') {
                        onNavigate('dashboard');
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('ai_navigate_dashboard_subtab', { detail: 'scenarios' }));
                        }, 100);
                    } else if (targetLower === 'images' || targetLower === 'dashboard/images' || targetLower === 'editor' || targetLower === 'image_editor' || targetLower === 'editor de imagem' || targetLower === 'editor de imagens') {
                        onNavigate('dashboard');
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('ai_navigate_dashboard_subtab', { detail: 'images' }));
                        }, 100);
                    } else if (targetLower === 'dashboard_history' || targetLower === 'dashboard/history' || targetLower === 'history_panel') {
                        onNavigate('dashboard');
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('ai_navigate_dashboard_subtab', { detail: 'history' }));
                        }, 100);
                    } else if (targetLower === 'mapper' || targetLower === 'dashboard/mapper' || targetLower === 'mapeador' || targetLower === 'mapper_sub_tab' || targetLower === 'map') {
                        onNavigate('dashboard');
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('ai_navigate_dashboard_subtab', { detail: 'mapper' }));
                        }, 100);
                    } else if (targetLower === 'settings' || targetLower === 'configurações') {
                        onNavigate('settings');
                    } else if (targetLower === 'about' || targetLower === 'sobre') {
                        onNavigate('about');
                    } else {
                        onNavigate(action.target);
                    }
                }
                break;
            case 'change_setting':
                if (action.setting_key && action.setting_value !== undefined) {
                    if (!ALLOWED_AGENT_SETTING_KEYS.has(action.setting_key)) {
                        feedback.toast.raw.error(t('ai_agent.action_unwired', { type: `change_setting(${action.setting_key})` }));
                        break;
                    }
                    updateSetting(action.setting_key as any, action.setting_value);
                    feedback.toast.success('ai_agent.settings_updated', { key: action.setting_key });
                }
                break;
            case 'execute_adb':
                if (!activeDeviceUdid) {
                    feedback.toast.error('ai_agent.no_active_device');
                    return;
                }
                if (action.command) {
                    try {
                        let cleanCommand = action.command.trim();
                        if (cleanCommand.toLowerCase().startsWith('adb ')) {
                            cleanCommand = cleanCommand.substring(4).trim();
                        }
                        const args = cleanCommand.split(' ').filter(Boolean);
                        const result = await invoke<string>('run_adb_command', { device: activeDeviceUdid, args });

                        setMessages(prev => [...prev, {
                            id: Date.now().toString(),
                            role: 'agent',
                            content: `**ADB Output:**\n\`\`\`\n${result || 'Success'}\n\`\`\``
                        }]);
                    } catch (e) {
                        feedback.toast.raw.error(`ADB Error: ${e}`);
                    }
                }
                break;
            case 'take_screenshot':
                if (!activeDeviceUdid) {
                    feedback.toast.error('ai_agent.no_active_device');
                    return;
                }
                try {
                    await screenshotSaver.saveFile(async (path) => {
                        await invoke('save_screenshot', { device: activeDeviceUdid, path });
                    }, 'feedback.screenshot_saved');
                } catch (e) {
                    console.error("Screenshot failed:", e);
                }
                break;
            case 'capture_logcat':
                onNavigate('tests');
                feedback.toast.info('ai_agent.redirect_to_tests', { type: action.type });
                break;
            case 'run_test':
                const targetPath = action.path || action.target;
                if (targetPath) {
                    const automationRoot = typeof settings.paths.automationRoot === 'string'
                        ? settings.paths.automationRoot.trim()
                        : '';

                    if (!automationRoot) {
                        feedback.toast.error('ai_agent.invalid_automation_root');
                        return;
                    }

                    let resolvedPath = targetPath;
                    try {
                        const resolved = await invoke<string | null>('resolve_test_path', {
                            root: automationRoot,
                            name: targetPath
                        });
                        if (resolved) {
                            resolvedPath = resolved;
                        }
                    } catch (e) {
                        console.error("AI_AGENT: Failed to resolve test path recursively:", e);
                    }

                    const isDir = !resolvedPath.includes('.');
                    clearSelection();
                    addItem({
                        path: resolvedPath,
                        name: resolvedPath.split(/[\\/]/).pop() || resolvedPath,
                        type: isDir ? 'folder' : ((resolvedPath.endsWith('.args') || resolvedPath.endsWith('.txt')) ? 'args' : 'file')
                    });
                }

                if (action.device) {
                    const matchedDevice = devices.find(d => d.udid === action.device || d.model.toLowerCase().includes(action.device!.toLowerCase()));
                    if (matchedDevice) {
                        setSelectedDevices([matchedDevice.udid]);
                    }
                }

                onNavigate('run');

                console.log("AI_AGENT: Navigating to run and scheduling ai_run_test event...", targetPath);
                setTimeout(() => {
                    console.log("AI_AGENT: Dispatching ai_run_test event NOW");
                    window.dispatchEvent(new CustomEvent('ai_run_test'));
                }, 500);
                break;
            case 'open_toolbox':
                let targetDevice = devices[0];
                if (action.device) {
                    const matched = devices.find(d => d.udid === action.device || d.model.toLowerCase().includes(action.device!.toLowerCase()));
                    if (matched) targetDevice = matched;
                } else if (activeDeviceUdid) {
                    const matched = devices.find(d => d.udid === activeDeviceUdid);
                    if (matched) targetDevice = matched;
                }

                if (!targetDevice) {
                    feedback.toast.error('ai_agent.no_active_device');
                    return;
                }

                addToolboxSession(
                    targetDevice.udid,
                    targetDevice.model,
                    targetDevice.model,
                    targetDevice.android_version || undefined
                );
                setActiveSessionId(targetDevice.udid);
                onNavigate('tests');
                break;
            case 'open_inspector':
                let inspectorDevice = devices[0];
                if (action.device) {
                    const matched = devices.find(d => d.udid === action.device || d.model.toLowerCase().includes(action.device!.toLowerCase()));
                    if (matched) inspectorDevice = matched;
                } else if (activeDeviceUdid) {
                    const matched = devices.find(d => d.udid === activeDeviceUdid);
                    if (matched) inspectorDevice = matched;
                }

                if (!inspectorDevice) {
                    feedback.toast.error('ai_agent.no_active_device');
                    return;
                }

                setSelectedDevices([inspectorDevice.udid]);
                onNavigate('run');
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('ai_navigate_run_subtab', { detail: 'inspector' }));
                }, 100);
                break;
            case 'open_scrcpy':
                let scrcpyDevice = devices[0];
                if (action.device) {
                    const matched = devices.find(d => d.udid === action.device || d.model.toLowerCase().includes(action.device!.toLowerCase()));
                    if (matched) scrcpyDevice = matched;
                } else if (activeDeviceUdid) {
                    const matched = devices.find(d => d.udid === activeDeviceUdid);
                    if (matched) scrcpyDevice = matched;
                }

                if (!scrcpyDevice) {
                    feedback.toast.error('ai_agent.no_active_device');
                    return;
                }

                try {
                    await invoke('open_scrcpy', {
                        device: scrcpyDevice.udid,
                        args: settings.tools?.scrcpyArgs || null
                    });
                    feedback.toast.success('feedback.mirror_launched');
                } catch (e) {
                    feedback.toast.error('toolbox.scrcpy.open_error');
                }
                break;
            case 'create_file':
                setOriginalContent(null);
                setPendingFileAction(action);
                break;
            case 'modify_file':
            case 'delete_file':
                if (action.path) {
                    const automationRoot = typeof settings.paths.automationRoot === 'string' ? settings.paths.automationRoot.trim() : '';
                    if (!automationRoot) {
                        feedback.toast.error('ai_agent.invalid_automation_root');
                        break;
                    }
                    const fullPath = `${automationRoot}/${action.path}`;
                    try {
                        const content = await invoke<string>('fs_read_text_file', { path: fullPath });
                        setOriginalContent(content);
                    } catch (e) {
                        setOriginalContent(`// ${t('ai_agent.file_action_failed')}${e}`);
                    }
                    setPendingFileAction(action);
                } else {
                    feedback.toast.error(`${t('ai_agent.file_path_missing')} ${action.type}`);
                }
                break;
            default:
                feedback.toast.error('ai_agent.action_unwired', { type: action.type });
        }
    };

    const confirmFileAction = async () => {
        if (!pendingFileAction || !pendingFileAction.path) {
            setPendingFileAction(null);
            return;
        }
        
        const automationRoot = typeof settings.paths.automationRoot === 'string' ? settings.paths.automationRoot.trim() : '';
        if (!automationRoot) {
            feedback.toast.error('ai_agent.invalid_automation_root');
            setPendingFileAction(null);
            return;
        }

        const fullPath = `${automationRoot}/${pendingFileAction.path}`;

        try {
            if (pendingFileAction.type === 'delete_file') {
                await invoke('fs_remove_file', { path: fullPath });
                feedback.toast.success(t('ai_agent.file_deleted'));
            } else {
                await invoke('fs_write_text_file', { path: fullPath, content: pendingFileAction.content || '' });
                feedback.toast.success(pendingFileAction.type === 'create_file' ? t('ai_agent.file_created') : t('ai_agent.file_modified'));
            }
        } catch (e: any) {
            feedback.toast.error(`${t('ai_agent.file_action_failed')}${String(e)}`);
        } finally {
            setPendingFileAction(null);
            setOriginalContent(null);
        }
    };

    return (
        <div className="w-96 h-full border-r border-outline-variant/30 flex flex-col bg-surface select-text overflow-hidden relative group shadow-2xl">
            {/* Background Decorative Element */}
            <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="p-4 pt-8 h-auto flex items-center justify-between border-b border-outline-variant/20 relative z-10 shrink-0 bg-surface/80 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <Sparkles className="text-primary animate-pulse" size={18} />
                    <span className="font-bold text-on-surface tracking-tight flex items-center gap-1 rai-hover-trigger cursor-default select-none">
                        <span>Ask </span>
                        <span className="rai-container">
                            <span className="rai-letter-r">
                                R
                                <span className="rai-letter-r-ghost text-primary/70">R</span>
                            </span>
                            <span>AI</span>
                        </span>
                    </span>
                    {settings.aiSessionId && (
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t('ai_agent.session_active', 'Session Active')}</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost" size="sm"
                        onClick={() => {
                            stopSpeaking();
                            setMessages([]);
                            localStorage.removeItem('robot_runner_ai_chat_messages');
                            updateSetting('aiSessionId', undefined);
                            feedback.toast.success('ai_agent.session_cleared');
                        }}
                        className="text-xs text-on-surface hover:text-error h-8"
                    >
                        {t('ai_agent.clear_session', 'Clear')}
                    </Button>
                    <Button
                        onClick={handleClose}
                        className="p-1.5 rounded-lg bg-surface-variant/20 hover:bg-error/20 text-on-surface-variant hover:text-error transition-all"
                        data-tooltip={t('common.close', 'Close')}
                        data-position="left"
                    >
                        <X size={18} />
                    </Button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4 relative z-10">
                {messages.length === 0 ? (
                    <div className="text-center mt-10 h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20 shadow-lg shadow-primary/5">
                            <Bot size={32} className="text-primary opacity-80" />
                        </div>
                        <h3 className="text-lg font-bold text-on-surface mb-2">Robot Runner AI</h3>
                        <p className="text-sm text-on-surface-variant max-w-[250px] mx-auto mb-6">
                            {t('ai_agent.welcome_desc')}
                        </p>
                        <div className="flex flex-col gap-2 w-full max-w-[280px]">
                            <Button onClick={() => handleSend(t('ai_agent.suggested_prompts.settings'))} className="text-xs text-left p-2 rounded-lg bg-surface-variant/30 hover:bg-primary/10 text-on-surface-variant transition-colors border border-outline-variant/30">
                                {t('ai_agent.suggested_prompts.settings')}
                            </Button>
                            <Button onClick={() => handleSend(t('ai_agent.suggested_prompts.color'))} className="text-xs text-left p-2 rounded-lg bg-surface-variant/30 hover:bg-primary/10 text-on-surface-variant transition-colors border border-outline-variant/30">
                                {t('ai_agent.suggested_prompts.color')}
                            </Button>
                            <Button onClick={() => handleSend(t('ai_agent.suggested_prompts.help'))} className="text-xs text-left p-2 rounded-lg bg-surface-variant/30 hover:bg-primary/10 text-on-surface-variant transition-colors border border-outline-variant/30">
                                {t('ai_agent.suggested_prompts.help')}
                            </Button>
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

                            {msg.role === 'agent' && (
                                <div className="flex items-center gap-2 ml-8 mt-1">
                                    <Button
                                        variant="ghost" size="icon"
                                        onClick={() => {
                                            if (currentlySpeakingMsgId === msg.id) {
                                                stopSpeaking();
                                                setCurrentlySpeakingMsgId(null);
                                            } else {
                                                speak(stripMarkdown(msg.content));
                                                setCurrentlySpeakingMsgId(msg.id);
                                            }
                                        }}
                                        data-tooltip={currentlySpeakingMsgId === msg.id ? t('ai_agent.stop_speak_title') : t('ai_agent.speak_title')}
                                        data-position="right"
                                        className={clsx("w-6 h-6 rounded-full hover:bg-primary/10", currentlySpeakingMsgId === msg.id ? 'text-primary animate-pulse' : 'text-on-surface-variant/60 hover:text-primary')}
                                    >
                                        {currentlySpeakingMsgId === msg.id ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                    </Button>
                                </div>
                            )}

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
                                            <Button
                                                onClick={() => handleExecuteAction(action)}
                                                className="mt-1 flex items-center justify-center gap-2 w-full py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary rounded-lg transition-colors text-xs font-bold"
                                            >
                                                <Play size={12} fill="currentColor" />
                                                {t('ai_agent.confirm_execute')}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Render Suggested Prompts */}
                            {msg.suggestedPrompts && msg.suggestedPrompts.length > 0 && (
                                <div className="mt-2 ml-8 flex flex-wrap gap-2 w-full max-w-[85%]">
                                    {msg.suggestedPrompts.map((prompt, idx) => (
                                        <Button
                                            key={idx}
                                            onClick={() => handleSend(prompt)}
                                            className="text-xs px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-on-primary transition-all font-semibold border border-primary/20 shadow-sm"
                                        >
                                            {prompt}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}

                {isLoading && (
                    <div className="flex items-center gap-2 text-on-surface-variant/60 text-sm italic ml-8">
                        <Loader2 size={14} className="animate-spin" />
                        {t('ai_agent.thinking')}
                    </div>
                )}
                <div ref={endOfMessagesRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-outline-variant/20 bg-surface/80 backdrop-blur-md shrink-0 relative z-10">
                <div className="relative">
                    <textarea
                        id="ai_agent_prompt"
                        name="ai_agent_prompt"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={t('ai_agent.placeholder')}
                        className="w-full bg-surface-variant/30 text-on-surface rounded-xl pl-4 pr-20 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none custom-scrollbar border border-outline-variant/30"
                        rows={3}
                        disabled={isLoading}
                    />
                    <button
                        onClick={() => {
                            if (isListening) {
                                stopListening();
                            } else {
                                startListening();
                            }
                        }}
                        disabled={isLoading}
                        title={isListening ? t('ai_agent.mic_active') : t('ai_agent.mic_inactive')}
                        className={`absolute right-12 bottom-2 p-2 rounded-lg transition-all ${isListening
                            ? 'bg-error text-on-error animate-pulse shadow-lg shadow-error/50 scale-110'
                            : 'bg-transparent text-on-surface-variant hover:bg-transparent hover:text-primary'
                            }`}
                    >
                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                    <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 bottom-2 p-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20"
                    >
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                </div>
            </div>

            {/* File Confirmation Modal */}
            <Modal
                isOpen={!!pendingFileAction}
                onClose={() => setPendingFileAction(null)}
                title={pendingFileAction?.type === 'delete_file' ? t('ai_agent.confirm_file_deletion') : (pendingFileAction?.type === 'modify_file' ? t('ai_agent.confirm_file_modification') : t('ai_agent.confirm_file_creation'))}
                className="max-w-4xl"
            >
                {pendingFileAction && (
                    <div className="space-y-4">
                        <p className="text-sm text-on-surface-variant">
                            <strong>{t('ai_agent.path')}</strong> {pendingFileAction.path}
                        </p>
                        
                        <div className="flex gap-4 min-h-[300px] max-h-[60vh]">
                            {pendingFileAction.type !== 'create_file' && (
                                <div className="flex-1 overflow-auto border border-outline-variant/30 rounded-lg p-4 bg-surface-variant/20">
                                    <h4 className="text-xs font-semibold mb-2 text-on-surface-variant uppercase">{t('ai_agent.original_content')}</h4>
                                    <pre className="text-xs font-mono whitespace-pre-wrap">{originalContent}</pre>
                                </div>
                            )}
                            
                            {pendingFileAction.type !== 'delete_file' && (
                                <div className="flex-1 overflow-auto border border-outline-variant/30 rounded-lg p-4 bg-surface-variant/20">
                                    <h4 className="text-xs font-semibold mb-2 text-on-surface-variant uppercase">{t('ai_agent.new_content')}</h4>
                                    <pre className="text-xs font-mono whitespace-pre-wrap">{pendingFileAction.content}</pre>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant/20">
                            <Button variant="ghost" onClick={() => setPendingFileAction(null)}>{t('ai_agent.cancel')}</Button>
                            <Button onClick={confirmFileAction}>
                                {t('ai_agent.confirm')}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
