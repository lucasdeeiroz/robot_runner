
import { useState, useEffect, useRef } from 'react';
import { Check, Scan, Home, ArrowLeft, Rows, X, Search, Pencil, Copy, ChevronDown, ChevronUp, Videotape, Play, Trash2, Code, Move, MousePointer2, ArrowRight, ArrowUp, ArrowDown, Download, RefreshCw, CheckSquare } from 'lucide-react';
import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { InspectorNode, generateXPath, findNodesByLocator, generateUiSelector } from '@/lib/inspectorUtils';
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Select } from "@/components/atoms/Select";
import { Modal } from "@/components/organisms/Modal";
import { useSettings } from "@/lib/settings";
import * as gemini from "@/lib/dashboard/gemini";
import * as claude from "@/lib/dashboard/claude";
import * as openai from "@/lib/dashboard/openai";
import * as claudeCli from "@/lib/dashboard/claudeCode";
import { AiButton } from "@/components/atoms/AiButton";
import { AiResponse } from "@/components/molecules/AiResponse";
import { getSmartSelectorPrompt } from "@/lib/dashboard/prompts";
import { useDeviceViewport } from '@/hooks/useDeviceViewport';
import { DeviceViewport } from '@/components/organisms/DeviceViewport';


interface InspectorSubTabProps {
    selectedDevice: string;
    isActive: boolean;
    isTestRunning?: boolean;
}

interface RecorderOptions {
    duration: number;
    offsetX: number;
    offsetY: number;
    startOffset: number;
    endOffset: number;
}

interface RecordingStep {
    id: number;
    action: string;
    params: RecorderOptions;
    node: InspectorNode | null;
    locator?: string;
}

