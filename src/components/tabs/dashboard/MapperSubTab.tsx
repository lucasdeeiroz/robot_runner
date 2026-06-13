import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Check, Scan, Home, ArrowLeft, Rows, X, GitGraph, Trash2, Plus, FileClock, SearchCode, ChevronDown, ChevronUp, ChevronRight,
    FileCode, FileStack, Upload, Download, Eye, EyeClosed, Settings2, Sparkles, Save
} from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { InspectorNode, transformXmlToTree, generateXPath, findNodesByLocator, findNodesByText, sanitizeId } from '@/lib/inspectorUtils';
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { Combobox } from "@/components/atoms/Combobox";
import { Select } from "@/components/atoms/Select";
import { TagInput } from "@/components/atoms/TagInput";
import { Input } from "@/components/atoms/Input";
import { Textarea } from "@/components/atoms/Textarea";
import { Switch } from "@/components/atoms/Switch";
import { UIElementType, UIElementMap, ScreenMap, NavigationData } from '@/lib/types';
import { saveScreenMap, loadScreenMap, listScreenMaps, deleteScreenMap, exportMapperData, importMapperData } from '@/lib/dashboard/mapperPersistence';
import { useSettings } from '@/lib/settings';
import { save, open } from '@tauri-apps/plugin-dialog';
import { ConfirmationModal } from '@/components/organisms/ConfirmationModal';
import EnhanceMapsModal from '@/components/organisms/EnhanceMapsModal';
import { processAndEnhanceMaps } from '@/lib/dashboard/enhancerEngine';
import { FlowchartModal } from '@/components/organisms/FlowchartModal';
import { generateTestLinkXML, generateRobotBDD, generateFlows } from '@/lib/dashboard/flowGenerator';
import { Button } from '@/components/atoms/Button';
import { SegmentedControl } from '@/components/molecules/SegmentedControl';
import { GroupedScreenSelect } from '@/components/molecules/GroupedScreenSelect';
import { groupScreensByTags } from '@/lib/utils';
import { AiButton } from "@/components/atoms/AiButton";
import { AiResponse } from "@/components/molecules/AiResponse";
import * as gemini from '@/lib/dashboard/gemini';
import * as claude from '@/lib/dashboard/claude';
import * as openai from '@/lib/dashboard/openai';
import * as claudeCli from '@/lib/dashboard/claudeCode';
import { AutonomousExplorer, LogEntry, ExplorationAction, ExplorationConfig } from '@/lib/dashboard/explorationEngine';
import { analyzeExplorationPrompt } from '@/lib/dashboard/explorationInit';
import { getAiContext } from '@/lib/dashboard/historyAnalysisUtils';
import { ExplorationLogTree } from '@/components/molecules/ExplorationLogTree';
import { useDeviceViewport } from '@/hooks/useDeviceViewport';
import { DeviceViewport } from '@/components/organisms/DeviceViewport';
import { useTestSessions } from '@/lib/testSessionStore';
import { AutonomousExplorationConfigModal } from '@/components/organisms/dashboard/AutonomousExplorationConfigModal';


function groupElementsByType<T extends { type: string }>(
    elements: T[],
    translate: (key: string) => string
): Record<string, T[]> {
    return elements.reduce((acc, el) => {
        const typeName = translate(`mapper.types.${el.type}`);
        if (!acc[typeName]) {
            acc[typeName] = [];
        }
        acc[typeName].push(el);
        return acc;
    }, {} as Record<string, T[]>);
}

interface MapperSubTabProps {
    isActive: boolean;
    selectedDeviceId: string | null;
}

export function MapperSubTab({ isActive, selectedDeviceId }: MapperSubTabProps) {
    const { settings, is_test_mode } = useSettings();
    const { t, i18n } = useTranslation();
    const { activeProfileId } = useSettings();
    const { sessions } = useTestSessions();

    // --- Screen Mapper State ---
    const [screenName, setScreenName] = useState("");
    const [screenType, setScreenType] = useState<'screen' | 'modal' | 'tab' | 'drawer'>('screen');
    const [screenDescription, setScreenDescription] = useState("");
    const [screenTags, setScreenTags] = useState<string[]>([]);
    const [mappedElements, setMappedElements] = useState<UIElementMap[]>([]);
    const [currentElement, setCurrentElement] = useState<Partial<UIElementMap>>({});
    const [savedMaps, setSavedMaps] = useState<ScreenMap[]>([]);
    const [showLoadMenu, setShowLoadMenu] = useState(false);
    const loadMenuRef = useRef<HTMLDivElement>(null);
    const [showElementsMenu, setShowElementsMenu] = useState(false);
    const elementsMenuRef = useRef<HTMLDivElement>(null);

    // Grouping State
    const [screenListMode, setScreenListMode] = useState<'all' | 'tags'>('all');
    const [elementListMode, setElementListMode] = useState<'all' | 'type'>('all');
    const [expandedScreenTags, setExpandedScreenTags] = useState<string[]>([]);
    const [expandedElementTypes, setExpandedElementTypes] = useState<string[]>([]);

    // Helper state for confirmation modal
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [screenToDelete, setScreenToDelete] = useState<string | null>(null);
    const [isFlowchartOpen, setIsFlowchartOpen] = useState(false);

    // AI Suggestion State
    const [isAISuggesting, setIsAISuggesting] = useState(false);
    const [aiSuggestedName, setAiSuggestedName] = useState<string | null>(null);
    const [isExplorationModalOpen, setIsExplorationModalOpen] = useState(false);
    const [aiJustification, setAiJustification] = useState<string | null>(null);
    const [showAISuggestion, setShowAISuggestion] = useState(false);
    const [isAISuggestingTags, setIsAISuggestingTags] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // --- Autonomous Exploration State ---
    const hasApiKey = useMemo(() => {
        const provider = settings.aiProvider || 'gemini';
        if (provider === 'gemini') return !!settings.geminiApiKey;
        if (provider === 'claude') return !!settings.claudeApiKey;
        if (provider === 'openai') return !!settings.openaiApiKey;
        if (provider === 'claude-code' || provider === 'antigravity-cli') return true; // Always allow, as CLI may be pre-authenticated
        return false;
    }, [settings.aiProvider, settings.geminiApiKey, settings.claudeApiKey, settings.openaiApiKey, settings.claudeCodeToken, settings.antigravityApiKey]);
    const [isStayOn, setIsStayOn] = useState(false);
    const [isEnhanceModalOpen, setIsEnhanceModalOpen] = useState(false);

    // Migration logic
    const prevMappingsPathRef = useRef<string | null>(settings.paths?.mappings || null);
    const [showMigrationModal, setShowMigrationModal] = useState(false);
    const [migrationData, setMigrationData] = useState<{ oldPath: string; newPath: string } | null>(null);
    const [isMigrating, setIsMigrating] = useState(false);
    const [isExploring, setIsExploring] = useState(false);
    const isExploringRef = useRef(false);
    const lastActionRef = useRef<string | null>(null);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const enhanceAbortControllerRef = useRef<AbortController | null>(null);
    const [explorationLogs, setExplorationLogs] = useState<LogEntry[]>([]);
    const explorerRef = useRef<AutonomousExplorer | null>(null);
    const explorationPromptRef = useRef<string | undefined>(undefined);
    const explorationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const logScrollRef = useRef<HTMLDivElement>(null);
    const [explorationStickToBottom, setExplorationStickToBottom] = useState(true);

    // Auto-scroll exploration logs with stick-to-bottom logic
    useEffect(() => {
        if (!explorationStickToBottom) return;

        // Reset scroll lock if a new session starts
        if (explorationLogs.length < 3 && !explorationStickToBottom) setExplorationStickToBottom(true);

        const el = logScrollRef.current;
        const timer = setTimeout(() => {
            if (el) el.scrollTop = el.scrollHeight;
        }, 80);
        return () => clearTimeout(timer);
    }, [explorationLogs, explorationStickToBottom]);

    const onExplorationScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        if (isNearBottom !== explorationStickToBottom) {
            setExplorationStickToBottom(isNearBottom);
        }
    };

    useOutsideClick(loadMenuRef, () => {
        if (showLoadMenu) setShowLoadMenu(false);
    });

    useOutsideClick(elementsMenuRef, () => {
        if (showElementsMenu) setShowElementsMenu(false);
    });

    useEffect(() => {
        loadSavedMaps();
    }, [activeProfileId]);

    const selectedDevice = selectedDeviceId;
    const isTestRunningOnSelectedDevice = useMemo(() => {
        if (!selectedDevice) return false;
        return sessions.some(session => session.status === 'running' && session.deviceUdid === selectedDevice);
    }, [selectedDevice, sessions]);
    const isMapperBusy = isExploring || isEnhancing || (isTestRunningOnSelectedDevice && !settings.allowActionsDuringTest);

    const {
        screenshot,
        setScreenshot,
        rootNode,
        setRootNode,
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
        handlers
    } = useDeviceViewport({
        deviceId: selectedDevice,
        isActive,
        isBusy: isMapperBusy
    });

    const toggleStayOn = async () => {
        if (!selectedDevice) return;
        const newState = !isStayOn;
        try {
            await invoke('set_stay_on', { device: selectedDevice, enabled: newState });
            setIsStayOn(newState);
            feedback.toast.success(newState ? t('mapper.feedback.stay_on_enabled', 'Stay Awake enabled') : t('mapper.feedback.stay_on_disabled', 'Stay Awake disabled'));
        } catch (e) {
            console.error("Failed to toggle stay_on", e);
            feedback.toast.error(t('mapper.error.stay_on_failed', 'Failed to change Stay Awake state'));
        }
    };

    const loadSavedMaps = async () => {
        const maps = await listScreenMaps(activeProfileId, settings.paths?.mappings);
        setSavedMaps(maps);
        return maps;
    };

    const handleMappingsPathChange = async (oldPath: string, newPath: string) => {
        try {
            const oldEntries = await invoke<any[]>('list_directory', { path: oldPath });
            const newEntries = await invoke<any[]>('list_directory', { path: newPath });

            const hasMappings = oldEntries.some(e => e.name.endsWith('.json'));
            const isEmpty = !newEntries.some(e => e.name.endsWith('.json'));

            if (hasMappings && isEmpty) {
                setMigrationData({ oldPath, newPath });
                setShowMigrationModal(true);
            }
        } catch (e) {
            console.error("Migration check failed", e);
        }
    };

    const performMigration = async () => {
        if (!migrationData) return;
        setIsMigrating(true);
        try {
            const { oldPath, newPath } = migrationData;
            const oldEntries = await invoke<any[]>('list_directory', { path: oldPath });
            const mappingFiles = oldEntries.filter(e => !e.is_dir && e.name.endsWith('.json'));

            for (const entry of mappingFiles) {
                const content = await invoke<string>('read_file', { path: entry.path });
                await invoke('save_file', { path: `${newPath}/${entry.name}`, content, append: false });
            }

            feedback.toast.success(t('mapper.migration.success'));
            await loadSavedMaps();
        } catch (e) {
            console.error("Migration failed", e);
            feedback.toast.error(t('mapper.migration.error'));
        } finally {
            setIsMigrating(false);
            setShowMigrationModal(false);
            setMigrationData(null);
        }
    };

    useEffect(() => {
        const currentMappingsPath = settings.paths?.mappings;
        if (!currentMappingsPath) return;

        if (prevMappingsPathRef.current && prevMappingsPathRef.current !== currentMappingsPath) {
            handleMappingsPathChange(prevMappingsPathRef.current, currentMappingsPath);
        }

        prevMappingsPathRef.current = currentMappingsPath;
    }, [settings.paths?.mappings]);

    // reset current element when selection changes
    useEffect(() => {
        if (selectedNode) {
            // Check if already mapped
            const existing = mappedElements.find(e => e.id === generateXPath(selectedNode));
            if (existing) {
                setCurrentElement(existing);
            } else {
                setCurrentElement({
                    id: generateXPath(selectedNode),
                    type: 'button', // Default
                    name: '',
                    text: selectedNode.attributes['text'],
                    android_id: selectedNode.attributes['resource-id'],
                    accessibility_id: selectedNode.attributes['content-desc']
                });
            }
        } else {
            setCurrentElement({});
        }
        // Reset AI Suggestion when selection changes
        setShowAISuggestion(false);
        setAiSuggestedName(null);
        setAiJustification(null);
        setAiError(null);
    }, [selectedNode, mappedElements]);

    // Helper to update current element state and auto-update mapping
    const updateElement = (key: keyof UIElementMap, value: any) => {
        setCurrentElement(prev => {
            const next = { ...prev, [key]: value } as UIElementMap;

            // Auto-update mappedElements list if this element has a name and ID
            if (next.name && next.id) {
                setMappedElements(list => {
                    const idx = list.findIndex(e => e.id === next.id);
                    if (idx >= 0) {
                        const updated = [...list];
                        updated[idx] = next;
                        return updated;
                    }
                    return [...list, next];
                });
            }
            return next;
        });
    };

    const removeElementMapping = (id?: string) => {
        const targetId = id || currentElement.id;
        if (!targetId) return;

        setMappedElements(prev => prev.filter(e => e.id !== targetId));

        // If deleting current element, clear fields
        if (targetId === currentElement.id) {
            setCurrentElement({});
            setSelectedNode(null);
        }

        feedback.toast.success(t('mapper.feedback.removed'));
    };

    // Auto-save logic
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!screenName) return;

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = setTimeout(async () => {
            setIsSaving(true);
            const screenId = sanitizeId(screenName);

            // Fetch from latest source (disk) to avoid overwriting newer data (like layout)
            // from other components/tabs
            let existingMap: ScreenMap | null = null;
            try {
                existingMap = await loadScreenMap(activeProfileId, screenId, settings.paths?.mappings);
            } catch (e) {
                // Map doesn't exist yet, which is fine
            }

            const map: ScreenMap = {
                id: screenId,
                name: screenName,
                type: screenType,
                description: screenDescription || undefined,
                tags: screenTags.length > 0 ? screenTags : undefined,
                elements: mappedElements,
                base64_preview: screenshot || undefined,
                layout: existingMap?.layout
            };
            try {
                await saveScreenMap(activeProfileId, map, settings.paths?.mappings);
                // Refresh list
                loadSavedMaps();
            } catch (e) {
                console.error("Auto-save failed", e);
            } finally {
                setIsSaving(false);
            }
        }, 1000);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [screenName, screenType, screenDescription, screenTags, mappedElements, screenshot, activeProfileId]);


    const handleLoadScreen = (map: ScreenMap) => {
        setScreenName(map.name);
        setScreenType(map.type);
        setScreenDescription(map.description || "");
        setScreenTags(map.tags || []);
        setMappedElements(map.elements);
        if (map.base64_preview) {
            setScreenshot(map.base64_preview);
        }
        setShowLoadMenu(false);
        feedback.toast.success(t('mapper.feedback.loaded'));
    };

    const handleDeleteScreen = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setScreenToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDeleteScreen = async () => {
        if (screenToDelete) {
            await deleteScreenMap(activeProfileId, screenToDelete, settings.paths?.mappings);
            loadSavedMaps();
            feedback.toast.success(t('mapper.feedback.deleted'));
            setScreenToDelete(null);
            setIsDeleteModalOpen(false);

            // If deleting current screen, reset
            if (savedMaps.find(m => m.id === screenToDelete)?.name === screenName) {
                setScreenName('');
                setScreenType('screen');
                setScreenTags([]);
                setMappedElements([]);
            }
        }
    };


    const handleExport = async () => {
        try {
            const data = await exportMapperData(activeProfileId, settings.paths?.mappings);
            const path = await save({
                filters: [{ name: 'Robot Runner Flow', extensions: ['json'] }],
                defaultPath: `flowchart_export_${new Date().toISOString().split('T')[0]}.json`
            });

            if (path) {
                await invoke('save_file', { path, content: data, append: false });
                feedback.toast.success(t('mapper.flowchart.export_success'));
            }
        } catch (e) {
            console.error(e);
            feedback.toast.error(t('mapper.flowchart.export_error'));
        }
    };

    const handleImport = async () => {
        try {
            const path = await open({
                filters: [{ name: 'Robot Runner Flow', extensions: ['json'] }],
                multiple: false
            });

            if (path && typeof path === 'string') {
                const content = await invoke<string>('read_file', { path });
                await importMapperData(activeProfileId, content, settings.paths?.mappings);
                feedback.toast.success(t('mapper.flowchart.import_success'));
                loadSavedMaps(); // Refresh list
            }
        } catch (e) {
            console.error(e);
            feedback.toast.error(t('mapper.flowchart.import_error'));
        }
    };

    const handleAISuggestName = async (_e: any, customPrompt?: string) => {
        if (!selectedNode || !activeProfileId) return;

        const { aiProvider, geminiApiKey, claudeApiKey, openaiApiKey, geminiModel, claudeModel, openaiModel, language } = settings;
        const apiKey = aiProvider === 'gemini' ? geminiApiKey : aiProvider === 'claude' ? claudeApiKey : openaiApiKey;
        const model = aiProvider === 'gemini' ? geminiModel : aiProvider === 'claude' ? claudeModel : openaiModel;

        if (!apiKey && aiProvider !== 'claude-code' && aiProvider !== 'antigravity-cli') {
            feedback.toast.error(t('dashboard.generator.key_required', { provider: aiProvider.toUpperCase() }));
            return;
        }

        setIsAISuggesting(true);
        setShowAISuggestion(true);
        setAiSuggestedName(null);
        setAiJustification(null);
        setAiError(null);

        try {
            let result: { name: string; justification: string } | null = null;
            const lang = language || i18n.language || 'en';

            // OPTIMIZATION 1: Filter only CRITICAL attributes to save tokens
            const criticalAttrs = {
                text: selectedNode.attributes.text || selectedNode.attributes.label || "",
                resourceId: selectedNode.attributes['resource-id'] || selectedNode.attributes.id || "",
                class: selectedNode.attributes.class || selectedNode.attributes.type || "",
                contentDesc: selectedNode.attributes['content-desc'] || "",
                hint: selectedNode.attributes.hint || "",
                path: selectedNode.attributes.path || ""
            };

            // OPTIMIZATION 2: DRASTIC context reduction
            // Only send full elements for the CURRENT screen, and just names for other screens
            const optimizedMaps = savedMaps.map(m => {
                const isCurrentScreen = m.name === screenName;
                return {
                    name: m.name,
                    type: m.type,
                    elements: isCurrentScreen
                        ? m.elements.map(e => ({ name: e.name, type: e.type }))
                        : [] // Don't send elements of other screens to save hundreds of tokens
                };
            }).slice(-10); // Limit to last 10 screens

            // console.log(`[AI Debug] Prompt Context Size: ~${JSON.stringify(criticalAttrs).length + JSON.stringify(optimizedMaps).length} chars`);

            // Attempt AI call with one retry on JSON parse or network failure
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    if (aiProvider === 'gemini') {
                        result = await gemini.suggestElementName(criticalAttrs as any, screenName, apiKey!, model, lang, optimizedMaps as any, undefined, customPrompt);
                    } else if (aiProvider === 'openai') {
                        result = await openai.suggestElementName(criticalAttrs as any, screenName, apiKey!, model, lang, optimizedMaps as any, undefined, customPrompt);
                    } else if (aiProvider === 'claude') {
                        result = await claude.suggestElementName(criticalAttrs as any, screenName, apiKey!, model, lang, optimizedMaps as any, undefined, customPrompt);
                    } else if (aiProvider === 'claude-code') {
                        result = await claudeCli.suggestElementName(criticalAttrs as any, screenName, settings.paths.automationRoot || '', lang, optimizedMaps as any, customPrompt, settings.claudeCodeToken, screenshot || undefined);
                    } else if (aiProvider === 'antigravity-cli') {
                        const { suggestElementName } = await import('@/lib/dashboard/antigravityCode');
                        result = await suggestElementName(criticalAttrs as any, screenName, settings.paths.automationRoot || '', lang, optimizedMaps as any, customPrompt, settings.antigravityApiKey, screenshot || undefined);
                    }

                    if (result && result.name) {
                        setAiSuggestedName(result.name);
                        setAiJustification(result.justification);
                        feedback.toast.success(t('mapper.feedback.ai_success'));
                        break; // Success, exit retry loop
                    } else {
                        throw new Error("Empty suggestion or invalid format returned by AI");
                    }
                } catch (e: any) {
                    if (attempt === 1) {
                        throw e; // Rethrow on the last attempt
                    }
                    console.warn(`AI Suggestion attempt ${attempt + 1} failed, retrying...`, e);
                }
            }
        } catch (error: any) {
            console.error("AI Suggestion Error:", error);
            setAiError(error.message || String(error));
            feedback.toast.error(t('mapper.feedback.ai_error'));
            setAiSuggestedName(null);
        } finally {
            setIsAISuggesting(false);
        }
    };

    const handleAISuggestTags = async (_e: any, customPrompt?: string) => {
        if (!activeProfileId) return;

        const { aiProvider, geminiApiKey, claudeApiKey, openaiApiKey, geminiModel, claudeModel, openaiModel, language } = settings;
        const apiKey = aiProvider === 'gemini' ? geminiApiKey : aiProvider === 'claude' ? claudeApiKey : openaiApiKey;
        const model = aiProvider === 'gemini' ? geminiModel : aiProvider === 'claude' ? claudeModel : openaiModel;

        if (!apiKey && aiProvider !== 'claude-code' && aiProvider !== 'antigravity-cli') {
            feedback.toast.error(t('dashboard.generator.key_required', { provider: aiProvider.toUpperCase() }));
            return;
        }

        setIsAISuggestingTags(true);
        try {
            const lang = language || i18n.language || 'en';
            let tags: string[] = [];

            // Use mapped elements for context
            const elementsContext = mappedElements.map(el => ({ name: el.name, type: el.type }));

            // Attempt AI call with one retry
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    if (aiProvider === 'gemini') {
                        tags = await gemini.suggestScreenTags(screenName || "Current Screen", elementsContext, apiKey!, model, lang, screenshot || undefined, undefined, customPrompt);
                    } else if (aiProvider === 'openai') {
                        tags = await openai.suggestScreenTags(screenName || "Current Screen", elementsContext, apiKey!, model, lang, screenshot || undefined, undefined, customPrompt);
                    } else if (aiProvider === 'claude') {
                        tags = await claude.suggestScreenTags(screenName || "Current Screen", elementsContext, apiKey!, model, lang, screenshot || undefined, undefined, customPrompt);
                    } else if (aiProvider === 'claude-code') {
                        tags = await claudeCli.suggestScreenTags(screenName || "Current Screen", elementsContext, settings.paths.automationRoot || '', lang, customPrompt, settings.claudeCodeToken, screenshot || undefined);
                    } else if (aiProvider === 'antigravity-cli') {
                        const { suggestScreenTags } = await import('@/lib/dashboard/antigravityCode');
                        tags = await suggestScreenTags(screenName || "Current Screen", elementsContext, settings.paths.automationRoot || '', lang, customPrompt, settings.antigravityApiKey, screenshot || undefined);
                    }

                    if (tags && Array.isArray(tags)) {
                        break; // Success, exit retry loop
                    } else {
                        throw new Error("Invalid format returned by AI for screen tags");
                    }
                } catch (e: any) {
                    if (attempt === 1) {
                        throw e; // Rethrow on the last attempt
                    }
                    console.warn(`AI Tags Suggestion attempt ${attempt + 1} failed, retrying...`, e);
                }
            }

            if (tags && Array.isArray(tags) && tags.length > 0) {
                // Merge with existing tags, ensuring uniqueness and checking if anything changed
                const existingTagsSet = new Set(screenTags);
                const trulyNewTags = tags.filter(tag => tag && !existingTagsSet.has(tag));

                if (trulyNewTags.length > 0) {
                    setScreenTags(prev => [...new Set([...prev, ...trulyNewTags])]);
                    feedback.toast.success(t('mapper.feedback.ai_success'));
                } else {
                    feedback.toast.raw.info(t('mapper.feedback.ai_no_new_tags', 'No new tags found'));
                }
            } else if (tags && Array.isArray(tags)) {
                feedback.toast.raw.info(t('mapper.feedback.ai_no_tags', 'No tags suggested for this screen'));
            }
        } catch (error) {
            console.error("AI Tag Suggestion Error:", error);
            feedback.toast.error(t('mapper.feedback.ai_error'));
        } finally {
            setIsAISuggestingTags(false);
        }
    };

    // --- Autonomous Exploration Logic ---

    const stopExploration = async (reason?: string) => {
        if (explorationTimeoutRef.current) {
            clearTimeout(explorationTimeoutRef.current);
            explorationTimeoutRef.current = null;
        }
        setIsExploring(false);
        isExploringRef.current = false;

        let explorerInstance = explorerRef.current;
        if (explorerInstance) {
            explorerInstance.addLog(t('mapper.exploration.stopped', { reason }), "stopped");
            setExplorationLogs([...explorerInstance.getLogs()]);
        }

        // Trigger cleanup to merge Screen_[hash] into actual screens
        // CRITICAL FIX: Fetch latest maps from disk so we don't use stale React state closure
        const currentDiskMaps = await loadSavedMaps();
        const finalMaps = await cleanupAndMergeScreens(currentDiskMaps);

        // Start Enhancement Phase
        setIsEnhancing(true);
        enhanceAbortControllerRef.current = new AbortController();
        if (explorerInstance) {
            explorerInstance.addLog(t('mapper.enhancer.title', 'AI Enhancement'), "info");
            setExplorationLogs([...explorerInstance.getLogs()]);
        }

        try {
            const keys = {
                gemini: settings.geminiApiKey,
                claude: settings.claudeApiKey,
                openai: settings.openaiApiKey,
                antigravity: settings.antigravityApiKey
            };

            const provider = settings.aiProvider || 'gemini';

            const { enhancedMaps } = await processAndEnhanceMaps(
                finalMaps,
                provider,
                keys,
                (msg: string) => {
                    if (explorerInstance) {
                        explorerInstance.addLog(msg, "info");
                        setExplorationLogs([...explorerInstance.getLogs()]);
                    }
                },
                enhanceAbortControllerRef.current.signal,
                (k: string, d: string, opts?: any) => t(k, d, opts) as string
            );

            // Save the enhanced maps
            for (const map of enhancedMaps) {
                await saveScreenMap(activeProfileId, map, settings.paths?.mappings);
            }
            const veryFinalMaps = await loadSavedMaps();
            if (explorerInstance) {
                explorerInstance.addLog(explorerInstance.getGraphSummaryLog(veryFinalMaps, t('mapper.exploration.summary_final', 'Resumo Final do Grafo (Fim da Exploração)')), 'info');
                explorerInstance.addLog(t('mapper.enhancer.completed'), "finished");
                setExplorationLogs([...explorerInstance.getLogs()]);
            }
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === 'Cancelled by user') {
                if (explorerInstance) {
                    explorerInstance.addLog(t('mapper.exploration.cancelled'), "warning");
                    setExplorationLogs([...explorerInstance.getLogs()]);
                }
            } else {
                if (explorerInstance) {
                    explorerInstance.addLog(`Enhancement Error: ${err.message}`, "error");
                    setExplorationLogs([...explorerInstance.getLogs()]);
                }
            }
        } finally {
            setIsEnhancing(false);
            if (explorerInstance) {
                // Ensure the logs trigger a re-render
                setExplorationLogs([...explorerInstance.getLogs()]);
            }
            explorerRef.current = null;
        }
    };

    const runExplorationStep = async () => {
        if (!isExploringRef.current || !selectedDevice || !explorerRef.current) return;

        const explorer = explorerRef.current;
        explorer.incrementStep();

        // Removed max steps check to allow indefinite exploration

        try {
            explorer.addLog(t('mapper.exploration.step_marker', { step: explorer.getState().currentStep }), 'step', explorer.getState().currentStep);

            // App Recovery Logic
            let currentPkg = "";
            try {
                const pkg = await invoke<string>('get_focused_package', { device: selectedDevice });
                currentPkg = pkg ? pkg.trim() : "";
            } catch (pkgError) {
                console.warn("Failed to detect focused package:", pkgError);
                if (explorer.getState().currentStep === 1) {
                    explorer.addLog("Warning: Could not detect focused package on this device. App recovery logic will be bypassed.", "warning");
                }
            }

            if (!isExploringRef.current) return;

            const config = explorer.getConfig();
            let targetPkg = config.targetPackage || explorer.getTargetPackage();

            if (explorer.getState().currentStep === 1 && !targetPkg && currentPkg) {
                targetPkg = currentPkg;
                explorer.setTargetPackage(targetPkg);
            }

            const isTarget = currentPkg === targetPkg;
            const isAllowed = config.allowedPackages?.includes(currentPkg);

            if (targetPkg && currentPkg && !isTarget && !isAllowed) {
                if (lastActionRef.current === 'back') {
                    explorer.addLog(`[Guard] Fora do escopo após 'voltar'. Iniciando app alvo...`, 'warning');
                    await invoke('launch_package', { device: selectedDevice, package: targetPkg });
                } else {
                    explorer.addLog(`[Guard] Fora do escopo após ação. Matando app intruso (${currentPkg})...`, 'warning');
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'am', 'force-stop', currentPkg] });
                }
                lastActionRef.current = 'guard_recovery';
                
                if (!isExploringRef.current) return;
                // Wait a bit for the system to recover
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                setExplorationLogs([...explorer.getLogs()]);
                explorationTimeoutRef.current = setTimeout(runExplorationStep, 1500);
                return;
            }

            setExplorationLogs([...explorer.getLogs()]);

            // 1. Capture Current State
            explorer.addLog(t('mapper.exploration.capturing_screen'), 'transition');
            setExplorationLogs([...explorer.getLogs()]);
            // Re-fetch using refreshAll logic isn't ideal here due to async nature,
            // but we can reuse the logic in the explorer
            const xml = await invoke<string>('get_xml_dump', { deviceId: selectedDevice });

            let screenshot: string | undefined = undefined;
            try {
                const freshScreenshotBase64 = await invoke<string>('get_compressed_screenshot', { deviceId: selectedDevice, maxWidth: 1024, maxHeight: 1024 });
                if (freshScreenshotBase64) {
                    const prefix = 'data:image/jpeg;base64,';
                    const fullScreenshot = freshScreenshotBase64.startsWith('data:') ? freshScreenshotBase64 : `${prefix}${freshScreenshotBase64}`;
                    setScreenshot(fullScreenshot);
                    screenshot = fullScreenshot;
                }
            } catch (screenshotError) {
                console.warn("Screenshot capture failed, proceeding with XML only:", screenshotError);
                if (explorer.getState().currentStep === 1) {
                    explorer.addLog("Warning: Screenshot capture failed (secured screen or OS restrictions). Proceeding with XML layout only.", "warning");
                }
            }
            if (!isExploringRef.current) return;

            // 2. Prepare Context (Backend-powered)
            explorer.addLog(t('mapper.exploration.preparing_context'), 'transition');
            setExplorationLogs([...explorer.getLogs()]);

            const contextResponse = await getAiContext('exploration', {
                current_xml: xml,
                automation_root: settings.paths?.automationRoot
            });

            if (!isExploringRef.current) return;

            const simplifiedXml = contextResponse.context;
            const shortIdMap = contextResponse.metadata.short_id_map as Record<string, string>;

            // Parse for local UI update (Simplified version for visibility)
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", textNodeName: "_text" });
            const jsonObj = parser.parse(xml);
            const root = jsonObj.hierarchy ? transformXmlToTree(jsonObj.hierarchy, undefined, 'hierarchy') : transformXmlToTree(jsonObj);
            setRootNode(root);

            // 2. AI Analysis
            const { aiProvider, geminiApiKey, claudeApiKey, openaiApiKey, geminiModel, claudeModel, openaiModel, language } = settings;
            const apiKey = aiProvider === 'gemini' ? geminiApiKey : aiProvider === 'claude' ? claudeApiKey : openaiApiKey === 'openai' ? openaiApiKey : 'CLI';
            const model = aiProvider === 'gemini' ? geminiModel : aiProvider === 'claude' ? claudeModel : openaiModel === 'openai' ? openaiModel : 'claude-code';
            const lang = language || i18n.language || 'en';

            if (!apiKey && aiProvider !== 'claude-code' && aiProvider !== 'antigravity-cli') throw new Error("API Key missing");

            explorer.addLog(t('mapper.exploration.analyzing_screen', { provider: aiProvider }), 'ai');
            setExplorationLogs([...explorer.getLogs()]);

            let maps = await loadSavedMaps();
            if (!isExploringRef.current) return;

            // OPTIMIZATION 2: Context reduction for exploration maps
            const optimizedExplorationMaps = maps.map(m => ({
                name: m.name,
                type: m.type,
                description: m.description,
                elements: m.elements.map(e => ({ name: e.name, type: e.type, navigates_to: e.navigates_to }))
            })).slice(-15); // Limit to last 15 screens to provide enough context without blowing up prompt size

            let result: any = null;
            let useAiFallback = false;

            const heuristicScreenTemp = explorer.generateHeuristicScreenMap(root);
            console.log(`[DEBUG] Heuristic Screen Generated: ${heuristicScreenTemp.name}`, heuristicScreenTemp.elements.map(e => e.id));

            const previousNav = explorer.getPreviousNavigation();
            // Swipe Screen Merging logic: if the previous action was a swipe, force the generated heuristic
            // screen to use the exact same name as the previous screen, so elements get appended naturally.
            if (previousNav && previousNav.actionType === 'swipe' && previousNav.screenName) {
                heuristicScreenTemp.name = previousNav.screenName;
                heuristicScreenTemp.id = sanitizeId(previousNav.screenName);
            } else if (heuristicScreenTemp.elements.length > 0) {
                // Similarity-based Screen Merging
                let bestMatch: { name: string, id: string, score: number } | null = null;
                const currentIds = new Set(heuristicScreenTemp.elements.map(e => e.id));
                const currentShortIds = new Set(heuristicScreenTemp.elements.map(e => (e as any).shortId).filter(Boolean));

                for (const existingMap of maps) {
                    const existingIds = new Set(existingMap.elements.map(e => e.id));
                    const existingShortIds = new Set(existingMap.elements.map(e => (e as any).shortId).filter(Boolean));
                    
                    let overlapId = 0;
                    currentIds.forEach(id => {
                        if (existingIds.has(id)) overlapId++;
                    });

                    let overlapShortId = 0;
                    currentShortIds.forEach(sid => {
                        if (existingShortIds.has(sid)) overlapShortId++;
                    });

                    // Use the best overlap metric
                    const overlap = Math.max(overlapId, overlapShortId);

                    // Choose the corresponding size denominator
                    const currentSize = overlap === overlapShortId && currentShortIds.size > 0 ? currentShortIds.size : currentIds.size;
                    const existingSize = overlap === overlapShortId && existingShortIds.size > 0 ? existingShortIds.size : existingIds.size;
                    
                    const maxElements = Math.max(currentSize, existingSize);
                    const similarity = maxElements > 0 ? overlap / maxElements : 0;

                    // Threshold of 75% similarity to consider it the same screen
                    if (similarity >= 0.75 && (!bestMatch || similarity > bestMatch.score)) {
                        bestMatch = { name: existingMap.name, id: existingMap.id, score: similarity };
                    }
                }

                if (bestMatch) {
                    explorer.addLog(t('mapper.exploration.similarity_merge', { defaultValue: `Merged into "${bestMatch.name}" (Similarity: ${Math.round(bestMatch.score * 100)}%)` }), 'info');
                    heuristicScreenTemp.name = bestMatch.name;
                    heuristicScreenTemp.id = bestMatch.id;

                    // Annotate the element that caused this minor variation
                    if (previousNav && previousNav.actionType === 'click' && previousNav.targetId) {
                        const existingMap = maps.find(m => m.id === bestMatch!.id);
                        if (existingMap) {
                            const triggerElement = existingMap.elements.find(e => e.id === previousNav.targetId);
                            if (triggerElement) {
                                const annotation = "Toggles UI state/visibility";
                                if (!triggerElement.description?.includes(annotation)) {
                                    triggerElement.description = triggerElement.description
                                        ? `${triggerElement.description} | ${annotation}`
                                        : annotation;
                                }
                            }
                        }
                    }
                }
            }

            // Check if we are looping/stuck or completely blind
            const loopThreshold = Math.max(4, heuristicScreenTemp.elements.length + 1);
            if (heuristicScreenTemp.elements.length === 0) {
                useAiFallback = true;
                explorer.addLog("Heuristic found 0 interactive elements. Falling back to AI immediately to discover complex elements.", "warning");
            } else if (explorer.isScreenLooping(heuristicScreenTemp.name, loopThreshold)) {
                useAiFallback = true;
                explorer.addLog(t('mapper.exploration.heuristic_stuck', { defaultValue: 'Heuristic seems stuck. Falling back to AI for this step.' }), "warning");
            }

            if (!useAiFallback) {
                const prevNavBefore = explorer.getPreviousNavigation();
                const heuristicAction = explorer.determineHeuristicAction(root, heuristicScreenTemp.name, maps);
                
                // CRITICAL FIX: If determineHeuristicAction updated navigates_to in the previous screen, save it!
                if (prevNavBefore && prevNavBefore.screenName) {
                    const prevScreen = maps.find(m => m.name === prevNavBefore.screenName);
                    if (prevScreen) {
                        await saveScreenMap(activeProfileId, prevScreen, settings.paths?.mappings);
                    }
                }

                if (heuristicAction) {
                    // Match AI format
                    result = {
                        screen: heuristicScreenTemp,
                        elements: heuristicScreenTemp.elements.map(e => ({ id: e.id, name: e.name, type: e.type, shortId: (e as any).shortId })),
                        nextAction: heuristicAction,
                        thought: 'Heuristic algorithm picked the next action.',
                        rationale: 'Using code-first DFS algorithm to save tokens.',
                        isHeuristic: true
                    };
                    explorer.addLog("DFS Algorithm generated the next step.", "info");
                    // Minor artificial delay for UX
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    useAiFallback = true;
                }
            }

            if (useAiFallback) {
                // Attempt AI call with one retry on JSON parse failure
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        const customPrompt = explorationPromptRef.current;
                        if (aiProvider === 'gemini') {
                            result = await gemini.exploreScreen(simplifiedXml, screenshot || "", apiKey as string, model, lang, optimizedExplorationMaps as any, explorer.getFormattedLogs(), undefined, customPrompt);
                        } else if (aiProvider === 'openai') {
                            result = await openai.exploreScreen(simplifiedXml, screenshot || "", apiKey as string, model, lang, optimizedExplorationMaps as any, explorer.getFormattedLogs(), undefined, customPrompt);
                        } else if (aiProvider === 'claude') {
                            result = await claude.exploreScreen(simplifiedXml, screenshot || "", apiKey as string, model, lang, optimizedExplorationMaps as any, explorer.getFormattedLogs(), undefined, customPrompt);
                        } else if (aiProvider === 'claude-code') {
                            result = await claudeCli.exploreScreen(simplifiedXml, settings.paths.automationRoot || '', lang, optimizedExplorationMaps as any, explorer.getFormattedLogs(), customPrompt, settings.claudeCodeToken, explorer.getSessionId(), screenshot || undefined);
                            if (result.session_id) {
                                explorer.setSessionId(result.session_id);
                            }
                        } else if (aiProvider === 'antigravity-cli') {
                            const { exploreScreen } = await import('@/lib/dashboard/antigravityCode');
                            result = await exploreScreen(simplifiedXml, settings.paths.automationRoot || '', lang, optimizedExplorationMaps as any, explorer.getFormattedLogs(), customPrompt, settings.antigravityApiKey, explorer.getSessionId(), screenshot || undefined);
                            if (result.session_id) {
                                explorer.setSessionId(result.session_id);
                            }
                        }
                        break; // Success
                    } catch (parseError: any) {
                        if (attempt === 0 && parseError.message?.includes('JSON')) {
                            explorer.addLog(t('mapper.exploration.malformed_json_retry', { error: parseError.message.substring(0, 80) }), 'error');
                            setExplorationLogs([...explorer.getLogs()]);
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            if (!isExploringRef.current) return;
                            continue;
                        }
                        throw parseError;
                    }
                }
            }

            if (!isExploringRef.current) return;
            if (!result) throw new Error("AI returned no exploration result");

            // 3. Auto-Mapping
            const aiScreen = result.screen || { name: 'Unknown Screen', type: 'screen', elements: [] };
            // Use the shortIdMap from the backend to map context back to XPaths
            const aiElements = (result.elements || []).map((el: any) => {
                const xpath = shortIdMap[el.id] || el.id;
                return {
                    ...el,
                    id: xpath,
                    shortId: el.id
                };
            });

            aiScreen.elements = aiElements;

            explorer.addLog(t('mapper.exploration.ai_mapped_summary', { name: aiScreen.name, type: aiScreen.type, count: aiElements.length }), 'info');
            if (result.thought) {
                explorer.addThought(result.thought);
            }
            explorer.addLog(result.rationale, 'rationale');

            if (explorer.getState().currentStep === 1 && aiScreen.name) {
                explorer.setInitialScreenName(aiScreen.name);
            }

            // Step 3: Back-update previous screen's element with navigates_to
            const prevNav = explorer.getPreviousNavigation();
            if (prevNav && prevNav.targetId && prevNav.actionType === 'click' && aiScreen.name && aiScreen.name !== prevNav.screenName) {
                const prevMap = maps.find(m => m.name === prevNav.screenName);
                if (prevMap) {
                    // prevNav.targetId is the XPath of the clicked element
                    let updated = false;

                    const updatedElements = prevMap.elements.map(el => {
                        if (prevNav.targetId && (el.id === prevNav.targetId || (el as any).shortId === prevNav.targetId || el.id === shortIdMap[prevNav.targetId])) {
                            // Only update if navigates_to is not already set to this destination
                            const existingDest = typeof el.navigates_to === 'string'
                                ? el.navigates_to
                                : Array.isArray(el.navigates_to)
                                    ? el.navigates_to.map(n => n.destination).join(',')
                                    : (el.navigates_to as any)?.destination;

                            if (!existingDest?.includes(aiScreen.name)) {
                                updated = true;
                                return { ...el, navigates_to: { destination: aiScreen.name } };
                            }
                        }
                        return el;
                    });

                    if (updated) {
                        const updatedPrevMap = { ...prevMap, elements: updatedElements };
                        await saveScreenMap(activeProfileId, updatedPrevMap, settings.paths?.mappings);
                        explorer.addLog(t('mapper.exploration.back_updated', { prev: prevNav.screenName, current: aiScreen.name }), 'info');
                        // Refresh maps so subsequent logic sees the update
                        maps = await loadSavedMaps();
                    }
                }
            }
            explorer.clearPreviousNavigation();

            let currentMergedMap: ScreenMap | null = null;

            if (aiScreen.name) {
                // Smart Merging: Check for existing map with same name (resilient matching)
                const aiNameNormalized = aiScreen.name.trim().toLowerCase();
                const existingMap = maps.find(m =>
                    m.name.trim().toLowerCase() === aiNameNormalized ||
                    m.id === aiNameNormalized.replace(/\s+/g, '_')
                );
                let mergedDescription = "";
                let mergedElements: UIElementMap[] = [];
                let resolvedLayout = existingMap?.layout;

                // Helper for smart description merging (prevents "A | A B" bloat)
                if (existingMap) {
                    explorer.addLog(t('mapper.exploration.merging_insights', { name: existingMap.name, id: existingMap.id, count: existingMap.elements.length }), 'info');

                    // 1. Merge Screen Metadata - Replacement Strategy (AI is responsible for incorporating old info)
                    mergedDescription = aiScreen.description || existingMap.description || "";

                    // 2. Deep Merge Elements
                    // Start with existing elements and update them if AI saw them again
                    const aiElementsById = new Map<string, UIElementMap>();
                    const aiElementsByShortId = new Map<string, UIElementMap>();
                    
                    aiElements.forEach((el: UIElementMap) => {
                        aiElementsById.set(el.id, el);
                        if ((el as any).shortId) {
                            aiElementsByShortId.set((el as any).shortId, el);
                        }
                    });

                    // We will keep track of which aiElements were merged so we can find the genuinely new ones
                    const mergedAiIds = new Set<string>();

                    mergedElements = existingMap.elements.map((existingEl: UIElementMap) => {
                        let aiEl = aiElementsById.get(existingEl.id);
                        
                        // Fuzzy Match by ShortId: If exact XPath matching fails (due to volatile text like clock/dates),
                        // try to match by the stable tree position (shortId).
                        if (!aiEl && (existingEl as any).shortId) {
                            const fuzzyEl = aiElementsByShortId.get((existingEl as any).shortId);
                            if (fuzzyEl && fuzzyEl.type === existingEl.type) {
                                aiEl = fuzzyEl;
                            }
                        }

                        if (!aiEl) return existingEl; // AI didn't see it this time, keep as is
                        
                        mergedAiIds.add(aiEl.id);

                        // AI saw it! update description and navigates_to
                        const updatedDesc = aiEl.description || existingEl.description || "";

                        // Merge navigates_to if AI found a new destination
                        let mergedNav = existingEl.navigates_to;
                        if (aiEl.navigates_to && !existingEl.navigates_to) {
                            mergedNav = aiEl.navigates_to;
                        }

                        return {
                            ...existingEl,
                            id: aiEl.id, // Update the ID (XPath) to the newest one (to fix volatile timestamps for Appium)
                            name: aiEl.name || existingEl.name, // Update name in case it changed slightly
                            description: updatedDesc,
                            navigates_to: mergedNav,
                            explored: existingEl.explored || aiEl.explored,
                            shortId: (aiEl as any).shortId || (existingEl as any).shortId
                        };
                    });

                    // 3. Add genuinely new elements
                    const genuinelyNew = aiElements.filter((el: UIElementMap) => !mergedAiIds.has(el.id));

                    if (genuinelyNew.length > 0) {
                        mergedElements = [...mergedElements, ...genuinelyNew];
                        explorer.addLog(t('mapper.exploration.new_elements_discovered', { count: genuinelyNew.length, total: mergedElements.length }), 'info');
                    }
                } else {
                    // New Screen: just use AI results
                    mergedDescription = aiScreen.description || '';
                    mergedElements = aiElements;

                    // Enforce unique layout positions (left-to-right flow)
                    const occupiedPositions = new Set<string>();
                    maps.forEach(m => {
                        if (m.layout?.node) occupiedPositions.add(`${m.layout.node.gridX},${m.layout.node.gridY}`);
                    });

                    if (aiScreen.layout && !occupiedPositions.has(`${aiScreen.layout.gridX},${aiScreen.layout.gridY}`)) {
                        resolvedLayout = { node: aiScreen.layout, edges: {} };
                    } else {
                        // Find nearest unique position (expand right, then down)
                        let gx = aiScreen.layout?.gridX ?? 0;
                        let gy = aiScreen.layout?.gridY ?? 0;
                        while (occupiedPositions.has(`${gx},${gy}`)) {
                            gx++;
                            if (gx > 20) { gx = 0; gy++; }
                        }
                        resolvedLayout = { node: { gridX: gx, gridY: gy }, edges: {} };
                        explorer.addLog(t('mapper.exploration.ai_suggested_layout', { name: aiScreen.name, x: gx, y: gy }), 'info');
                    }
                }

                const map: ScreenMap = {
                    id: existingMap?.id || sanitizeId(aiScreen.name),
                    name: aiScreen.name,
                    // Preserve existing metadata: user or previous AI may have added important context
                    type: existingMap?.type || aiScreen.type || 'screen',
                    description: mergedDescription || undefined,
                    tags: [...new Set([...(existingMap?.tags || []), ...(aiScreen.tags || [])])],
                    elements: mergedElements,
                    base64_preview: screenshot || undefined,
                    layout: resolvedLayout
                };
                currentMergedMap = map;

                await saveScreenMap(activeProfileId, map, settings.paths?.mappings);
                explorer.markScreenVisited(aiScreen.name);

                // Update UI State if it's the current screen we're looking at
                setScreenName(aiScreen.name);
                setScreenType(map.type as any);
                setScreenDescription(map.description || "");
                setScreenTags(map.tags || []);
                setMappedElements(mergedElements);

                if (aiScreen.layout) {
                    const l = aiScreen.layout as any;
                    explorer.addLog(t('mapper.exploration.ai_suggested_layout', { name: aiScreen.name, x: l.gridX, y: l.gridY }), 'info');
                }
            }

            // 4. Loop Detection — force escape if a screen is visited too many times
            if (aiScreen.name) {
                const next = (result.nextAction || { type: 'back' }) as ExplorationAction;
                const actionFingerprint = `${aiScreen.name}:${next.type}:${next.targetId || 'none'}`;
                const visitCount = explorer.trackScreenVisit(aiScreen.name, actionFingerprint);
                const maxAllowedVisits = Math.max(4, (aiScreen.elements?.length || 0) + 1);
                if (visitCount >= maxAllowedVisits) {
                    explorer.addLog(t('mapper.exploration.loop_detected', { name: aiScreen.name, count: visitCount }), 'warning');

                    if (aiScreen.name === explorer.getInitialScreenName()) {
                        explorer.addLog(t('mapper.exploration.cannot_go_back_from_root', { defaultValue: 'Preventing back action on initial screen to avoid app exit.' }), 'info');
                        stopExploration("Finished (Root screen fully explored)");
                        return;
                    }

                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });

                    if (!isExploringRef.current) return;
                    setExplorationLogs([...explorer.getLogs()]);
                    explorationTimeoutRef.current = setTimeout(runExplorationStep, 1500);
                    return;
                }
            }

            // 5. Navigation
            const next = (result.nextAction || { type: 'back' }) as ExplorationAction;
            lastActionRef.current = next.type;
            if (next.type === 'finish') {
                explorer.addLog(t('mapper.exploration.finished'), 'finished');
                stopExploration("Finished");
                return;
            } else if (next.type === 'back') {
                if (aiScreen.name === explorer.getInitialScreenName()) {
                    explorer.addLog(t('mapper.exploration.cannot_go_back_from_root', { defaultValue: 'Preventing back action on initial screen to avoid app exit.' }), 'info');
                    stopExploration("Finished (Root screen fully explored)");
                    return;
                }
                explorer.addLog(t('mapper.exploration.navigating_back'), 'action');
                explorer.resetSwipeCount();
                explorer.clearPreviousNavigation();
                await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });
            } else if (next.type === 'click' && next.targetId) {
                explorer.addLog(t('mapper.exploration.clicking_element', { targetId: next.targetId, details: next.details || 'no details' }), 'action');
                explorer.resetSwipeCount();

                let targetNode: InspectorNode | null = null;
                const xpath = shortIdMap[next.targetId] || next.targetId;

                // CRITICAL: Mark element as visited so DFS doesn't click it again infinitely
                explorer.markElementVisited(xpath);

                // Priority 1: Label-based search
                const aiElement = aiScreen.elements?.find((el: any) => el.shortId === next.targetId || el.id === next.targetId || el.id === xpath);
                
                const targetLabel = aiElement?.name || aiElement?.label;

                if (aiElement && targetLabel) {
                    const matches = findNodesByText(root, targetLabel);
                    const bestMatch = matches.find(m => (m.attributes['clickable'] === 'true' || m.attributes['text'] || m.attributes['content-desc']) && m.bounds && m.bounds.w > 0);
                    if (bestMatch) targetNode = bestMatch;
                }

                // Priority 2: Standard XPath
                if (!targetNode) {
                    const nodes = findNodesByLocator(root, xpath);
                    if (nodes.length > 0) targetNode = nodes[0];
                }

                // Find the ACTUAL full map in the global maps array to save the explored state,
                // otherwise we overwrite the JSON with the incomplete aiScreen and lose historical explored states.
                // CRITICAL FIX: Use the freshly merged map if available, otherwise fallback to finding it in maps
                const activeMap = currentMergedMap || maps.find(m => m.id === aiScreen.id || m.name === aiScreen.name);
                
                if (activeMap) {
                    let activeElement = activeMap.elements.find(e => e.id === xpath || e.id === next.targetId || (e as any).shortId === next.targetId);
                    
                    if (!activeElement && next.targetId) {
                        // The AI didn't map this heuristic element. We MUST add it to the map to persist its explored state between sessions.
                        const finalId = targetNode ? generateXPath(targetNode) : xpath;
                        activeElement = {
                            id: finalId,
                            name: targetNode ? (targetNode.attributes['text'] || targetNode.attributes['content-desc'] || `Element_${finalId.slice(-6)}`) : `Element_${finalId.slice(-6)}`,
                            type: 'button',
                            explored: false,
                        };
                        activeMap.elements.push(activeElement);
                        explorer.addLog(`Heuristic element persisted to map: ${activeElement.name}`, 'info');
                    }

                    if (activeElement && !activeElement.explored) {
                        activeElement.explored = true;
                        // Update in memory too so subsequent steps see it immediately
                        setSavedMaps([...maps]);
                        await saveScreenMap(activeProfileId, activeMap, settings.paths?.mappings);
                    }
                } else if (aiElement && !aiElement.explored) {
                    // Fallback
                    aiElement.explored = true;
                    await saveScreenMap(activeProfileId, aiScreen, settings.paths?.mappings);
                }

                if (targetNode && targetNode.bounds) {
                    const centerX = Math.round(targetNode.bounds.x + targetNode.bounds.w / 2);
                    const centerY = Math.round(targetNode.bounds.y + targetNode.bounds.h / 2);
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'tap', String(centerX), String(centerY)] });
                    const clickedXPath = generateXPath(targetNode);
                    explorer.setPreviousNavigation(aiScreen.name, clickedXPath, 'click');
                } else {
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });
                }
            } else if (next.type === 'swipe') {
                const swipeDirection = next.direction || 'down';
                const currentSwipes = explorer.getConsecutiveSwipes();

                if (currentSwipes >= 10) {
                    explorer.addLog(t('mapper.exploration.swipe_limit_reached'), 'error');
                    explorer.resetSwipeCount();
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });
                } else {
                    explorer.addLog(t('mapper.exploration.swiping_action', { direction: swipeDirection }), 'action');
                    explorer.registerSwipeAction("");

                    let startX = 540;
                    let startY = 1200;
                    let endX = 540;
                    let endY = swipeDirection === 'up' ? 600 : 1800;

                    let scrollableNode: InspectorNode | null = null;

                    if (next.targetId) {
                        const xpath = shortIdMap[next.targetId] || next.targetId;
                        const nodes = findNodesByLocator(root, xpath);
                        scrollableNode = nodes.find(n => n.attributes['scrollable'] === 'true' || n.tagName.includes('ScrollView')) || nodes[0];
                    }

                    if (!scrollableNode) {
                        const findScrollable = (n: InspectorNode): InspectorNode | null => {
                            if (n.attributes['scrollable'] === 'true' || n.tagName.includes('ScrollView')) return n;
                            for (const child of n.children) {
                                const found = findScrollable(child);
                                if (found) return found;
                            }
                            return null;
                        };
                        scrollableNode = findScrollable(root);
                    }

                    if (scrollableNode && scrollableNode.bounds) {
                        const { x, y, w, h } = scrollableNode.bounds;
                        startX = Math.round(x + w / 2);
                        endX = startX;

                        const padding = Math.round(h * 0.15); // 15% padding
                        if (swipeDirection === 'down') { // AI means "Scroll down" = Swipe up (gesture bottom-to-top)
                            startY = Math.round(y + h - padding);
                            endY = Math.round(y + padding);
                        } else if (swipeDirection === 'up') { // AI means "Scroll up" = Swipe down (gesture top-to-bottom)
                            startY = Math.round(y + padding);
                            endY = Math.round(y + h - padding);
                        } else if (swipeDirection === 'left') {
                            startY = Math.round(y + h / 2);
                            endY = startY;
                            startX = Math.round(x + w - padding);
                            endX = Math.round(x + padding);
                        } else if (swipeDirection === 'right') {
                            startY = Math.round(y + h / 2);
                            endY = startY;
                            startX = Math.round(x + padding);
                            endX = Math.round(x + w - padding);
                        }
                    }

                    await invoke('run_adb_command', {
                        device: selectedDevice,
                        args: ['shell', 'input', 'swipe', String(startX), String(startY), String(endX), String(endY), "500"]
                    });
                    explorer.setPreviousNavigation(aiScreen.name, undefined, 'swipe');
                }
            } else if (next.type === 'type_text' && next.targetId && next.text) {
                explorer.addLog(t('mapper.exploration.typing_action', { targetId: next.targetId, text: next.text }), 'action');

                const xpath = shortIdMap[next.targetId] || next.targetId;
                explorer.markElementVisited(xpath);

                let targetNode: InspectorNode | null = null;
                const aiElement = aiScreen.elements?.find((el: any) => el.shortId === next.targetId || el.id === next.targetId || el.id === xpath);
                
                const targetLabel = aiElement?.name || aiElement?.label;

                if (aiElement && targetLabel) {
                    const matches = findNodesByText(root, targetLabel);
                    const bestMatch = matches.find(m => (m.attributes['clickable'] === 'true' || m.attributes['text'] || m.attributes['content-desc'] || m.attributes['class']?.includes('EditText')) && m.bounds && m.bounds.w > 0);
                    if (bestMatch) targetNode = bestMatch;
                }

                if (!targetNode) {
                    const nodes = findNodesByLocator(root, xpath);
                    if (nodes.length > 0) targetNode = nodes[0];
                }

                // CRITICAL FIX: Use the freshly merged map if available, otherwise fallback to finding it in maps
                const activeMap = currentMergedMap || maps.find(m => m.id === aiScreen.id || m.name === aiScreen.name);
                
                if (activeMap) {
                    let activeElement = activeMap.elements.find(e => e.id === xpath || e.id === next.targetId || (e as any).shortId === next.targetId);
                    
                    if (!activeElement && next.targetId) {
                        const finalId = targetNode ? generateXPath(targetNode) : xpath;
                        activeElement = {
                            id: finalId,
                            name: targetNode ? (targetNode.attributes['text'] || targetNode.attributes['content-desc'] || `Element_${finalId.slice(-6)}`) : `Element_${finalId.slice(-6)}`,
                            type: 'input',
                            explored: false,
                        };
                        activeMap.elements.push(activeElement);
                        explorer.addLog(`Heuristic element persisted to map: ${activeElement.name}`, 'info');
                    }

                    if (activeElement && !activeElement.explored) {
                        activeElement.explored = true;
                        setSavedMaps([...maps]);
                        await saveScreenMap(activeProfileId, activeMap, settings.paths?.mappings);
                    }
                } else if (aiElement && !aiElement.explored) {
                    aiElement.explored = true;
                    await saveScreenMap(activeProfileId, aiScreen, settings.paths?.mappings);
                }

                if (targetNode && targetNode.bounds) {
                    // Tap to focus
                    const centerX = Math.round(targetNode.bounds.x + targetNode.bounds.w / 2);
                    const centerY = Math.round(targetNode.bounds.y + targetNode.bounds.h / 2);
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'tap', String(centerX), String(centerY)] });

                    // Small delay to let keyboard appear
                    await new Promise(r => setTimeout(r, 500));

                    // Input text. Replace spaces with %s for adb
                    const escapedText = next.text.replace(/ /g, '%s');
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'text', escapedText] });

                    // Press Enter
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '66'] });

                    const clickedXPath = generateXPath(targetNode);
                    explorer.setPreviousNavigation(aiScreen.name, clickedXPath, 'type_text');
                } else {
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });
                }
            }

            if (!isExploringRef.current) return;
            setExplorationLogs([...explorer.getLogs()]);
            explorationTimeoutRef.current = setTimeout(runExplorationStep, 3000);

        } catch (error: any) {
            console.error("Exploration error:", error);
            const reason = error instanceof Error
                ? error.message
                : (typeof error === 'object' && error !== null && 'message' in error)
                    ? String(error.message)
                    : String(error);
            stopExploration(`Error: ${reason}`);
        }
    };

    const cleanupAndMergeScreens = async (currentMaps: ScreenMap[]) => {
        // Iterate and try to merge temporary Screen_[hash] into AI named screens
        const finalMaps = [...currentMaps];
        let mergedAny = false;

        for (let i = finalMaps.length - 1; i >= 0; i--) {
            const screen = finalMaps[i];
            if (screen.name.startsWith('Screen_')) {
                // Find a potential AI screen that shares a high percentage of elements
                const hashElementIds = new Set(screen.elements.map(e => e.id));

                for (const potentialAiScreen of finalMaps) {
                    if (potentialAiScreen.name.startsWith('Screen_') || potentialAiScreen.id === screen.id) continue;

                    const aiElementIds = new Set(potentialAiScreen.elements.map(e => e.id));
                    let overlap = 0;
                    hashElementIds.forEach(id => {
                        if (aiElementIds.has(id)) overlap++;
                    });

                    // If >= 30% of the hash screen elements exist in the AI screen, assume they are the same
                    if (overlap > 0 && overlap / hashElementIds.size >= 0.3) {
                        // Merge elements
                        const newElements = screen.elements.filter(e => !aiElementIds.has(e.id));
                        
                        // Merge explored state for overlapping elements to prevent data loss
                        for (const oldEl of screen.elements) {
                            if (aiElementIds.has(oldEl.id)) {
                                const targetAiEl = potentialAiScreen.elements.find(e => e.id === oldEl.id);
                                if (targetAiEl) {
                                    if (oldEl.explored) targetAiEl.explored = true;
                                    if (oldEl.navigates_to && !targetAiEl.navigates_to) targetAiEl.navigates_to = oldEl.navigates_to;
                                }
                            }
                        }

                        potentialAiScreen.elements = [...potentialAiScreen.elements, ...newElements];

                        // CRITICAL FIX: Update dangling navigates_to pointers in ALL screens!
                        // If any element points to the temporary screen that we are about to delete,
                        // redirect it to the AI screen we just merged into.
                        for (const otherScreen of finalMaps) {
                            let updatedOther = false;
                            for (const el of otherScreen.elements) {
                                if (el.navigates_to === screen.name || el.navigates_to === screen.id) {
                                    el.navigates_to = potentialAiScreen.name;
                                    updatedOther = true;
                                } else if (typeof el.navigates_to === 'string' && (el.navigates_to.includes(screen.name) || el.navigates_to.includes(screen.id))) {
                                    // Handle comma separated navigates_to just in case
                                    el.navigates_to = el.navigates_to
                                        .split(',')
                                        .map((t: string) => (t.trim() === screen.name || t.trim() === screen.id) ? potentialAiScreen.name : t.trim())
                                        .join(', ');
                                    updatedOther = true;
                                }
                            }
                            // Save the other screen if we modified it
                            if (updatedOther && otherScreen.id !== potentialAiScreen.id && otherScreen.id !== screen.id) {
                                await saveScreenMap(activeProfileId, otherScreen, settings.paths?.mappings);
                            }
                        }

                        await saveScreenMap(activeProfileId, potentialAiScreen, settings.paths?.mappings);
                        await deleteScreenMap(activeProfileId, screen.id, settings.paths?.mappings);

                        // Delete the hash screen from local copy
                        finalMaps.splice(i, 1);
                        mergedAny = true;

                        explorerRef.current?.addLog(`Merged temporary screen "${screen.name}" into AI screen "${potentialAiScreen.name}"`, "info");
                        break;
                    }
                }
            }
        }

        if (mergedAny) {
            await loadSavedMaps();
        }
        return finalMaps;
    };

    const startExploration = async (config: ExplorationConfig, customPrompt: string, useAi: boolean) => {
        setIsExplorationModalOpen(false);
        if (!selectedDevice) return;

        setExplorationLogs([{
            text: "Parsing configuration and heuristics...",
            type: "info",
            timestamp: new Date().toLocaleTimeString(),
            stepNumber: 0
        }]);

        const engineConfig = await analyzeExplorationPrompt(config, customPrompt, useAi, settings);

        // CRITICAL FIX: Fetch latest maps from disk to avoid stale React state
        const currentDiskMaps = await loadSavedMaps();

        explorerRef.current = new AutonomousExplorer(t, 9999, engineConfig, currentDiskMaps);
        explorationPromptRef.current = customPrompt;

        explorerRef.current.addLog(explorerRef.current.getGraphSummaryLog(currentDiskMaps, t('mapper.exploration.summary_initial', 'Resumo Inicial do Grafo')), 'info');
        setExplorationLogs([...explorerRef.current.getLogs()]);

        lastActionRef.current = 'start';
        if (config.targetPackage) {
            try {
                await invoke('launch_package', { device: selectedDevice, package: config.targetPackage });
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e) {
                console.error("Failed to launch target package on start", e);
            }
        }

        setIsExploring(true);
        isExploringRef.current = true;
    };

    useEffect(() => {
        if (isExploring && explorerRef.current && explorerRef.current.getState().currentStep === 0) {
            runExplorationStep();
        }
    }, [isExploring]);

    const handleSaveExplorationLogs = async () => {
        if (explorationLogs.length === 0) return;
        try {
            const content = JSON.stringify(explorationLogs, null, 2);
            const path = await save({
                filters: [{ name: 'JSON Logs', extensions: ['json'] }],
                defaultPath: `exploration_logs_${new Date().toISOString().split('T')[0]}.json`
            });

            if (path) {
                await invoke('save_file', { path, content, append: false });
                feedback.toast.success(t('mapper.feedback.saved'));
            }
        } catch (e) {
            console.error(e);
            feedback.toast.error(t('mapper.error.save_failed', { defaultValue: 'Failed to save logs' }));
        }
    };


    const handleExportPOM = async () => {
        if (!screenName || mappedElements.length === 0) {
            feedback.toast.error(t('mapper.error.empty_map'));
            return;
        }
        const { generateRobotResource } = await import('@/lib/dashboard/pomGenerator');
        const content = generateRobotResource({
            id: sanitizeId(screenName),
            name: screenName,
            type: screenType,
            elements: mappedElements
        });

        const path = await save({
            filters: [{ name: 'Robot Framework Resource', extensions: ['robot'] }],
            defaultPath: `${sanitizeId(screenName)}.robot`
        });

        if (path) {
            await invoke('save_file', { path, content, append: false });
            feedback.toast.success(t('mapper.feedback.saved'));
        }
    };

    const handleExportProjectPOM = async () => {
        if (savedMaps.length === 0) {
            feedback.toast.error(t('mapper.feedback.empty_map'));
            return;
        }
        const { generateProjectRobotResources } = await import('@/lib/dashboard/pomGenerator');
        const resources = generateProjectRobotResources(savedMaps);
        const dir = await open({ directory: true, multiple: false });

        if (dir && typeof dir === 'string') {
            for (const [fileName, content] of Object.entries(resources)) {
                const path = `${dir}/${fileName}`;
                await invoke('save_file', { path, content, append: false });
            }
            feedback.toast.success(t('mapper.feedback.saved'));
        }
    };

    const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < 900);
            }
        });
        observer.observe(containerRef);
        return () => observer.disconnect();
    }, [containerRef]);

    const [copied, setCopied] = useState<string | null>(null);

    const copyToClipboard = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };
    const hasElementFocus = !!selectedNode || !!currentElement.id;

    return (
        <div ref={setContainerRef} className="flex-1 min-h-[700px] flex flex-col space-y-4">
            {!selectedDevice && is_test_mode !== 'web' ? (
                <div className="h-full flex-1 flex flex-col items-center justify-center text-on-surface/80">
                    <Scan size={48} className="mb-4 opacity-20" />
                    <p>{t('mapper.empty')}</p>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                            loadSavedMaps();
                            setIsFlowchartOpen(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-transparent border border-primary text-primary hover:bg-primary/90 hover:text-surface rounded-2xl transition-colors shadow-sm text-sm font-medium"
                        title={t('mapper.flowchart.open', 'Open Flowchart')}
                    >
                        <GitGraph size={16} />
                        <span className={clsx(isNarrow && "hidden")}>{t('mapper.flowchart.open')}</span>
                    </Button>
                </div>
            ) : (
                <>
                    {/* Toolbar */}
                    <Section
                        title={t('mapper.title')}
                        icon={Scan}
                        variant="transparent"
                        className="p-0"
                        status={
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 4')} className="p-1.5 hover:bg-surface-variant/30 rounded text-on-surface-variant/80" title={t('mapper.nav.back')}><ArrowLeft size={16} /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 3')} className="p-1.5 hover:bg-surface-variant/30 rounded text-on-surface-variant/80" title={t('mapper.nav.home')}><Home size={16} /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => sendAdbInput('keyevent 187')} className="p-1.5 hover:bg-surface-variant/30 rounded text-on-surface-variant/80" title={t('mapper.nav.recents')}><Rows size={16} /></Button>
                                </div>
                            </div>
                        }
                        menus={
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleExportProjectPOM}
                                    className="p-1.5 hover:bg-primary/10 hover:text-primary rounded text-on-surface-variant/80 transition-all"
                                    title={t('mapper.action.export_project_pom')}
                                >
                                    <FileStack size={18} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleImport}
                                    className="p-1.5 hover:bg-primary/10 hover:text-primary rounded text-on-surface-variant/80 transition-all"
                                    title={t('mapper.flowchart.import')}
                                >
                                    <Download size={18} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleExport}
                                    className="p-1.5 hover:bg-primary/10 hover:text-primary rounded text-on-surface-variant/80 transition-all"
                                    title={t('mapper.flowchart.export')}
                                >
                                    <Upload size={18} />
                                </Button>
                            </div>
                        }
                        actions={
                            <>
                                {hasApiKey && (
                                    <Button
                                        variant={isExploring || isEnhancing ? "danger" : "primary"}
                                        size="sm"
                                        onClick={isExploring ? () => stopExploration(t('mapper.exploration.cancelled')) : isEnhancing ? () => {
                                            if (enhanceAbortControllerRef.current) enhanceAbortControllerRef.current.abort();
                                        } : () => setIsExplorationModalOpen(true)}
                                        className={clsx(
                                            "flex items-center gap-2 px-3 py-1.5 transition-colors shadow-sm text-sm font-medium rounded-2xl",
                                            !(isExploring || isEnhancing) ? "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-on-primary border-none shadow-primary/20" : ""
                                        )}
                                        title={isExploring ? t('mapper.exploration.stop') : isEnhancing ? t('mapper.exploration.stop') : t('mapper.exploration.start')}
                                    >
                                        {(isExploring || isEnhancing) ? <X size={16} /> : <Sparkles size={16} />}
                                        <span className={clsx(isNarrow && "hidden")}>{isExploring ? t('mapper.exploration.stop') : isEnhancing ? t('mapper.exploration.stop') : t('mapper.exploration.start')}</span>
                                    </Button>
                                )}
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                        loadSavedMaps();
                                        setIsFlowchartOpen(true);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-transparent border border-primary text-primary hover:bg-primary/90 hover:text-surface rounded-2xl transition-colors shadow-sm text-sm font-medium"
                                    title={t('mapper.flowchart.open')}
                                >
                                    <GitGraph size={16} />
                                    <span className={clsx(isNarrow && "hidden")}>{t('mapper.flowchart.open')}</span>
                                </Button>
                            </>
                        }
                    >
                    </Section>

                    <div className="flex-1 grid grid-cols-[auto_1fr] gap-2 min-h-0 overflow-hidden">
                        <div className="flex flex-col items-center justify-center overflow-hidden relative max-w-[30vw] rounded-2xl">
                            <DeviceViewport
                                screenshot={screenshot}
                                rootNode={rootNode}
                                loading={loading}
                                isExploring={isExploring}
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
                                taps={taps}
                                swipes={swipes}
                                onRefresh={(forceClear, targetWebUrl) => refreshAll(true, forceClear, targetWebUrl)}
                                handlers={handlers}
                            />
                        </div>

                        {/* Properties Panel */}
                        <div className="bg-surface border border-outline-variant/30 rounded-2xl flex flex-col overflow-hidden shadow-sm flex-1 relative">
                            <div className="flex items-center justify-between border-b border-outline-variant/30 shrink-0 bg-surface/50 px-4 py-3">
                                <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                                    <Settings2 size={16} className="text-primary" />
                                    {hasElementFocus ? t('mapper.properties_element') : t('mapper.properties_screen')}
                                </h3>
                                {isSaving && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant/50 font-medium px-2 py-1 bg-surface rounded-full shadow-sm border border-outline-variant/20">
                                        <ExpressiveLoading size="xsm" variant="circular" />
                                        {t('mapper.status.saving')}
                                    </div>
                                )}
                            </div>

                            {!hasElementFocus ? (
                                <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                                    {/* Screen Settings */}
                                    <div className="p-4 border-b border-outline-variant/30 bg-surface/50 space-y-4">
                                        <div className="flex flex-col xl:flex-row gap-4 items-start">
                                            <div className="flex-1 w-full xl:min-w-[200px]">
                                                <Combobox
                                                    label={t('mapper.screen_name')}
                                                    value={screenName}
                                                    onChange={setScreenName}
                                                    options={savedMaps.map(m => m.name)}
                                                    placeholder={t('mapper.placeholder.screen_name')}
                                                />
                                            </div>
                                            <div className="w-full xl:w-40">
                                                <div className="text-xs font-medium text-on-surface-variant/80 ml-1 mb-1">
                                                    {t('mapper.screen_type')}
                                                </div>
                                                <Select
                                                    value={screenType}
                                                    onChange={(e) => setScreenType(e.target.value as any)}
                                                    options={['screen', 'modal', 'tab', 'drawer'].map(type => ({
                                                        label: t(`mapper.screen_types.${type}`),
                                                        value: type
                                                    }))}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col xl:flex-row gap-2 pb-2">
                                            <Textarea
                                                label={t('mapper.input.screen_description')}
                                                value={screenDescription}
                                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setScreenDescription(e.target.value)}
                                                placeholder={t('mapper.placeholder.screen_description')}
                                                className="h-16"
                                            />
                                            <div className="w-full xl:w-72 flex gap-1 text-[8px]">
                                                <div className="flex-1">
                                                    <TagInput
                                                        label={t('mapper.screen_tags')}
                                                        tags={screenTags}
                                                        assistant={
                                                            <AiButton
                                                                id="mapper_suggest_tags"
                                                                isLoading={isAISuggestingTags}
                                                                onClick={handleAISuggestTags}
                                                                label={t('mapper.action.ai_suggest_tags')}
                                                                variant="ghost"
                                                                className="text-[6px] bg-transparent hover:bg-transparent mt-0"
                                                            />
                                                        }
                                                        onChange={setScreenTags}
                                                        suggestions={[...new Set(savedMaps.flatMap(m => m.tags || []))]}
                                                        placeholder={t('mapper.placeholder.screen_tags')}
                                                        className="mt-0 p-0 h-auto"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setScreenName('');
                                                    setScreenType('screen');
                                                    setScreenTags([]);
                                                    setMappedElements([]);
                                                    setScreenshot(null);
                                                    refreshAll();
                                                }}
                                                className="gap-2"
                                            >
                                                <Plus size={16} /> {t('mapper.action.new')}
                                            </Button>
                                            <div className="relative group" ref={loadMenuRef}>
                                                <Button variant="ghost" onClick={() => setShowLoadMenu(!showLoadMenu)} className="gap-2"><FileClock size={16} /> {t('mapper.saved_screens')}</Button>
                                                {showLoadMenu && (
                                                    <div className="absolute top-full left-0 mt-2 w-80 bg-surface rounded-xl shadow-xl border border-outline-variant/30 overflow-hidden z-[100] flex flex-col max-h-80">
                                                        <div className="p-2 border-b border-outline-variant/30 bg-surface-variant/5 flex flex-col gap-2">
                                                            <div className="px-1 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest flex justify-between items-center">
                                                                <span>{t('mapper.saved_screens')}</span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 text-[10px] py-0 px-2 flex items-center gap-1 hover:text-primary"
                                                                    onClick={() => {
                                                                        setShowLoadMenu(false);
                                                                        setIsEnhanceModalOpen(true);
                                                                    }}
                                                                >
                                                                    <Sparkles size={12} /> {t('mapper.enhancer.btn_audit_enhance')}
                                                                </Button>
                                                            </div>
                                                            <SegmentedControl
                                                                value={screenListMode}
                                                                onChange={setScreenListMode}
                                                                options={[
                                                                    { value: 'all', label: t('mapper.grouping.all_screens') },
                                                                    { value: 'tags', label: t('mapper.grouping.by_tags') }
                                                                ]}
                                                            />
                                                        </div>
                                                        <div className="overflow-y-auto custom-scrollbar flex-1">
                                                            {savedMaps.length === 0 ? (
                                                                <div className="p-4 text-center text-xs text-on-surface-variant/50 italic">{t('mapper.no_saved_maps')}</div>
                                                            ) : screenListMode === 'all' ? (
                                                                savedMaps.map(map => (
                                                                    <div
                                                                        key={map.id}
                                                                        onClick={() => handleLoadScreen(map)}
                                                                        className="flex items-center justify-between p-3 hover:bg-surface-variant/10 cursor-pointer border-b border-outline-variant/5 last:border-0 transition-colors group/item"
                                                                    >
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-sm font-medium text-on-surface">{map.name}</span>
                                                                            <span className="text-[10px] text-on-surface-variant/50 uppercase">{t(`mapper.screen_types.${map.type}`)}</span>
                                                                        </div>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={(e) => handleDeleteScreen(map.id, e)}
                                                                            className="p-1.5 opacity-0 group-hover/item:opacity-100 hover:text-error hover:bg-error/10 rounded transition-all"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </Button>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                // Group by Tags
                                                                (() => {
                                                                    const groupedEntries = groupScreensByTags(savedMaps, t('mapper.grouping.no_tags'));

                                                                    return groupedEntries.map(([tag, maps]) => {
                                                                        const isExpanded = expandedScreenTags.includes(tag);
                                                                        return (
                                                                            <div key={tag} className="border-b border-outline-variant/5 last:border-0">
                                                                                <div
                                                                                    className="flex items-center justify-between p-2 hover:bg-surface-variant/10 cursor-pointer text-xs font-semibold text-on-surface-variant/80 bg-surface-variant/5"
                                                                                    onClick={() => {
                                                                                        setExpandedScreenTags(prev =>
                                                                                            prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]
                                                                                        );
                                                                                    }}
                                                                                >
                                                                                    <span className="flex items-center gap-1.5">
                                                                                        <span className="w-4 h-4 flex items-center justify-center">
                                                                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                                        </span>
                                                                                        {tag}
                                                                                    </span>
                                                                                    <span className="text-[10px] bg-surface-variant/30 px-1.5 rounded">{maps.length}</span>
                                                                                </div>
                                                                                {isExpanded && (
                                                                                    <div className="flex flex-col bg-surface-variant/5">
                                                                                        {maps.map(map => (
                                                                                            <div
                                                                                                key={`${tag}-${map.id}`}
                                                                                                onClick={() => handleLoadScreen(map)}
                                                                                                className="flex items-center justify-between p-2 pl-8 hover:bg-surface-variant/10 cursor-pointer border-t border-outline-variant/5 transition-colors group/item"
                                                                                            >
                                                                                                <div className="flex flex-col gap-0.5">
                                                                                                    <span className="text-sm font-medium text-on-surface">{map.name}</span>
                                                                                                    <span className="text-[10px] text-on-surface-variant/50 uppercase">{t(`mapper.screen_types.${map.type}`)}</span>
                                                                                                </div>
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon"
                                                                                                    onClick={(e) => handleDeleteScreen(map.id, e)}
                                                                                                    className="p-1 opacity-0 group-hover/item:opacity-100 hover:text-error hover:bg-error/10 rounded transition-all"
                                                                                                >
                                                                                                    <Trash2 size={14} />
                                                                                                </Button>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    });
                                                                })()
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 flex justify-end gap-2">
                                                {screenName && mappedElements.length > 0 && (
                                                    <Button
                                                        onClick={handleExportPOM}
                                                        variant="ghost"
                                                        size="icon"
                                                        title={t('mapper.action.export_pom')}
                                                        data-position="left"
                                                        className="hover:text-primary hover:bg-primary/10 transition-all"
                                                    >
                                                        <FileCode size={18} />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-b border-outline-variant/30 p-4">
                                        <h3 className="text-sm font-semibold text-primary dark:text-primary/80 uppercase tracking-wider flex items-center gap-2">
                                            <SearchCode size={14} /> {t('mapper.screen_mapper')}
                                        </h3>
                                        <div className="flex gap-2">
                                            <div className="relative group" ref={elementsMenuRef}>
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => setShowElementsMenu(!showElementsMenu)}
                                                    className={clsx(showElementsMenu ? "text-primary dark:text-primary/80 bg-primary/10" : "text-on-surface-variant/80", "gap-2")}
                                                >
                                                    <FileClock size={16} /> {t('mapper.saved_elements')}
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-on-surface hover:bg-surface"
                                                    title={t('mapper.export.export_flows', { defaultValue: 'Export flows' })}
                                                    data-position="left"
                                                    onClick={async () => {
                                                        try {
                                                            const maps = await listScreenMaps(activeProfileId, settings.paths?.mappings);
                                                            const flows = generateFlows(maps);
                                                            if (flows.length === 0) {
                                                                feedback.toast.info(t('mapper.export.no_flows_found', { defaultValue: 'No connected paths found. Connect screens via "navigates_to" first.' }));
                                                                return;
                                                            }

                                                            const xmlData = generateTestLinkXML(flows);
                                                            const bddData = generateRobotBDD(flows);

                                                            await exportMapperData(activeProfileId, settings.paths?.mappings); // Keeping the standard export for maps too if needed

                                                            const savePathXML = await save({
                                                                title: t('mapper.export.save_testlink_xml', { defaultValue: 'Save TestLink Flows (XML)' }),
                                                                filters: [{ name: 'XML', extensions: ['xml'] }],
                                                                defaultPath: 'flows.xml'
                                                            });

                                                            if (savePathXML) {
                                                                const { writeTextFile } = await import('@tauri-apps/plugin-fs');
                                                                await writeTextFile(savePathXML, xmlData);
                                                                feedback.toast.success(t('mapper.export.flows_success', { defaultValue: 'TestLink XML exported successfully.' }));
                                                            }

                                                            const savePathBDD = await save({
                                                                title: t('mapper.export.save_robot_bdd', { defaultValue: 'Save Robot Framework BDD' }),
                                                                filters: [{ name: 'Robot', extensions: ['robot'] }],
                                                                defaultPath: 'flows.robot'
                                                            });

                                                            if (savePathBDD) {
                                                                const { writeTextFile } = await import('@tauri-apps/plugin-fs');
                                                                await writeTextFile(savePathBDD, bddData);
                                                                feedback.toast.success(t('mapper.export.flows_success', { defaultValue: 'Robot BDD exported successfully.' }));
                                                            }

                                                        } catch (err: any) {
                                                            feedback.toast.error(t('mapper.export.error', { error: err.message }));
                                                        }
                                                    }}
                                                >
                                                    <Download size={14} />
                                                </Button>

                                                {showElementsMenu && (
                                                    <div className="absolute top-full right-0 mt-2 w-80 bg-surface rounded-xl shadow-xl border border-outline-variant/30 overflow-hidden z-[100] flex flex-col max-h-100">
                                                        <div className="p-2 border-b border-outline-variant/30 bg-surface-variant/5 flex flex-col gap-2">
                                                            <div className="px-1 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">
                                                                {t('mapper.saved_elements', 'Saved Elements')}
                                                            </div>
                                                            <SegmentedControl
                                                                value={elementListMode}
                                                                onChange={setElementListMode}
                                                                options={[
                                                                    { value: 'all', label: t('mapper.grouping.all_elements', 'All Elements') },
                                                                    { value: 'type', label: t('mapper.grouping.by_type', 'By Type') }
                                                                ]}
                                                            />
                                                        </div>
                                                        <div className="overflow-y-auto custom-scrollbar flex-1">
                                                            {mappedElements.length === 0 ? (
                                                                <div className="p-4 text-center text-xs text-on-surface-variant/50 italic">{t('mapper.no_saved_elements', 'No elements mapped')}</div>
                                                            ) : elementListMode === 'all' ? (
                                                                mappedElements.map(el => (
                                                                    <div
                                                                        key={el.id}
                                                                        onClick={() => {
                                                                            setCurrentElement(el);
                                                                            // Try to find matching node in current tree if possible
                                                                            if (rootNode) {
                                                                                const findNodeById = (node: InspectorNode): InspectorNode | null => {
                                                                                    if (generateXPath(node) === el.id) return node;
                                                                                    for (const child of node.children) {
                                                                                        const found = findNodeById(child);
                                                                                        if (found) return found;
                                                                                    }
                                                                                    return null;
                                                                                };
                                                                                const matchingNode = findNodeById(rootNode);
                                                                                if (matchingNode) setSelectedNode(matchingNode);
                                                                            }
                                                                            setShowElementsMenu(false);
                                                                        }}
                                                                        className={clsx(
                                                                            "flex items-center justify-between p-3 hover:bg-surface-variant/10 cursor-pointer border-b border-outline-variant/5 last:border-0 transition-colors group/ele",
                                                                            currentElement.id === el.id && "bg-primary/5"
                                                                        )}
                                                                    >
                                                                        <div className="flex flex-col gap-0.5 truncate pr-2">
                                                                            <span className="text-sm font-medium text-on-surface truncate">{el.name}</span>
                                                                            <span className="text-[10px] text-on-surface-variant/50 uppercase">{t(`mapper.types.${el.type}`)}</span>
                                                                        </div>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                removeElementMapping(el.id);
                                                                            }}
                                                                            className="p-1.5 opacity-0 group-hover/ele:opacity-100 hover:text-error hover:bg-error/10 rounded transition-all"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </Button>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                // Group by Type
                                                                (() => {
                                                                    const grouped = groupElementsByType(mappedElements, (key) => t(key));

                                                                    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([type, elements]) => {
                                                                        const isExpanded = expandedElementTypes.includes(type);
                                                                        return (
                                                                            <div key={type} className="border-b border-outline-variant/5 last:border-0">
                                                                                <div
                                                                                    className="flex items-center justify-between p-2 hover:bg-surface-variant/10 cursor-pointer text-xs font-semibold text-on-surface-variant/80 bg-surface-variant/5"
                                                                                    onClick={() => {
                                                                                        setExpandedElementTypes(prev =>
                                                                                            prev.includes(type) ? prev.filter(item => item !== type) : [...prev, type]
                                                                                        );
                                                                                    }}
                                                                                >
                                                                                    <span className="flex items-center gap-1.5">
                                                                                        <span className="w-4 h-4 flex items-center justify-center">
                                                                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                                        </span>
                                                                                        {type}
                                                                                    </span>
                                                                                    <span className="text-[10px] bg-surface-variant/30 px-1.5 rounded">{elements.length}</span>
                                                                                </div>
                                                                                {isExpanded && (
                                                                                    <div className="flex flex-col bg-surface-variant/5">
                                                                                        {elements.map(el => (
                                                                                            <div
                                                                                                key={el.id}
                                                                                                onClick={() => {
                                                                                                    setCurrentElement(el);
                                                                                                    // Try to find matching node in current tree if possible
                                                                                                    if (rootNode) {
                                                                                                        const findNodeById = (node: InspectorNode): InspectorNode | null => {
                                                                                                            if (generateXPath(node) === el.id) return node;
                                                                                                            for (const child of node.children) {
                                                                                                                const found = findNodeById(child);
                                                                                                                if (found) return found;
                                                                                                            }
                                                                                                            return null;
                                                                                                        };
                                                                                                        const matchingNode = findNodeById(rootNode);
                                                                                                        if (matchingNode) setSelectedNode(matchingNode);
                                                                                                    }
                                                                                                    setShowElementsMenu(false);
                                                                                                }}
                                                                                                className={clsx(
                                                                                                    "flex items-center justify-between p-2 pl-8 hover:bg-surface-variant/10 cursor-pointer border-t border-outline-variant/5 transition-colors group/ele",
                                                                                                    currentElement.id === el.id && "bg-primary/5"
                                                                                                )}
                                                                                            >
                                                                                                <div className="flex flex-col gap-0.5 truncate pr-2">
                                                                                                    <span className="text-sm font-medium text-on-surface truncate">{el.name}</span>
                                                                                                    <span className="text-[10px] text-on-surface-variant/50 uppercase">{t(`mapper.types.${el.type}`)}</span>
                                                                                                </div>
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon"
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        removeElementMapping(el.id);
                                                                                                    }}
                                                                                                    className="p-1 opacity-0 group-hover/ele:opacity-100 hover:text-error hover:bg-error/10 rounded transition-all"
                                                                                                >
                                                                                                    <Trash2 size={14} />
                                                                                                </Button>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    });
                                                                })()
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex items-center justify-between border-b border-outline-variant/30 shrink-0 bg-surface/50 px-2 py-1.5">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => { setSelectedNode(null); setCurrentElement({}); }}
                                            className="text-on-surface-variant/80 hover:text-on-surface/90 gap-1.5 px-2"
                                        >
                                            <ArrowLeft size={16} /> {t('mapper.action.back_to_screen', 'Back to Screen')}
                                        </Button>
                                        {availableNodes.length > 1 ? (
                                            <div className="flex overflow-x-auto custom-scrollbar flex-1">
                                                {availableNodes.map((node) => (
                                                    <Button
                                                        key={node.id}
                                                        onClick={() => setSelectedNode(node)}
                                                        className={clsx(
                                                            "px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap rounded-none shadow-none",
                                                            selectedNode === node
                                                                ? "border-b-primary text-primary bg-surface-variant/30"
                                                                : "bg-transparent text-on-surface-variant/80 hover:text-on-surface-variant/80 hover:bg-surface-variant/30"
                                                        )}
                                                    >
                                                        {node.tagName}
                                                    </Button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="px-4 py-3 text-sm font-semibold text-on-surface-variant/80 flex-1">
                                                {t('mapper.properties_element')}
                                            </div>
                                        )}
                                        {selectedNode && (
                                            <Button
                                                onClick={() => {
                                                    setSelectedNode(null);
                                                    setAvailableNodes([]);
                                                }}
                                                className="p-1.5 text-on-surface/80 hover:text-error bg-transparent hover:bg-error-container/10 shadow-none rounded-full transition-colors ml-2"
                                            >
                                                <X size={16} />
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                                        <div className="p-4 space-y-4">
                                            {selectedNode ? (
                                                <>
                                                    <div className="space-y-4">
                                                        <NodeBreadcrumbs
                                                            node={selectedNode}
                                                            onSelect={setSelectedNode}
                                                            onHover={setHoveredNode}
                                                        />
                                                    </div>

                                                    <div className="mb-4 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <h3 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{t('inspector.attributes.identifiers')}</h3>
                                                            <AiButton
                                                                id="mapper_suggest_name"
                                                                isLoading={isAISuggesting}
                                                                onClick={handleAISuggestName}
                                                                label={t('mapper.action.ai_suggest_name')}
                                                                variant="primary"
                                                                className="h-7"
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                            <CopyButton
                                                                label={t('inspector.attributes.access_id')}
                                                                value={selectedNode.attributes['content-desc']}
                                                                onCopy={(v: string) => copyToClipboard(v, 'aid')}
                                                                active={copied === 'aid'}
                                                            />
                                                            <CopyButton
                                                                label={t('inspector.attributes.resource_id')}
                                                                value={selectedNode.attributes['resource-id']}
                                                                onCopy={(v: string) => copyToClipboard(v, 'rid')}
                                                                active={copied === 'rid'}
                                                            />
                                                        </div>
                                                    </div>

                                                    {showAISuggestion && (
                                                        <AiResponse
                                                            title={t('inspector.attributes.ai_suggest')}
                                                            isLoading={isAISuggesting}
                                                            responseTitle={t('inspector.attributes.suggested_selector')}
                                                            response={aiSuggestedName ? `\`${aiSuggestedName}\`` : null}
                                                            rationale={aiJustification}
                                                            rationaleHeader={t('inspector.attributes.rationale')}
                                                            error={aiError}
                                                            onCopy={() => {
                                                                updateElement('name', aiSuggestedName || '');
                                                                feedback.toast.success(t('feedback.saved'));
                                                            }}
                                                        />
                                                    )}

                                                    <div className="grid grid-cols-1 gap-4">
                                                        <Input
                                                            label={t('mapper.input.element_name')}
                                                            value={currentElement.name || ''}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateElement('name', e.target.value)}
                                                            placeholder={t('mapper.placeholder.element_name')}
                                                        />
                                                        <Textarea
                                                            label={t('mapper.input.element_description')}
                                                            value={currentElement.description || ''}
                                                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateElement('description', e.target.value)}
                                                            placeholder={t('mapper.placeholder.element_description', 'Element description (AI only)')}
                                                            className="h-20"
                                                        />
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <Select
                                                                label={t('mapper.input.element_type')}
                                                                value={currentElement.type || 'button'}
                                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateElement('type', e.target.value)}
                                                                options={(['button', 'input', 'text', 'link', 'toggle', 'checkbox', 'image', 'menu', 'scroll_view', 'tab'] as UIElementType[]).map(type => ({
                                                                    label: t(`mapper.types.${type}`),
                                                                    value: type
                                                                }))}
                                                            />
                                                            <GroupedScreenSelect
                                                                label={t('mapper.input.navigates_to')}
                                                                value={
                                                                    (typeof currentElement.navigates_to === 'string'
                                                                        ? currentElement.navigates_to
                                                                        : Array.isArray(currentElement.navigates_to)
                                                                            ? currentElement.navigates_to[0]?.destination
                                                                            : (currentElement.navigates_to as NavigationData)?.destination) || ''
                                                                }
                                                                onChange={(val) => {
                                                                    if (Array.isArray(currentElement.navigates_to)) {
                                                                        const newNavs = [...currentElement.navigates_to];
                                                                        if (newNavs.length > 0) newNavs[0] = { ...newNavs[0], destination: val };
                                                                        else newNavs.push({ destination: val });
                                                                        updateElement('navigates_to', newNavs);
                                                                    } else if (typeof currentElement.navigates_to === 'object' && currentElement.navigates_to !== null) {
                                                                        updateElement('navigates_to', { ...(currentElement.navigates_to as NavigationData), destination: val });
                                                                    } else {
                                                                        updateElement('navigates_to', val);
                                                                    }
                                                                }}
                                                                maps={savedMaps}
                                                                placeholder={t('mapper.placeholder.navigates_to')}
                                                            />
                                                        </div>

                                                        {/* AI & QA Fields */}
                                                        <div className="mt-6 border-t border-surface-variant pt-4">
                                                            <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => updateElement('assertion_target', !currentElement.assertion_target)}>
                                                                <Switch
                                                                    checked={!!currentElement.assertion_target}
                                                                    onCheckedChange={(c) => updateElement('assertion_target', c)}
                                                                />
                                                                <span className="text-sm font-medium text-on-surface">Assertion Target <span className="opacity-50 text-xs ml-1">(Verifies screen load)</span></span>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <Input
                                                                    label="Expected Data (Mocks)"
                                                                    value={currentElement.expected_data || ''}
                                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateElement('expected_data', e.target.value)}
                                                                    placeholder="e.g. Email, CEP"
                                                                />
                                                                <Select
                                                                    label="Suggested Interaction"
                                                                    value={currentElement.suggested_interaction || ''}
                                                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateElement('suggested_interaction', e.target.value)}
                                                                    options={[
                                                                        { label: 'Auto (Guessed)', value: '' },
                                                                        { label: 'Tap', value: 'tap' },
                                                                        { label: 'Swipe', value: 'swipe' },
                                                                        { label: 'Long Press', value: 'long_press' },
                                                                        { label: 'Type Text', value: 'type' },
                                                                    ]}
                                                                />
                                                            </div>
                                                            <div className="mt-4">
                                                                <Input
                                                                    label="Business Rule (TestLink ID)"
                                                                    value={currentElement.business_rule || ''}
                                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateElement('business_rule', e.target.value)}
                                                                    placeholder="e.g. REQ-102"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Complex Fields */}
                                                        {currentElement.type === 'menu' && (
                                                            <Textarea
                                                                label={t('mapper.input.menu_options')}
                                                                value={currentElement.menu_options?.join(',') || ''}
                                                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateElement('menu_options', e.target.value.split(','))}
                                                                placeholder={t('mapper.placeholder.menu_options')}
                                                                className="h-20"
                                                            />
                                                        )}
                                                        {currentElement.type === 'tab' && (
                                                            <GroupedScreenSelect
                                                                label={t('mapper.input.parent_screen')}
                                                                value={currentElement.parent_screen || ''}
                                                                onChange={(val) => updateElement('parent_screen', val)}
                                                                maps={savedMaps}
                                                                placeholder={t('mapper.placeholder.parent_screen')}
                                                            />
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center h-full text-on-surface/80 p-8 text-center">
                                                    <Scan size={48} className="mb-4 opacity-20" />
                                                    <p className="text-sm">{t('mapper.select_element')}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            <FlowchartModal
                isOpen={isFlowchartOpen}
                onClose={() => setIsFlowchartOpen(false)}
                maps={savedMaps}
                onEditScreen={(name) => {
                    const map = savedMaps.find(m => m.name === name);
                    if (map) {
                        handleLoadScreen(map);
                        setIsFlowchartOpen(false);
                    }
                }}
                onRefresh={loadSavedMaps}
                activeProfileId={activeProfileId}
            />

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={() => {
                    confirmDeleteScreen();
                    refreshAll();
                }}
                title={t('mapper.confirm.delete_title')}
                description={t('mapper.confirm.delete_desc')}
                variant="danger"
                confirmText={t('mapper.action.delete')}
            />

            {isExplorationModalOpen && (
                <AutonomousExplorationConfigModal
                    onClose={() => setIsExplorationModalOpen(false)}
                    onStart={startExploration}
                />
            )}

            <ConfirmationModal
                isOpen={showMigrationModal}
                onClose={() => setShowMigrationModal(false)}
                onConfirm={performMigration}
                title={t('mapper.migration.title')}
                description={t('mapper.migration.message')}
                confirmText={t('mapper.migration.copy')}
                cancelText={t('mapper.migration.ignore')}
                isLoading={isMigrating}
                variant="warning"
            />

            {/* AI Exploration Log Panel */}
            {explorationLogs.length > 0 && (
                <div className={clsx(
                    "fixed bottom-6 right-6 w-96 bg-surface p-4 border border-outline-variant/30 rounded-2xl shadow-2xl z-[150] transition-all flex flex-col gap-3",
                    !(isExploring || isEnhancing) && explorationLogs.length > 0 ? "opacity-90 grayscale-[0.5]" : "opacity-100"
                )}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={clsx("w-2 h-2 rounded-full", isExploring || isEnhancing ? "bg-success animate-pulse" : "bg-on-surface-variant/30")} />
                            <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                                {isExploring || isEnhancing ? t('mapper.exploration.active') : t('mapper.exploration.summary')}
                            </h4>
                        </div>
                        <div className="flex gap-1">
                            {!(isExploring || isEnhancing) && (
                                <>
                                    <Button variant="ghost" size="icon" onClick={handleSaveExplorationLogs} className="h-6 w-6 text-on-surface-variant/80 hover:text-primary transition-colors" title={t('mapper.action.save_logs', { defaultValue: 'Save Logs' })}>
                                        <Save size={14} />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setExplorationLogs([])} className="h-6 w-6">
                                        <X size={14} />
                                    </Button>
                                </>
                            )}
                        </div>
                        {(isExploring || isEnhancing) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={toggleStayOn}
                                className={clsx("flex items-center gap-2 px-3 py-1.5 rounded-2xl transition-all", isStayOn ? "bg-warning/20 text-warning" : "text-on-surface-variant/60 hover:bg-surface-variant/30")}
                                title={t('mapper.action.toggle_stay_awake')}
                                data-position='left'
                            >
                                {isStayOn ? <Eye size={16} stroke="currentColor" /> : <EyeClosed size={16} stroke="currentColor" />}
                            </Button>
                        )}
                    </div>
                    <div
                        ref={logScrollRef}
                        onScroll={onExplorationScroll}
                        className="bg-surface-variant/5 rounded-xl p-3 border border-outline-variant/10 overflow-y-auto max-h-80 custom-scrollbar"
                    >
                        <ExplorationLogTree logs={explorationLogs} />
                        {(isExploring || isEnhancing) && (
                            <div className="flex items-center gap-2 text-[10px] text-primary animate-pulse mt-4 px-3 border-l-2 border-primary/30 py-1 font-mono">
                                <ExpressiveLoading size="xsm" variant="circular" />
                                {t('mapper.exploration.thinking')}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <EnhanceMapsModal
                isOpen={isEnhanceModalOpen}
                onClose={() => setIsEnhanceModalOpen(false)}
                savedMaps={savedMaps}
                onEnhanceComplete={async (enhancedMaps) => {
                    for (const map of enhancedMaps) {
                        try {
                            const path = `${settings.paths.mappings || ''}/${map.id}.json`;
                            const content = JSON.stringify(map, null, 2);
                            await invoke('save_file', { path, content, append: false });
                        } catch (e) {
                            console.error(`Failed to save enhanced map ${map.id}`, e);
                        }
                    }
                    loadSavedMaps();
                    feedback.toast.success(t('mapper.enhancer.btn_done'));
                }}
            />
        </div>
    );
}

// --- Helper Components ---

function NodeBreadcrumbs({ node, onSelect, onHover }: { node: InspectorNode | null, onSelect: (n: InspectorNode) => void, onHover: (n: InspectorNode | null) => void }) {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);

    if (!node) return null;
    // 1. Build path from leaf to root
    let path: InspectorNode[] = [];
    let curr: InspectorNode | undefined = node;
    while (curr) {
        if (curr.tagName !== 'hierarchy' && curr.tagName !== 'node') {
            path.unshift(curr);
        }
        curr = curr.parent;
    }

    // Filter out system nodes (up to android:id/content)
    const contentIndex = path.findIndex(n => n.attributes['resource-id']?.endsWith(':id/content'));
    if (contentIndex !== -1) {
        path = path.slice(contentIndex + 1);
    }

    const cleanTag = (tag: string) => tag.replace('android.widget.', '').replace('android.view.', '');

    // Determine visible path
    const displayPath = isExpanded ? path : path.slice(-2);
    const isHidden = path.length > 2 && !isExpanded;

    return (
        <div className="flex flex-col gap-2">
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
                                "hover:text-primary hover:underline transition-colors text-left",
                                n === node ? "font-bold text-on-surface/80" : ""
                            )}
                            title={generateXPath(n)}
                        >
                            {cleanTag(n.tagName)}
                            {n.attributes['resource-id'] && <span className="p-0 m-0 ml-1 rounded-none text-primary dark:text-primary/80">resource-id="{n.attributes['resource-id'].split('/').pop()}"</span>}
                            {!n.attributes['resource-id'] && n.attributes['content-desc'] && <span className="p-0 m-0 ml-1 rounded-none text-on-success-container/10">content-desc="{n.attributes['content-desc'].substring(0, 15)}..."</span>}
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

function CopyButton({ label, value, onCopy, active }: { label: string, value: string | undefined, onCopy: (v: string) => void, active: boolean }) {
    const { t } = useTranslation();
    if (!value) return null; // Don't show if empty
    return (
        <Button
            variant="ghost"
            onClick={() => onCopy(value)}
            className={clsx(
                "flex flex-col items-start p-2 rounded-2xl border transition-all text-left h-auto",
                active
                    ? "bg-success-container/10 border-success-container/20 text-on-success-container"
                    : "bg-surface/50 border-outline-variant/30 hover:border-info-container/50"
            )}
        >
            <span className="text-[10px] tracking-wider opacity-70 mb-0.5 flex w-full justify-between">
                <div className="font-semibold uppercase">
                    {label}
                </div>
                <div className="text-success">
                    {active && <div className="flex items-center gap-1"><Check size={12} />{t("inspector.attributes.copied")}</div>}
                </div>
            </span>
            <span className="text-xs font-mono truncate w-full" title={value}>{value}</span>
        </Button>
    );
}