export function InspectorSubTab({ selectedDevice, isActive, isTestRunning = false }: InspectorSubTabProps) {
    const { t, i18n } = useTranslation();
    const {
        screenshot,
        rootNode,
        xmlDump,
        loading,
        imgLayout,
        setImgLayout,
        selectedNode,
        setSelectedNode,
        hoveredNode,
        setHoveredNode,
        availableNodes,
        setAvailableNodes,
        taps,
        swipes,
        imgRef,
        refreshAll,
        sendAdbInput,
        addTapAnimation,
        handlers
    } = useDeviceViewport({
        deviceId: selectedDevice,
        isActive,
        isBusy: isTestRunning
    });

    const [copied, setCopied] = useState<string | null>(null);

    const handleExportXml = async () => {
        if (!xmlDump) {
            feedback.toast.error(t('inspector.export_xml_no_data'));
            return;
        }

        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const filePath = await save({
                filters: [{
                    name: 'XML Document',
                    extensions: ['xml']
                }],
                defaultPath: `ui_dump_${new Date().getTime()}.xml`
            });

            if (filePath) {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('fs_write_text_file', { path: filePath, content: xmlDump });
                feedback.toast.success(t('inspector.export_xml_success'));
            }
        } catch (e) {
            console.error("XML export failed:", e);
            feedback.toast.error(t('inspector.export_xml_error'));
        }
    };

    // AI Suggestion State
    const { settings, is_test_mode, updateSetting } = useSettings();
    const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
    const [aiRationale, setAiRationale] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [showAiSection, setShowAiSection] = useState(false);
    const [aiCache, setAiCache] = useState<Record<string, { suggestion: string, rationale: string }>>({});

    // Interaction State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<InspectorNode[]>([]);
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    // Recorder State
    const [isRecordingMode, setIsRecordingMode] = useState(false);
    const [recordedSteps, setRecordedSteps] = useState<RecordingStep[]>([]);
    const [recorderOptions, setRecorderOptions] = useState<RecorderOptions>({
        duration: 500,
        offsetX: 0,
        offsetY: 0,
        startOffset: 20,
        endOffset: 80
    });

    // Locator Editing State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingStepId, setEditingStepId] = useState<number | null>(null);
    const [editingAttr, setEditingAttr] = useState<'resource-id' | 'content-desc' | 'xpath' | 'uiselector' | null>(null);
    const [editOptions, setEditOptions] = useState({
        type: 'equals' as 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches',
        kinship: 'none' as 'none' | 'childSelector' | 'fromParent',
        useUiSelectorWrapper: true,
        xpathAttr: 'resource-id' as string,
        selectedAddons: [] as string[]
    });
    const [customLocator, setCustomLocator] = useState("");

    // Live UI Sync State
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
    const lastFocusRef = useRef("");

    // Reset lastFocus when device changes
    useEffect(() => {
        lastFocusRef.current = "";
    }, [selectedDevice]);

    // Parallel Logcat & Focused Activity UI Sync Loop
    useEffect(() => {
        if (!autoRefreshEnabled || !selectedDevice || isTestRunning || !isActive || is_test_mode === 'web') {
            return;
        }

        let isMounted = true;
        let timeoutId: any;

        const checkChanges = async () => {
            try {
                const result = await invoke<[boolean, string]>('check_ui_change', {
                    device: selectedDevice,
                    lastFocus: lastFocusRef.current
                });

                if (!isMounted) return;

                const [hasChanged, currentFocus] = result;
                lastFocusRef.current = currentFocus;

                if (hasChanged) {
                    await refreshAll(true, false);
                }
            } catch (err) {
                console.warn("[Inspector Sync] Error checking UI changes:", err);
            }

            if (isMounted && autoRefreshEnabled) {
                timeoutId = setTimeout(checkChanges, 2000);
            }
        };

        timeoutId = setTimeout(checkChanges, 2000);

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [autoRefreshEnabled, selectedDevice, isTestRunning, isActive, is_test_mode, refreshAll]);

    // Auto-load AI suggestion from cache when node changes
    useEffect(() => {
        if (selectedNode && aiCache[selectedNode.id]) {
            const cached = aiCache[selectedNode.id];
            setAiSuggestion(cached.suggestion);
            setAiRationale(cached.rationale);
            setShowAiSection(true);
        } else {
            setAiSuggestion(null);
            setAiRationale(null);
            setShowAiSection(false);
        }
    }, [selectedNode, aiCache]);

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        if (!rootNode || !query) {
            setSearchResults([]);
            return;
        }
        const results = findNodesByLocator(rootNode, query);
        setSearchResults(results);
    };

    const copyToClipboard = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };

    const handleOpenEditModal = (attr: 'resource-id' | 'content-desc' | 'xpath' | 'uiselector') => {
        setEditingAttr(attr);
        setIsEditModalOpen(true);
        if (selectedNode) {
            let initialAttr = editOptions.xpathAttr;
            if (attr === 'xpath' || attr === 'uiselector') {
                const attrs = selectedNode.attributes;
                if (!attrs[initialAttr]) {
                    if (attrs['resource-id']) initialAttr = 'resource-id';
                    else if (attrs['content-desc']) initialAttr = 'content-desc';
                    else if (attrs['text']) initialAttr = 'text';
                    else if (attrs['class']) initialAttr = 'class';
                }
            } else {
                initialAttr = attr;
            }

            const newOpts = {
                ...editOptions,
                xpathAttr: initialAttr,
                selectedAddons: [] // Reset addons when opening modal
            };
            setEditOptions(newOpts);

            if (attr === 'xpath') {
                setCustomLocator(generateXPath(selectedNode, initialAttr, newOpts.type, newOpts.kinship, []));
            } else if (attr === 'uiselector') {
                setCustomLocator(generateUiSelector(selectedNode, {
                    attr: initialAttr as any,
                    type: newOpts.type,
                    kinship: newOpts.kinship,
                    useUiSelectorWrapper: newOpts.useUiSelectorWrapper,
                    addons: []
                }));
            } else {
                setCustomLocator(generateUiSelector(selectedNode, {
                    attr: attr as any,
                    type: newOpts.type,
                    kinship: newOpts.kinship,
                    useUiSelectorWrapper: newOpts.useUiSelectorWrapper,
                    addons: []
                }));
            }
        }
    };

    const updateCustomLocator = (options: typeof editOptions) => {
        if (!selectedNode || !editingAttr) return;
        if (editingAttr === 'xpath') {
            setCustomLocator(generateXPath(selectedNode, options.xpathAttr, options.type, options.kinship, options.selectedAddons));
        } else if (editingAttr === 'uiselector') {
            setCustomLocator(generateUiSelector(selectedNode, {
                attr: options.xpathAttr as any,
                type: options.type,
                kinship: options.kinship,
                useUiSelectorWrapper: options.useUiSelectorWrapper,
                addons: options.selectedAddons
            }));
        } else {
            setCustomLocator(generateUiSelector(selectedNode, {
                attr: editingAttr as any,
                type: options.type,
                kinship: options.kinship,
                useUiSelectorWrapper: options.useUiSelectorWrapper,
                addons: options.selectedAddons
            }));
        }
    };

    const handleEditStep = (stepId: number) => {
        const step = recordedSteps.find(s => s.id === stepId);
        if (!step || !step.node) return;
        setEditingStepId(step.id);

        setSelectedNode(step.node);
        setEditingAttr('xpath');

        let initialAttr = 'resource-id';
        const attrs = step.node.attributes;
        if (!attrs[initialAttr]) {
            if (attrs['content-desc']) initialAttr = 'content-desc';
            else if (attrs['text']) initialAttr = 'text';
            else if (attrs['class']) initialAttr = 'class';
        }

        const newOpts = {
            ...editOptions,
            type: 'equals' as const,
            xpathAttr: initialAttr,
            selectedAddons: []
        };
        setEditOptions(newOpts);
        setCustomLocator(step.locator || generateXPath(step.node, initialAttr, newOpts.type, newOpts.kinship, []));
        setIsEditModalOpen(true);
    };

    /**
     * Triggers AI-driven selector suggestion based on the selected node's attributes.
     */
    const handleAiSuggest = async (customPrompt?: string) => {
        if (!selectedNode || isAiLoading) return;

        // Check cache first (unless a custom prompt is provided)
        if (!customPrompt && aiCache[selectedNode.id]) {
            const cached = aiCache[selectedNode.id];
            setAiSuggestion(cached.suggestion);
            setAiRationale(cached.rationale);
            setShowAiSection(true);
            return;
        }

        setShowAiSection(true);

        // Explicit click always triggers a new generation. 
        // Initial cache load is already handled by the useEffect on selection.
        setIsAiLoading(true);
        setAiSuggestion(null);
        setAiRationale(null);

        const currentLang = i18n.language === 'pt' ? 'Portuguese' : i18n.language === 'es' ? 'Spanish' : 'English';
        const systemInstruction = getSmartSelectorPrompt(currentLang, customPrompt);

        const prompt = `
Element details:
Tag: ${selectedNode.tagName}
Attributes: ${JSON.stringify(selectedNode.attributes, null, 2)}
Parent Tag: ${selectedNode.parent?.tagName || 'N/A'}
`.trim();

        try {
            setAiError(null);
            let result = "";
            const provider = settings.aiProvider;

            if (provider === 'claude-code') {
                const schema = {
                    type: "object",
                    properties: {
                        selector: { type: "string" },
                        rationale: { type: "string" }
                    },
                    required: ["selector", "rationale"]
                };

                const response = await claudeCli.askClaudeCode(prompt, settings.paths.automationRoot || '', systemInstruction, settings.claudeCodeToken, {
                    allowedTools: ["Read"],
                    jsonSchema: schema,
                    imageBase64: screenshot || undefined
                });

                if (typeof response !== 'string' && response.structured_output) {
                    setAiSuggestion(response.structured_output.selector);
                    setAiRationale(response.structured_output.rationale);

                    if (selectedNode.id) {
                        setAiCache(prev => ({
                            ...prev,
                            [selectedNode.id]: {
                                suggestion: response.structured_output.selector,
                                rationale: response.structured_output.rationale
                            }
                        }));
                    }
                    setIsAiLoading(false);
                    return;
                }

                result = typeof response === 'string' ? response : response.result;
            } else if (provider === 'antigravity-cli') {
                const schema = {
                    type: "object",
                    properties: {
                        selector: { type: "string" },
                        rationale: { type: "string" }
                    },
                    required: ["selector", "rationale"]
                };

                const { askAntigravityCli } = await import('@/lib/dashboard/antigravityCode');
                const response = await askAntigravityCli(prompt, settings.paths.automationRoot || '', systemInstruction, settings.antigravityApiKey, {
                    jsonSchema: schema,
                    imageBase64: screenshot || undefined
                });

                if (typeof response !== 'string' && response.structured_output) {
                    setAiSuggestion(response.structured_output.selector);
                    setAiRationale(response.structured_output.rationale);

                    if (selectedNode.id) {
                        setAiCache(prev => ({
                            ...prev,
                            [selectedNode.id]: {
                                suggestion: response.structured_output.selector,
                                rationale: response.structured_output.rationale
                            }
                        }));
                    }
                    setIsAiLoading(false);
                    return;
                }

                result = typeof response === 'string' ? response : response.result;
            } else if (provider === 'gemini') {
                result = await gemini.askGemini(prompt, settings.geminiApiKey || '', settings.geminiModel, systemInstruction, screenshot || undefined);
            } else if (provider === 'claude') {
                result = await claude.askClaude(prompt, settings.claudeApiKey || '', settings.claudeModel, systemInstruction, screenshot || undefined);
            } else if (provider === 'openai') {
                result = await openai.askOpenAI(prompt, settings.openaiApiKey || '', settings.openaiModel, systemInstruction, screenshot || undefined);
            } else {
                throw new Error("No AI provider configured");
            }

            // Simple parsing of "Selector: " and "Rationale: "
            // Improved parsing: handle cases where the AI might not include prefixes or includes metadata
            const selectorMatch = result.match(/Selector:\s*([^\n\r"]*)/i);
            const rationaleMatch = result.match(/Rationale:\s*([\s\S]*?)(?=\s*","|$)/i);

            let cleanSelector = "";
            if (selectorMatch) {
                cleanSelector = selectorMatch[1].trim().replace(/`|"/g, '');
            } else {
                // If no "Selector:" prefix, try to get the first line but stop if it looks like metadata
                const firstLine = result.split('\n')[0].trim();
                cleanSelector = firstLine.split('","')[0].replace(/`|"/g, '');
            }
            let cleanRationale = "";
            if (rationaleMatch) {
                cleanRationale = rationaleMatch[1].trim();
            } else {
                // If no "Rationale:" prefix, use the whole result but exclude the selector line
                const lines = result.split('\n');
                if (lines.length > 1) {
                    cleanRationale = lines.slice(1).join('\n').trim().split('","')[0];
                } else {
                    cleanRationale = result.split('","')[0];
                }
            }

            setAiSuggestion(cleanSelector);
            setAiRationale(cleanRationale);

            // Save to cache
            setAiCache(prev => ({
                ...prev,
                [selectedNode.id]: {
                    suggestion: cleanSelector,
                    rationale: cleanRationale
                }
            }));

        } catch (error: any) {
            console.error("AI Suggestion Error:", error);
            const msg: string = error.message || String(error);
            if (msg.startsWith('QUOTA_EXHAUSTED:')) {
                const detail = msg.replace('QUOTA_EXHAUSTED:', '').trim();
                setAiError(t('inspector.attributes.ai_error_quota', { detail }));
                feedback.toast.error(t('inspector.attributes.ai_error_quota', { detail }), { duration: 8000 });
            } else if (msg.startsWith('AUTH_ERROR:')) {
                setAiError(t('inspector.attributes.ai_error_auth'));
                feedback.toast.error(t('inspector.attributes.ai_error_auth'));
            } else {
                setAiError(msg);
                feedback.toast.error(t('inspector.attributes.ai_error_generic'));
            }
        } finally {
            setIsAiLoading(false);
        }
    };


    if (!selectedDevice && is_test_mode !== 'web') {
        return (
            <div className="h-full flex flex-col items-center justify-center text-on-surface/80">
                <Scan size={48} className="mb-4 opacity-20" />
                <p>{t('inspector.empty')}</p>
            </div>
        );
    }

    if (isTestRunning) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-on-surface-variant/80 text-sm">
                <Scan size={32} className="opacity-20 mb-2" />
                <p>{t('inspector.status.paused_test')}</p>
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-[44rem] flex flex-col space-y-4">
            <Section
                title={t('inspector.title')}
                icon={Scan}
                variant="transparent"
                className="p-0"
                status={
                    <div className="flex items-center gap-2">
                        {!isSearchFocused && (
                            <>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => sendAdbInput('keyevent 4')} className="rounded" title={t('inspector.nav.back')} tooltipPosition="bottom"><ArrowLeft size={16} /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => sendAdbInput('keyevent 3')} className="rounded" title={t('inspector.nav.home')} tooltipPosition="bottom"><Home size={16} /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => sendAdbInput('keyevent 187')} className="rounded" title={t('inspector.nav.recents')} tooltipPosition="bottom"><Rows size={16} /></Button>
                                    <div className="w-[1px] h-4 bg-outline-variant/30 self-center mx-1" />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsRecordingMode(!isRecordingMode)}
                                        className={clsx(
                                            "p-1.5 rounded transition-all",
                                            isRecordingMode ? "bg-error/10 text-error hover:bg-error/20" : "hover:bg-surface-variant/30 text-on-surface-variant/80"
                                        )}
                                        data-tooltip={isRecordingMode ? t('inspector.recorder.stop') : t('inspector.recorder.start')}
                                        data-position="bottom"
                                    >
                                        <Videotape size={16} className={clsx(isRecordingMode && "animate-pulse")} />
                                    </Button>
                                    <div className="w-[1px] h-4 bg-outline-variant/30 self-center mx-1" />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleExportXml}
                                        disabled={!xmlDump}
                                        className={clsx(
                                            "p-1.5 rounded transition-all text-on-surface-variant/80 hover:bg-surface-variant/30",
                                            !xmlDump && "opacity-50 cursor-not-allowed"
                                        )}
                                        data-tooltip={t('inspector.export_xml')}
                                        data-position="bottom"
                                    >
                                        <Download size={16} />
                                    </Button>
                                    {is_test_mode !== 'web' && (
                                        <>
                                            <div className="w-[1px] h-4 bg-outline-variant/30 self-center mx-1" />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                                                className={clsx(
                                                    "p-1.5 rounded transition-all",
                                                    autoRefreshEnabled ? "bg-primary/10 text-primary dark:text-primary/80 hover:bg-primary/20" : "hover:bg-surface-variant/30 text-on-surface-variant/80"
                                                )}
                                                data-tooltip={t('inspector.live_sync')}
                                                data-position="bottom"
                                            >
                                                <RefreshCw size={16} className={clsx(autoRefreshEnabled && "animate-spin")} />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                }
                menus={
                    <div className={clsx(
                        "flex items-center transition-all duration-300 ease-in-out",
                        isSearchFocused ? "w-[28rem]" : "w-72"
                    )}>
                        <Input
                            placeholder={t('inspector.search.placeholder')}
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
                            onFocus={() => setIsSearchFocused(true)}
                            onBlur={() => setIsSearchFocused(false)}
                            className="h-8 w-full text-xs"
                            leftIcon={<Search size={14} />}
                            rightIcon={searchQuery ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSearch("");
                                    }}
                                    className="rounded-full"
                                    title={t('inspector.search.clear')}
                                    tooltipPosition="left"
                                >
                                    <X size={14} className="opacity-50" />
                                </Button>
                            ) : null}
                        />
                    </div>
                }
                actions={null}
            />

            <div className="flex-1 grid grid-cols-[auto_1fr] gap-2 min-h-0 overflow-hidden">
                <div className="flex flex-col items-center justify-center overflow-hidden relative max-w-[30vw] rounded-2xl">
                    <DeviceViewport
                        screenshot={screenshot}
                        rootNode={rootNode}
                        loading={loading}
                        imgRef={imgRef}
                        imgLayout={imgLayout}
                        onImgLoad={(e) => {
                            const img = e.currentTarget;
                            setImgLayout({
                                width: img.clientWidth,
                                height: img.clientHeight,
                                naturalWidth: img.naturalWidth,
                                naturalHeight: img.naturalHeight
                            });
                        }}
                        hoveredNode={hoveredNode}
                        selectedNode={selectedNode}
                        searchResults={searchResults}
                        taps={taps}
                        swipes={swipes}
                        onRefresh={(forceClear, targetWebUrl) => refreshAll(true, forceClear, targetWebUrl)}
                        handlers={handlers}
                    />
                </div>

                <div className="bg-surface border border-outline-variant/30 rounded-2xl flex flex-col overflow-hidden shadow-sm flex-1">
                    <div className="flex items-center justify-between border-b border-outline-variant/30 shrink-0 bg-surface/50 pr-2">
                        {isRecordingMode ? (
                            <div className="px-4 py-3 text-sm font-semibold text-error flex items-center gap-2 flex-1">
                                <Videotape size={16} className="animate-pulse" />
                                {t('inspector.recorder.title')}
                                <span className="px-1.5 py-0.5 bg-error/10 text-error text-[10px] rounded font-bold uppercase tracking-wider border border-error/20">Beta</span>
                                <span className="ml-auto px-2 py-0.5 bg-error/10 rounded-full text-[10px]">{recordedSteps.length} {t('mapper.items')}</span>
                            </div>
                        ) : availableNodes.length > 1 ? (
                            <div className="flex overflow-x-auto custom-scrollbar flex-1">
                                {availableNodes.map((node) => (
                                    <Button
                                        key={node.id}
                                        onClick={() => setSelectedNode(node)}
                                        className={clsx(
                                            "px-4 py-3 text-sm font-medium transition-colors space-nowrap rounded-none shadow-none",
                                            selectedNode === node ? "border-b-primary text-primary bg-surface-variant/30" : "bg-transparent text-on-surface-variant/80 hover:bg-surface-variant/30"
                                        )}
                                    >
                                        {node.tagName}
                                        {node.attributes['resource-id'] && <span className="ml-2 text-xs opacity-50 truncate max-w-[100px] inline-block align-bottom">{node.attributes['resource-id'].split('/').pop()}</span>}
                                    </Button>
                                ))}
                            </div>
                        ) : (
                            <div className="px-4 py-3 text-sm font-semibold text-on-surface-variant/80 flex-1">
                                {t('inspector.properties')}
                            </div>
                        )}
                        {selectedNode && (
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedNode(null); setAvailableNodes([]); }} className="h-7 w-7 p-0 text-on-surface/80 hover:text-error hover:bg-error-container/10 ml-2" data-tooltip={t('inspector.clear_selection')} data-position="left">
                                <X size={16} />
                            </Button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        {isRecordingMode ? (
                            <RecordingPane
                                selectedNode={selectedNode}
                                recordedSteps={recordedSteps}
                                options={recorderOptions}
                                setOptions={setRecorderOptions}
                                onAddStep={async (action: string, params: any) => {
                                    if (!selectedNode) return;

                                    // Calculate center and base coordinates
                                    const bounds = selectedNode.bounds;
                                    if (bounds) {
                                        const centerX = bounds.x + (bounds.w / 2);
                                        const centerY = bounds.y + (bounds.h / 2);

                                        let cmd = "";
                                        if (action === 'tap') {
                                            cmd = `tap ${centerX + params.offsetX} ${centerY + params.offsetY}`;
                                        } else if (action === 'double_tap') {
                                            await sendAdbInput(`tap ${centerX + params.offsetX} ${centerY + params.offsetY}`);
                                            cmd = `tap ${centerX + params.offsetX} ${centerY + params.offsetY}`;
                                        } else if (action === 'long_press') {
                                            cmd = `swipe ${centerX + params.offsetX} ${centerY + params.offsetY} ${centerX + params.offsetX} ${centerY + params.offsetY} ${params.duration}`;
                                        } else if (action.startsWith('swipe_') || action.startsWith('drag_')) {
                                            const dir = action.split('_')[1];
                                            let x1 = centerX, y1 = centerY, x2 = centerX, y2 = centerY;
                                            if (dir === 'up') {
                                                y1 = bounds.y + (bounds.h * params.endOffset / 100);
                                                y2 = bounds.y + (bounds.h * params.startOffset / 100);
                                            } else if (dir === 'down') {
                                                y1 = bounds.y + (bounds.h * params.startOffset / 100);
                                                y2 = bounds.y + (bounds.h * params.endOffset / 100);
                                            } else if (dir === 'left') {
                                                x1 = bounds.x + (bounds.w * params.endOffset / 100);
                                                x2 = bounds.x + (bounds.w * params.startOffset / 100);
                                            } else if (dir === 'right') {
                                                x1 = bounds.x + (bounds.w * params.startOffset / 100);
                                                x2 = bounds.x + (bounds.w * params.endOffset / 100);
                                            }
                                            cmd = `swipe ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(x2)} ${Math.floor(y2)} ${params.duration}`;
                                        }

                                        if (cmd) {
                                            sendAdbInput(cmd);
                                            // Add animations
                                            if (action.includes('tap')) {
                                                addTapAnimation(centerX + params.offsetX, centerY + params.offsetY);
                                            }
                                        }

                                        const defaultLocator = selectedNode.attributes['resource-id']
                                            ? `id=${selectedNode.attributes['resource-id']}`
                                            : generateXPath(selectedNode);

                                        setRecordedSteps(prev => [...prev, { id: Date.now(), action, params, node: selectedNode, locator: defaultLocator }]);
                                    }
                                }}
                                onRemoveStep={(id: number) => setRecordedSteps(prev => prev.filter(s => s.id !== id))}
                                onEditStep={handleEditStep}
                                onClear={() => setRecordedSteps([])}
                                onCopy={() => {
                                    const code = generateRobotCode(recordedSteps);
                                    navigator.clipboard.writeText(code);
                                    feedback.toast.success('common.copied');
                                }}
                                onGenerateAI={() => {
                                    const historyStr = recordedSteps.map((s, i) => `[Step ${i + 1}] Action: ${s.action.toUpperCase()}, Locator: ${s.locator}`).join('\n');
                                    const prompt = `Gere os testes automatizados em Robot Framework (arquivos .robot e .resource) para este fluxo que acabei de gravar manualmente no Gravador.

IMPORTANTE: Você DEVE utilizar EXATAMENTE os locators fornecidos na lista abaixo para mapear as variáveis do Page Object, pois esses locators foram gerados e validados pelo Robot Runner. Não tente "adivinhar" o elemento nem converter o locator (ex: não converta UiSelector para XPath). Preserve a string do locator exatamente como repassada.
Responda usando o idioma ${settings.language === 'pt_BR' ? 'Português (BR)' : settings.language === 'es_ES' ? 'Espanhol' : 'Inglês'}.

Fluxo Gravado:
${historyStr}`;
                                    if (!settings.aiChatEnabled) {
                                        updateSetting('aiChatEnabled', true);
                                    }
                                    setTimeout(() => {
                                        window.dispatchEvent(new CustomEvent('ai_agent_prompt', { detail: { prompt, hidden: true } }));
                                    }, 200);
                                }}
                                availableNodes={availableNodes}
                                onSelectNode={setSelectedNode}
                                onHoverNode={setHoveredNode}
                                t={t}
                            />
                        ) : selectedNode ? (
                            <div className="p-4 space-y-6">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">{t('inspector.attributes.identifiers')}</h3>
                                        <AiButton
                                            id="inspector_suggest"
                                            isLoading={isAiLoading}
                                            onClick={(_e, customPrompt) => handleAiSuggest(customPrompt)}
                                            label={t('inspector.attributes.suggest_with_ai')}
                                            variant="primary"
                                            className="h-7"
                                        />
                                    </div>

                                    {/* AI Suggestion Section */}
                                    {showAiSection && (
                                        <AiResponse
                                            title={t('inspector.attributes.ai_suggest')}
                                            isLoading={isAiLoading}
                                            responseTitle={t('inspector.attributes.suggested_selector')}
                                            response={aiSuggestion ? `\`${aiSuggestion}\`` : null}
                                            rationaleHeader={t('inspector.attributes.rationale')}
                                            rationale={aiRationale}
                                            error={aiError}
                                            onCopy={(_text) => {
                                                // Extract selector from the Markdown response if needed, 
                                                // but here text is already just the suggestion if we use onCopy effectively.
                                                // Actually, AiResponse passes the full 'response' prop to onCopy.
                                                // We might want to pass just the aiSuggestion to onCopy.
                                                copyToClipboard(aiSuggestion || '', 'ai_s');
                                            }}
                                        />
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <CopyButton
                                            label={t('inspector.attributes.access_id')}
                                            value={selectedNode.attributes['content-desc']}
                                            onCopy={(v) => copyToClipboard(v, 'aid')}
                                            onEdit={() => handleOpenEditModal('content-desc')}
                                            active={copied === 'aid'}
                                        />
                                        <CopyButton
                                            label={t('inspector.attributes.resource_id')}
                                            value={selectedNode.attributes['resource-id']}
                                            onCopy={(v) => copyToClipboard(v, 'rid')}
                                            onEdit={() => handleOpenEditModal('resource-id')}
                                            active={copied === 'rid'}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {!selectedNode.attributes['content-desc'] && !selectedNode.attributes['resource-id'] && (
                                            <CopyButton
                                                label={t('inspector.attributes.uiselector', 'UIAutomator')}
                                                value={generateUiSelector(selectedNode, { type: 'equals', useUiSelectorWrapper: true, attr: 'auto' })}
                                                onCopy={(v) => copyToClipboard(v, 'uis')}
                                                onEdit={() => handleOpenEditModal('uiselector')}
                                                active={copied === 'uis'}
                                            />
                                        )}
                                        <CopyButton
                                            label={t('inspector.attributes.xpath')}
                                            value={generateXPath(selectedNode)}
                                            onCopy={(v) => copyToClipboard(v, 'xp')}
                                            onEdit={() => handleOpenEditModal('xpath')}
                                            active={copied === 'xp'}
                                        />
                                    </div>
                                    <div className="mt-4">
                                        <NodeBreadcrumbs node={selectedNode} onSelect={setSelectedNode} onHover={setHoveredNode} />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider mb-2">{t('inspector.attributes.all')}</h3>
                                    <div className="border border-outline-variant/30 rounded-2xl overflow-hidden text-sm">
                                        {Object.entries(selectedNode.attributes)
                                            .filter(([key, value]) => key !== undefined && value !== undefined && value !== null && value !== '')
                                            .sort(([a], [b]) => {
                                                const order = [
                                                    'resource-id',
                                                    'text',
                                                    'class',
                                                    'package',
                                                    'bounds',
                                                    'index',
                                                    'instance',
                                                    'checkable',
                                                    'checked',
                                                    'clickable',
                                                    'enabled',
                                                    'focusable',
                                                    'focused',
                                                    'long-clickable',
                                                    'password',
                                                    'scrollable',
                                                    'selected'
                                                ];
                                                const idxA = order.indexOf(a);
                                                const idxB = order.indexOf(b);
                                                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                                                if (idxA !== -1) return -1;
                                                if (idxB !== -1) return 1;
                                                return a.localeCompare(b);
                                            })
                                            .map(([key, value]) => (
                                                <div key={key} className="flex flex-col border-b border-outline-variant/30 last:border-0">
                                                    <div className="bg-surface-variant/80 px-3 py-1.5 text-xs text-on-surface-variant/80 font-medium break-all">{key}</div>
                                                    <div className="bg-surface px-3 py-2 font-mono text-on-surface-variant/80 break-all">{String(value)}</div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-on-surface/80 p-8 text-center">
                                <Scan size={48} className="mb-4 opacity-20" />
                                <p className="text-sm">{t('inspector.select_element')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal
                isOpen={isEditModalOpen}
                onClose={() => { setIsEditModalOpen(false); setEditingStepId(null); }}
                title={editingStepId !== null ? t('inspector.modal.edit_step_locator', 'Edit Step Locator') : (editingAttr === 'xpath' ? t('inspector.modal.edit_xpath') : (editingAttr === 'uiselector' ? t('inspector.modal.edit_uiselector', 'Edit UIAutomator Selector') : t('inspector.modal.edit_selector')))}
                className="max-w-md"
            >
                <div className="space-y-4">
                    {editingStepId !== null && (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.format', 'Format')}</label>
                            <Select
                                value={editingAttr || 'xpath'}
                                onChange={(e) => {
                                    const newAttr = e.target.value as any;
                                    setEditingAttr(newAttr);
                                    if (!selectedNode) return;
                                    if (newAttr === 'xpath') {
                                        setCustomLocator(generateXPath(selectedNode, editOptions.xpathAttr, editOptions.type, editOptions.kinship, editOptions.selectedAddons));
                                    } else if (newAttr === 'uiselector') {
                                        setCustomLocator(generateUiSelector(selectedNode, {
                                            attr: editOptions.xpathAttr as any,
                                            type: editOptions.type,
                                            kinship: editOptions.kinship,
                                            useUiSelectorWrapper: editOptions.useUiSelectorWrapper,
                                            addons: editOptions.selectedAddons
                                        }));
                                    }
                                }}
                                options={[
                                    { label: 'XPath', value: 'xpath' },
                                    { label: 'UiSelector', value: 'uiselector' }
                                ]}
                            />
                        </div>
                    )}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.match_type', 'Match Type')}</label>
                        <Select
                            value={editOptions.type}
                            onChange={(e) => {
                                const val = e.target.value as any;
                                const newOpts = { ...editOptions, type: val };
                                setEditOptions(newOpts);
                                updateCustomLocator(newOpts);
                            }}
                            options={[
                                { label: t('inspector.modal.match_type_equals'), value: 'equals' },
                                { label: t('inspector.modal.match_type_contains'), value: 'contains' },
                                { label: t('inspector.modal.match_type_starts_with'), value: 'startsWith' },
                                { label: t('inspector.modal.match_type_ends_with'), value: 'endsWith' },
                                { label: t('inspector.modal.match_type_regex'), value: 'matches' },
                            ]}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.kinship_method')}</label>
                        <Select
                            value={editOptions.kinship}
                            onChange={(e) => {
                                const val = e.target.value as any;
                                const newOpts = { ...editOptions, kinship: val };
                                setEditOptions(newOpts);
                                updateCustomLocator(newOpts);
                            }}
                            options={[
                                { label: t('inspector.modal.kinship_none'), value: 'none' },
                                { label: t('inspector.modal.kinship_child_selector'), value: 'childSelector' },
                                { label: t('inspector.modal.kinship_from_parent'), value: 'fromParent' },
                            ]}
                        />
                    </div>

                    {editingAttr !== 'xpath' && editingAttr !== 'uiselector' ? (
                        <div className="flex items-center gap-2 pt-2">
                            <input
                                type="checkbox"
                                id="useWrapper"
                                checked={editOptions.useUiSelectorWrapper}
                                onChange={(e) => {
                                    const newOpts = { ...editOptions, useUiSelectorWrapper: e.target.checked };
                                    setEditOptions(newOpts);
                                    updateCustomLocator(newOpts);
                                }}
                                className="rounded border-outline-variant/30 text-primary dark:text-primary/80 focus:ring-primary/20"
                            />
                            <label htmlFor="useWrapper" className="text-xs font-medium text-on-surface-variant/80">
                                {t('inspector.modal.use_wrapper')}
                            </label>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.preferred_attr')}</label>
                            <Select
                                value={editOptions.xpathAttr}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const newOpts = { ...editOptions, xpathAttr: val };
                                    setEditOptions(newOpts);
                                    updateCustomLocator(newOpts);
                                }}
                                options={[
                                    { label: t('inspector.modal.preferred_attr_resource_id'), value: 'resource-id' },
                                    { label: t('inspector.modal.preferred_attr_text'), value: 'text' },
                                    { label: t('inspector.modal.preferred_attr_content_desc'), value: 'content-desc' },
                                    { label: t('inspector.modal.preferred_attr_class'), value: 'class' },
                                ].filter(opt => selectedNode?.attributes[opt.value])}
                            />
                        </div>
                    )}

                    <div className="space-y-2 pt-2">
                        <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.additional_attrs')}</label>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1 border border-outline-variant/30 rounded-lg">
                            {[
                                { label: t('inspector.modal.attr_resource_id'), value: 'resource-id' },
                                { label: t('inspector.modal.attr_text'), value: 'text' },
                                { label: t('inspector.modal.attr_content_desc'), value: 'content-desc' },
                                { label: t('inspector.modal.attr_class'), value: 'class' },
                                { label: t('inspector.modal.attr_index'), value: 'index' },
                                { label: t('inspector.modal.attr_instance'), value: 'instance' },
                                { label: t('inspector.modal.attr_clickable'), value: 'clickable' },
                                { label: t('inspector.modal.attr_long_clickable'), value: 'long-clickable' },
                                { label: t('inspector.modal.attr_enabled'), value: 'enabled' },
                                { label: t('inspector.modal.attr_checked'), value: 'checked' },
                                { label: t('inspector.modal.attr_selected'), value: 'selected' },
                                { label: t('inspector.modal.attr_focusable'), value: 'focusable' },
                                { label: t('inspector.modal.attr_focused'), value: 'focused' },
                                { label: t('inspector.modal.attr_scrollable'), value: 'scrollable' },
                                { label: t('inspector.modal.attr_checkable'), value: 'checkable' },
                            ].filter(opt =>
                                selectedNode?.attributes[opt.value] !== undefined &&
                                selectedNode?.attributes[opt.value] !== null &&
                                selectedNode?.attributes[opt.value] !== '' &&
                                (editingAttr === 'xpath' ? opt.value !== editOptions.xpathAttr : opt.value !== editingAttr)
                            ).map(opt => (
                                <div key={opt.value} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id={`addon-${opt.value}`}
                                        checked={editOptions.selectedAddons.includes(opt.value)}
                                        onChange={(e) => {
                                            const newAddons = e.target.checked
                                                ? [...editOptions.selectedAddons, opt.value]
                                                : editOptions.selectedAddons.filter(a => a !== opt.value);
                                            const newOpts = { ...editOptions, selectedAddons: newAddons };
                                            setEditOptions(newOpts);
                                            updateCustomLocator(newOpts);
                                        }}
                                        className="rounded border-outline-variant/30 text-primary dark:text-primary/80 focus:ring-primary/20 h-3.5 w-3.5"
                                    />
                                    <label htmlFor={`addon-${opt.value}`} className="text-xs text-on-surface-variant/80 cursor-pointer truncate" title={opt.label}>
                                        {opt.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1 pt-4 border-t border-outline-variant/30">
                        <label className="text-xs font-medium text-on-surface-variant/80">{t('inspector.modal.result')}</label>
                        <div className="flex bg-surface-variant/20 p-3 rounded-2xl border border-outline-variant/30">
                            <code className="text-xs break-all flex-1 text-primary dark:text-primary/80 font-mono">{customLocator}</code>
                            <Button onClick={() => copyToClipboard(customLocator, 'modal_copy')} className="ml-2 p-1 bg-transparent shadow-none text-on-surface-variant/80 hover:text-primary rounded-full transition-colors">
                                {copied === 'modal_copy' ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                            </Button>
                        </div>
                    </div>
                    {editingStepId !== null && (
                        <div className="pt-4 flex justify-end">
                            <Button variant="primary" onClick={() => {
                                setRecordedSteps(prev => prev.map(s => s.id === editingStepId ? { ...s, locator: customLocator } : s));
                                setIsEditModalOpen(false);
                                setEditingStepId(null);
                            }}>
                                {t('common.save', 'Save')}
                            </Button>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}

interface RecordingPaneProps {
    selectedNode: InspectorNode | null;
    recordedSteps: RecordingStep[];
    availableNodes: InspectorNode[];
    options: RecorderOptions;
    setOptions: (options: RecorderOptions) => void;
    onAddStep: (action: string, params: RecorderOptions) => void;
    onSelectNode: (node: InspectorNode) => void;
    onHoverNode: (node: InspectorNode | null) => void;
    onRemoveStep: (id: number) => void;
    onEditStep: (id: number) => void;
    onClear: () => void;
    onCopy: () => void;
    onGenerateAI: () => void;
    t: any;
}

function RecordingPane({
    selectedNode,
    recordedSteps,
    availableNodes,
    options,
    setOptions,
    onAddStep,
    onSelectNode,
    onHoverNode,
    onRemoveStep,
    onEditStep,
    onClear,
    onCopy,
    onGenerateAI,
    t
}: RecordingPaneProps) {
    const [activeTab, setActiveTab] = useState<'tap' | 'swipe' | 'drag' | 'assert'>('tap');

    return (
        <div className="flex flex-col h-full bg-surface">
            {/* Action Toolset */}
            <div className="p-4 border-b border-outline-variant/20 bg-surface-variant/10">
                <div className="flex gap-1 mb-4 bg-surface-variant/30 p-1 rounded-xl">
                    <Button
                        variant={activeTab === 'tap' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('tap')}
                        className={clsx(
                            "flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg",
                            activeTab !== 'tap' && "text-on-surface-variant/70"
                        )}
                        leftIcon={<MousePointer2 size={14} />}
                    >
                        {t('inspector.recorder.actions.tap')}
                    </Button>
                    <Button
                        variant={activeTab === 'swipe' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('swipe')}
                        className={clsx(
                            "flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg",
                            activeTab !== 'swipe' && "text-on-surface-variant/70"
                        )}
                        leftIcon={<Move size={14} />}
                    >
                        {t('inspector.recorder.actions.swipe')}
                    </Button>
                    <Button
                        variant={activeTab === 'drag' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('drag')}
                        className={clsx(
                            "flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg",
                            activeTab !== 'drag' && "text-on-surface-variant/70"
                        )}
                        leftIcon={<Play size={14} className="rotate-90" />}
                    >
                        {t('inspector.recorder.actions.drag_drop')}
                    </Button>
                    <Button
                        variant={activeTab === 'assert' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('assert')}
                        className={clsx(
                            "flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg",
                            activeTab !== 'assert' && "text-on-surface-variant/70"
                        )}
                        leftIcon={<CheckSquare size={14} />}
                    >
                        {t('inspector.recorder.actions.assert', 'Assert')}
                    </Button>
                </div>

                {selectedNode ? (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                        {/* Selector Header */}
                        <div className="flex items-center justify-between pb-1 border-b border-outline-variant/10">
                            <span className="text-[9px] font-bold text-primary uppercase tracking-widest">{t('inspector.recorder.selection', 'Active Selection')}</span>
                            <span className="text-[9px] font-mono text-on-surface-variant/60 bg-surface-variant/50 px-2 py-0.5 rounded italic truncate max-w-[120px]">
                                {selectedNode.tagName.replace('android.widget.', '')} {selectedNode.attributes['resource-id']?.split('/').pop()}
                            </span>
                        </div>

                        <div className={clsx(
                            "p-2 bg-surface rounded-xl border border-outline-variant/30 gap-3",
                            availableNodes.length > 1 ? "grid grid-cols-2" : "flex flex-col space-y-2"
                        )}>
                            {/* Sibling Selector */}
                            {availableNodes.length > 1 && (
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-on-surface-variant/60 uppercase ml-1">{t('inspector.recorder.siblings', 'Alternative Nodes')}</label>
                                    <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
                                        {availableNodes.map((node) => (
                                            <Button
                                                key={node.id}
                                                onClick={() => onSelectNode(node)}
                                                onMouseEnter={() => onHoverNode(node)}
                                                onMouseLeave={() => onHoverNode(null)}
                                                className={clsx(
                                                    "px-2 py-1 shadow-none text-[10px] rounded-lg border transition-all whitespace-nowrap",
                                                    selectedNode === node
                                                        ? "bg-primary/10 border-primary text-primary font-bold"
                                                        : "bg-surface-variant/20 border-outline-variant/30 text-on-surface-variant/70 hover:bg-surface-variant/50"
                                                )}
                                            >
                                                {node.tagName.replace('android.widget.', '')}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Hierarchy Selector */}
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-on-surface-variant/60 uppercase ml-1">{t('inspector.attributes.hierarchy', 'Hierarchy')}</label>
                                <div className="flex flex-wrap items-center gap-1 p-1 bg-surface-variant/10 rounded-lg border border-outline-variant/10 h-[30px]">
                                    {(() => {
                                        let path: InspectorNode[] = [];
                                        let curr: InspectorNode | undefined = selectedNode;
                                        while (curr) {
                                            if (curr.tagName !== 'hierarchy') path.unshift(curr);
                                            curr = curr.parent;
                                        }
                                        const displayPath = path.slice(-3);
                                        return displayPath.map((n, i) => (
                                            <div key={n.id} className="flex items-center">
                                                {i > 0 && <span className="mx-0.5 text-[10px] opacity-30">&gt;</span>}
                                                <Button
                                                    variant="unstyled"
                                                    onClick={() => onSelectNode(n)}
                                                    onMouseEnter={() => onHoverNode(n)}
                                                    onMouseLeave={() => onHoverNode(null)}
                                                    className={clsx(
                                                        "text-[10px] hover:text-primary truncate max-w-[80px]",
                                                        n === selectedNode ? "font-bold text-on-surface underline decoration-primary/40 underline-offset-2" : "text-on-surface-variant/60"
                                                    )}
                                                >
                                                    {n.tagName.replace('android.widget.', '')}
                                                </Button>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.duration')}</label>
                                <Input
                                    type="number"
                                    value={options.duration}
                                    onChange={(e: any) => setOptions({ ...options, duration: parseInt(e.target.value) })}
                                    className="h-8 text-xs"
                                />
                            </div>
                            {activeTab === 'tap' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.offset_x')}</label>
                                        <Input
                                            type="number"
                                            value={options.offsetX}
                                            onChange={(e: any) => setOptions({ ...options, offsetX: parseInt(e.target.value) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.offset_y')}</label>
                                        <Input
                                            type="number"
                                            value={options.offsetY}
                                            onChange={(e: any) => setOptions({ ...options, offsetY: parseInt(e.target.value) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </>
                            )}
                            {(activeTab === 'swipe' || activeTab === 'drag') && (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.start_offset')}</label>
                                        <Input
                                            type="number"
                                            value={options.startOffset}
                                            onChange={(e: any) => setOptions({ ...options, startOffset: parseInt(e.target.value) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-medium text-on-surface-variant/70 ml-1 truncate block">{t('inspector.recorder.params.end_offset')}</label>
                                        <Input
                                            type="number"
                                            value={options.endOffset}
                                            onChange={(e: any) => setOptions({ ...options, endOffset: parseInt(e.target.value) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {activeTab === 'assert' ? (
                            <div className="grid grid-cols-1 gap-2">
                                <Button size="sm" onClick={() => onAddStep('assert', options)} className="w-full text-[10px] h-8 bg-success/20 text-success hover:bg-success/30 border-success/30">{t('inspector.recorder.actions.assert', 'Assert Element')}</Button>
                            </div>
                        ) : activeTab === 'tap' ? (
                            <div className="grid grid-cols-3 gap-2">
                                <Button size="sm" onClick={() => onAddStep('tap', options)} className="w-full text-[10px] h-8">{t('inspector.recorder.actions.tap')}</Button>
                                <Button size="sm" onClick={() => onAddStep('double_tap', options)} variant="outline" className="w-full text-[10px] h-8">{t('inspector.recorder.actions.double_tap')}</Button>
                                <Button size="sm" onClick={() => onAddStep('long_press', options)} variant="ghost" className="w-full text-[10px] h-8">{t('inspector.recorder.actions.long_press')}</Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-4 gap-2">
                                <Button variant="secondary" size="sm" onClick={() => onAddStep(`${activeTab}_up`, options)} className="p-0 h-8 flex flex-col items-center justify-center">
                                    <ArrowUp size={14} />
                                    <span className="text-[8px]">{t('inspector.recorder.directions.up')}</span>
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => onAddStep(`${activeTab}_down`, options)} className="p-0 h-8 flex flex-col items-center justify-center">
                                    <ArrowDown size={14} />
                                    <span className="text-[8px]">{t('inspector.recorder.directions.down')}</span>
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => onAddStep(`${activeTab}_left`, options)} className="p-0 h-8 flex flex-col items-center justify-center">
                                    <ArrowLeft size={14} />
                                    <span className="text-[8px]">{t('inspector.recorder.directions.left')}</span>
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => onAddStep(`${activeTab}_right`, options)} className="p-0 h-8 flex flex-col items-center justify-center">
                                    <ArrowRight size={14} />
                                    <span className="text-[8px]">{t('inspector.recorder.directions.right')}</span>
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-on-surface-variant/40 animate-pulse">
                        <MousePointer2 size={24} className="mb-2" />
                        <p className="text-[10px] font-medium">{t('inspector.select_element')}</p>
                    </div>
                )}
            </div>

            {/* Steps List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                <div className="sticky top-0 bg-surface z-10 px-4 py-2 border-b border-outline-variant/10 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{t('inspector.recorder.steps')}</span>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={onClear} disabled={recordedSteps.length === 0} className="h-6 text-[10px] text-error hover:bg-error/10">
                            <Trash2 size={12} className="mr-1" />
                            {t('inspector.recorder.clear')}
                        </Button>
                        <Button
                            variant="outline"
                            className="w-auto h-8 text-xs px-3"
                            disabled={recordedSteps.length === 0}
                            onClick={onCopy}
                        >
                            <Copy size={14} className="mr-2" />
                            {t('inspector.recorder.copy')}
                        </Button>
                        <AiButton
                            id="recorder_generate_ai_test"
                            isLoading={false}
                            disabled={recordedSteps.length === 0}
                            onClick={onGenerateAI}
                            label={t('run_tab.console.generate_ai_test', 'Gerar Teste Robot (IA)')}
                            variant="primary"
                            className="h-8 text-xs shadow-lg shadow-primary/20 px-3"
                        />
                    </div>
                </div>

                {recordedSteps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant/30">
                        <Code size={32} className="mb-2 opacity-20" />
                        <p className="text-xs">{t('inspector.recorder.empty')}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-outline-variant/10">
                        {recordedSteps.map((step, idx) => (
                            <div key={step.id} className="group p-3 flex items-start gap-3 hover:bg-surface-variant/20 transition-colors">
                                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-surface-variant/50 rounded-full text-[10px] font-bold text-on-surface-variant/60">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-bold text-on-surface truncate capitalize">
                                            {step.action.replace('_', ' ')}
                                        </span>
                                        <span className="text-[10px] text-primary bg-primary/10 px-1.5 rounded font-medium">
                                            {step.node?.tagName}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-on-surface-variant/60 font-mono truncate">
                                        {step.locator || (step.node?.attributes['resource-id']?.split('/').pop() || (step.node ? generateXPath(step.node) : 'Unknown'))}
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => onEditStep(step.id)} className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 text-on-surface-variant/40 hover:text-primary hover:bg-primary/10 transition-all mr-1">
                                    <Pencil size={14} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => onRemoveStep(step.id)} className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 text-on-surface-variant/40 hover:text-error hover:bg-error/10 transition-all">
                                    <X size={14} />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function generateRobotCode(steps: RecordingStep[]) {
    if (!steps.length) return "";

    const lines = ["*** Test Cases ***", "Recorded Interaction", "    [Documentation]    Steps recorded from Inspector Recorder"];

    steps.forEach(step => {
        if (!step.node) return;
        const locator = step.locator || (step.node.attributes['resource-id']
            ? `id=${step.node.attributes['resource-id']}`
            : generateXPath(step.node));

        const action = step.action;
        const p = step.params;

        if (action === 'tap') {
            lines.push(`    Click Element    ${locator}`);
        } else if (action === 'double_tap') {
            lines.push(`    Double Tap Element    ${locator}`);
        } else if (action === 'long_press') {
            lines.push(`    Long Press Element    ${locator}    duration=${p.duration}`);
        } else if (action.startsWith('swipe_')) {
            const dir = action.split('_')[1];
            lines.push(`    Swipe By Percent    ${locator}    direction=${dir}    start_offset=${p.startOffset}    end_offset=${p.endOffset}    duration=${p.duration}`);
        } else if (action.startsWith('drag_')) {
            const dir = action.split('_')[1];
            lines.push(`    Drag And Drop    ${locator}    direction=${dir}    duration=${p.duration}`);
        } else if (action === 'assert') {
            lines.push(`    Wait Until Element Is Visible    ${locator}    timeout=15`);
        }
    });

    return lines.join('\n');
}

function NodeBreadcrumbs({ node, onSelect, onHover }: { node: InspectorNode, onSelect: (n: InspectorNode) => void, onHover: (n: InspectorNode | null) => void }) {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);
    if (!node) return null;

    let path: InspectorNode[] = [];
    let curr: InspectorNode | undefined = node;
    while (curr) {
        if (curr.tagName !== 'hierarchy') path.unshift(curr);
        curr = curr.parent;
    }
    const contentIndex = path.findIndex(n => n.attributes['resource-id']?.endsWith(':id/content'));
    if (contentIndex !== -1) path = path.slice(contentIndex + 1);

    const cleanTag = (tag: string) => tag.replace('android.widget.', '').replace('android.view.', '');

    const displayPath = isExpanded ? path : path.slice(-2);
    const isHidden = path.length > 2 && !isExpanded;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">{t('inspector.attributes.hierarchy', 'Hierarchy')}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs text-on-surface-variant/80 font-mono p-2 bg-surface/50 rounded border border-outline-variant/30">
                {isHidden && (
                    <div className="flex items-center">
                        <span className="px-1 opacity-50">...</span>
                        <span className="mx-1 text-on-surface/80">&gt;</span>
                    </div>
                )}
                {displayPath.map((n, i) => (
                    <div key={n.id} className="flex items-center">
                        {i > 0 && <span className="mx-1 text-on-surface/80">&gt;</span>}
                        <Button
                            variant="unstyled"
                            onClick={() => onSelect(n)}
                            onMouseEnter={() => onHover(n)}
                            onMouseLeave={() => onHover(null)}
                            className={clsx(
                                "hover:text-primary hover:underline transition-colors text-left text-xs",
                                n === node ? "font-bold text-on-surface/80" : ""
                            )}
                            title={generateXPath(n)}
                        >
                            {n.tagName === 'node' && n.attributes['class'] ? cleanTag(n.attributes['class']) : cleanTag(n.tagName)}
                            {n.attributes['resource-id'] && <span className="ml-1 text-primary dark:text-primary/80">resource-id="{n.attributes['resource-id'].split('/').pop()}"</span>}
                            {!n.attributes['resource-id'] && n.attributes['content-desc'] && <span className="ml-1 text-on-success-container/10">content-desc="{n.attributes['content-desc'].substring(0, 15)}..."</span>}
                        </Button>
                    </div>
                ))}
                {path.length > 2 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="h-6 px-2 text-[10px] gap-1 hover:bg-surface-variant/50 ml-auto"
                    >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
                    </Button>
                )}
            </div>
        </div>
    );
}

function CopyButton({ label, value, onCopy, onEdit, active }: { label: string, value: string | undefined, onCopy: (v: string) => void, onEdit: () => void, active: boolean }) {
    const { t } = useTranslation();
    if (value === undefined || value === null || value === '') return null; // Don't show if empty
    return (
        <div
            onClick={() => onCopy(value)}
            className={clsx(
                "flex flex-col items-start p-2 rounded-2xl border transition-all text-left bg-surface/50 border-outline-variant/30 hover:border-info-container/50 cursor-pointer select-none",
                active && "bg-success-container/10 border-success-container/20 text-on-success-container"
            )}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCopy(value);
                }
            }}
        >
            <span className="text-[10px] tracking-wider opacity-70 mb-0.5 flex w-full justify-between">
                <div className="font-semibold uppercase">
                    {label}
                </div>
                <div className="text-success">
                    {active && <div className="flex items-center gap-1"><Check size={12} />{t("inspector.attributes.copied")}</div>}
                </div>
            </span>
            <div className="flex items-center gap-2 w-full">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="p-1 h-7 w-7 text-on-surface-variant/80 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                    title={t('common.edit')}
                >
                    <Pencil size={12} />
                </Button>
                <div className="text-xs font-mono truncate flex-1" title={value}>{value}</div>
            </div>
        </div>
    );
}
