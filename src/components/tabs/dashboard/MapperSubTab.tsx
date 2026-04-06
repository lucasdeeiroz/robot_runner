
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Maximize, Check, Scan, Home, ArrowLeft, Rows, X, RefreshCw, Save, GitGraph, Trash2, Plus, FileClock, FileInput, SearchCode, ChevronDown, ChevronUp, ChevronRight,
    FileCode, FileStack, Upload, Download, Eye, EyeClosed, Sparkles, Square,
} from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { InspectorNode, transformXmlToTree, findNodesAtCoords, generateXPath, transformBounds, assignShortIds, findNodeByShortId, generateSimplifiedXml } from '@/lib/inspectorUtils';
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
import { ExpressiveLoading } from "@/components/atoms/ExpressiveLoading";
import { Combobox } from "@/components/atoms/Combobox";
import { Select } from "@/components/atoms/Select";
import { TagInput } from "@/components/atoms/TagInput";
import { Input } from "@/components/atoms/Input";
import { Textarea } from "@/components/atoms/Textarea";
import { useTestSessions } from '@/lib/testSessionStore';
import { UIElementType, UIElementMap, ScreenMap, NavigationData } from '@/lib/types';
import { saveScreenMap, listScreenMaps, deleteScreenMap, exportMapperData, importMapperData } from '@/lib/dashboard/mapperPersistence';
import { useSettings } from '@/lib/settings';
import { save, open } from '@tauri-apps/plugin-dialog';
import { ConfirmationModal } from '@/components/organisms/ConfirmationModal';
import { FlowchartModal } from '@/components/organisms/FlowchartModal';
import { Button } from '@/components/atoms/Button';
import { SegmentedControl } from '@/components/molecules/SegmentedControl';
import { GroupedScreenSelect } from '@/components/molecules/GroupedScreenSelect';
import { groupScreensByTags } from '@/lib/utils';
import { GestureOverlay } from '@/components/molecules/GestureOverlay';
import { AiButton } from "@/components/atoms/AiButton";
import { AiResponse } from "@/components/molecules/AiResponse";
import * as gemini from '@/lib/dashboard/gemini';
import * as claude from '@/lib/dashboard/claude';
import * as openai from '@/lib/dashboard/openai';
import { AutonomousExplorer, ExplorationAction } from '@/lib/dashboard/explorationEngine';

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
    const { settings } = useSettings();
    const { t, i18n } = useTranslation();
    const { activeProfileId } = useSettings();
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [rootNode, setRootNode] = useState<InspectorNode | null>(null);
    const [imgLayout, setImgLayout] = useState<{ width: number, height: number, naturalWidth: number, naturalHeight: number } | null>(null);
    const [selectedNode, setSelectedNode] = useState<InspectorNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<InspectorNode | null>(null);

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
    const [aiJustification, setAiJustification] = useState<string | null>(null);
    const [showAISuggestion, setShowAISuggestion] = useState(false);
    const [isAISuggestingTags, setIsAISuggestingTags] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // --- Autonomous Exploration State ---
    const [isStayOn, setIsStayOn] = useState(false);
    const [isExploring, setIsExploring] = useState(false);
    const isExploringRef = useRef(false);
    const [explorationLogs, setExplorationLogs] = useState<string[]>([]);
    const explorerRef = useRef<AutonomousExplorer | null>(null);
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
        const maps = await listScreenMaps(activeProfileId);
        setSavedMaps(maps);
        return maps;
    };

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

    // Helper to update current element state
    const updateElement = (key: keyof UIElementMap, value: any) => {
        setCurrentElement(prev => ({ ...prev, [key]: value }));
    };

    const saveElementMapping = () => {
        if (!currentElement.name) {
            feedback.toast.error(t('mapper.error.missing_name'));
            return;
        }

        if (!selectedNode && !currentElement.id) {
            feedback.toast.error(t('mapper.error.no_element_selected'));
            return;
        }

        // Clone and sanitize
        const elementToSave = { ...currentElement };
        if (elementToSave.type === 'menu' && Array.isArray(elementToSave.menu_options)) {
            elementToSave.menu_options = elementToSave.menu_options
                .map(s => s.trim())
                .filter(Boolean);
        }

        const newElement = elementToSave as UIElementMap;
        setMappedElements(prev => {
            const idx = prev.findIndex(e => e.id === newElement.id);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = newElement;
                return updated;
            }
            return [...prev, newElement];
        });
        feedback.toast.success(t('mapper.feedback.mapped'));
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

    // Screen Actions
    const handleSaveScreen = async () => {
        if (!screenName) {
            feedback.toast.error(t('mapper.error.missing_screen_name'));
            return;
        }
        if (mappedElements.length === 0) {
            feedback.toast.info(t('mapper.feedback.empty_map'));
            // allowing save even if empty, but warning is good
        }

        const map: ScreenMap = {
            id: screenName.toLowerCase().replace(/\s+/g, '_'),
            name: screenName,
            type: screenType,
            description: screenDescription || undefined,
            tags: screenTags.length > 0 ? screenTags : undefined,
            elements: mappedElements,
            base64_preview: screenshot || undefined
        };

        try {
            await saveScreenMap(activeProfileId, map);
            feedback.toast.success(t('mapper.feedback.saved'));
            loadSavedMaps(); // Refresh list
        } catch (e) {
            feedback.toast.error(t('mapper.error.save_failed'), e);
        }
    };

    const handleLoadScreen = (map: ScreenMap) => {
        setScreenName(map.name);
        setScreenType(map.type);
        setScreenDescription(map.description || "");
        setScreenTags(map.tags || []);
        setMappedElements(map.elements);
        if (map.base64_preview) {
            setScreenshot(map.base64_preview); // Optional: might want to keep live screenshot instead
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
            await deleteScreenMap(activeProfileId, screenToDelete);
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
                setScreenshot(null);
            }
        }
    };


    const handleExport = async () => {
        try {
            const data = await exportMapperData(activeProfileId);
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
                await importMapperData(activeProfileId, content);
                feedback.toast.success(t('mapper.flowchart.import_success'));
                loadSavedMaps(); // Refresh list
            }
        } catch (e) {
            console.error(e);
            feedback.toast.error(t('mapper.flowchart.import_error'));
        }
    };

    const handleAISuggestName = async () => {
        if (!selectedNode || !activeProfileId) return;

        const { aiProvider, geminiApiKey, claudeApiKey, openaiApiKey, geminiModel, claudeModel, openaiModel, language } = settings;
        const apiKey = aiProvider === 'gemini' ? geminiApiKey : aiProvider === 'claude' ? claudeApiKey : openaiApiKey;
        const model = aiProvider === 'gemini' ? geminiModel : aiProvider === 'claude' ? claudeModel : openaiModel;

        if (!apiKey) {
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

            if (aiProvider === 'gemini') {
                result = await gemini.suggestElementName(selectedNode.attributes, screenName, apiKey, model, lang, savedMaps);
            } else if (aiProvider === 'openai') {
                result = await openai.suggestElementName(selectedNode.attributes, screenName, apiKey, model, lang, savedMaps);
            } else if (aiProvider === 'claude') {
                result = await claude.suggestElementName(selectedNode.attributes, screenName, apiKey, model, lang, savedMaps);
            }

            if (result && result.name) {
                setAiSuggestedName(result.name);
                setAiJustification(result.justification);
                feedback.toast.success(t('mapper.feedback.ai_success'));
            } else {
                throw new Error("Empty suggestion");
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

    const handleAISuggestTags = async () => {
        if (!activeProfileId) return;

        const { aiProvider, geminiApiKey, claudeApiKey, openaiApiKey, geminiModel, claudeModel, openaiModel, language } = settings;
        const apiKey = aiProvider === 'gemini' ? geminiApiKey : aiProvider === 'claude' ? claudeApiKey : openaiApiKey;
        const model = aiProvider === 'gemini' ? geminiModel : aiProvider === 'claude' ? claudeModel : openaiModel;

        if (!apiKey) {
            feedback.toast.error(t('dashboard.generator.key_required', { provider: aiProvider.toUpperCase() }));
            return;
        }

        setIsAISuggestingTags(true);
        try {
            const lang = language || i18n.language || 'en';
            let tags: string[] = [];

            // Use mapped elements for context
            const elementsContext = mappedElements.map(el => ({ name: el.name, type: el.type }));

            if (aiProvider === 'gemini') {
                tags = await gemini.suggestScreenTags(screenName || "Current Screen", elementsContext, apiKey, model, lang, screenshot || undefined);
            } else if (aiProvider === 'openai') {
                tags = await openai.suggestScreenTags(screenName || "Current Screen", elementsContext, apiKey, model, lang, screenshot || undefined);
            } else if (aiProvider === 'claude') {
                tags = await claude.suggestScreenTags(screenName || "Current Screen", elementsContext, apiKey, model, lang, screenshot || undefined);
            }

            if (tags && tags.length > 0) {
                // Merge with existing tags, ensuring uniqueness
                setScreenTags(prev => [...new Set([...prev, ...tags])]);
                feedback.toast.success(t('mapper.feedback.ai_success'));
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

        if (reason) {
            explorerRef.current?.addLog(`Exploration stopped: ${reason}`);
            setExplorationLogs(explorerRef.current?.getLogs() || []);
            feedback.toast.info(t('mapper.exploration.stopped', { reason }));
        }
    };

    const runExplorationStep = async () => {
        if (!isExploringRef.current || !selectedDevice || !explorerRef.current) return;

        const explorer = explorerRef.current;
        explorer.incrementStep();

        // Removed max steps check to allow indefinite exploration

        try {
            explorer.addLog(`--- Step ${explorer.getState().currentStep} ---`);

            // App Recovery Logic
            const currentPkg = await invoke<string>('get_focused_package', { device: selectedDevice });
            if (!isExploringRef.current) return;

            let targetPkg = explorer.getTargetPackage();

            if (explorer.getState().currentStep === 1 && !targetPkg) {
                targetPkg = currentPkg;
                explorer.setTargetPackage(targetPkg);
            }

            if (targetPkg && currentPkg !== targetPkg) {
                explorer.addLog(`App exit detected (Current: ${currentPkg}, Target: ${targetPkg}). Recovering...`);
                await invoke('launch_package', { device: selectedDevice, package: targetPkg });
                if (!isExploringRef.current) return;
                // Small delay to let app load
                await new Promise(resolve => setTimeout(resolve, 3000));
                if (!isExploringRef.current) return;
            }

            setExplorationLogs([...explorer.getLogs()]);

            // 1. Capture Current State
            explorer.addLog("Capturing screen...");
            setExplorationLogs([...explorer.getLogs()]);
            const b64 = await invoke<string>('get_screenshot', { deviceId: selectedDevice });
            if (!isExploringRef.current) return;
            setScreenshot(b64);

            const xml = await invoke<string>('get_xml_dump', { deviceId: selectedDevice });
            if (!isExploringRef.current) return;

            // Parse for local UI update
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", textNodeName: "_text" });
            const jsonObj = parser.parse(xml);
            const root = jsonObj.hierarchy ? transformXmlToTree(jsonObj.hierarchy) : transformXmlToTree(jsonObj);

            // Prepare for AI with Short IDs
            assignShortIds(root);
            const simplifiedXml = generateSimplifiedXml(root);
            setRootNode(root);

            // 2. AI Analysis
            const { aiProvider, geminiApiKey, claudeApiKey, openaiApiKey, geminiModel, claudeModel, openaiModel, language } = settings;
            const apiKey = aiProvider === 'gemini' ? geminiApiKey : aiProvider === 'claude' ? claudeApiKey : openaiApiKey;
            const model = aiProvider === 'gemini' ? geminiModel : aiProvider === 'claude' ? claudeModel : openaiModel;
            const lang = language || i18n.language || 'en';

            if (!apiKey) throw new Error("API Key missing");

            explorer.addLog(`Analyzing screen with ${aiProvider}...`);
            setExplorationLogs([...explorer.getLogs()]);

            let maps = await loadSavedMaps();
            if (!isExploringRef.current) return;

            let result: any = null;

            // Attempt AI call with one retry on JSON parse failure
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    if (aiProvider === 'gemini') {
                        result = await gemini.exploreScreen(simplifiedXml, b64, apiKey, model, lang, maps, explorer.getLogs());
                    } else if (aiProvider === 'openai') {
                        result = await openai.exploreScreen(simplifiedXml, b64, apiKey, model, lang, maps, explorer.getLogs());
                    } else if (aiProvider === 'claude') {
                        result = await claude.exploreScreen(simplifiedXml, b64, apiKey, model, lang, maps, explorer.getLogs());
                    }
                    break; // Success
                } catch (parseError: any) {
                    if (attempt === 0 && parseError.message?.includes('JSON')) {
                        explorer.addLog(`AI returned malformed JSON. Retrying... (${parseError.message.substring(0, 80)})`);
                        setExplorationLogs([...explorer.getLogs()]);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        if (!isExploringRef.current) return;
                        continue;
                    }
                    throw parseError;
                }
            }

            if (!isExploringRef.current) return;
            if (!result) throw new Error("AI returned no exploration result");

            // 3. Auto-Mapping
            const aiScreen = result.screen;
            // The AI returns short_id as 'id'. We need to convert it back to XPath for permanent storage
            const aiElements = (result.elements || []).map((el: any) => {
                const node = findNodeByShortId(root, el.id);
                return {
                    ...el,
                    id: node ? generateXPath(node) : el.id // Store XPath for stability between app versions
                };
            });

            explorer.addLog(`AI mapped: ${aiScreen.name} (${aiScreen.type}) with ${aiElements.length} elements.`);
            explorer.addLog(`Rationale: ${result.rationale}`);

            // Step 3: Back-update previous screen's element with navigates_to
            const prevNav = explorer.getPreviousNavigation();
            if (prevNav && prevNav.targetId && prevNav.actionType === 'click' && aiScreen.name && aiScreen.name !== prevNav.screenName) {
                const prevMap = maps.find(m => m.name === prevNav.screenName);
                if (prevMap) {
                    // prevNav.targetId is the XPath of the clicked element
                    let updated = false;

                    const updatedElements = prevMap.elements.map(el => {
                        if (el.id === prevNav.targetId) {
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
                        await saveScreenMap(activeProfileId, updatedPrevMap);
                        explorer.addLog(`Back-updated "${prevNav.screenName}" → element navigates to "${aiScreen.name}"`);
                        // Refresh maps so subsequent logic sees the update
                        maps = await loadSavedMaps();
                    }
                }
            }
            explorer.clearPreviousNavigation();

            if (aiScreen.name) {
                // Smart Merging: Check for existing map with same name
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
                    explorer.addLog(`Merging AI insights into existing screen: "${existingMap.name}" (ID: ${existingMap.id}, ${existingMap.elements.length} elements)`);
                    
                    // 1. Merge Screen Metadata - Replacement Strategy (AI is responsible for incorporating old info)
                    mergedDescription = aiScreen.description || existingMap.description || "";
                    
                    // 2. Deep Merge Elements
                    // Start with existing elements and update them if AI saw them again
                    const aiElementsById = new Map<string, UIElementMap>(aiElements.map((el: UIElementMap) => [el.id, el]));
                    
                    mergedElements = existingMap.elements.map((existingEl: UIElementMap) => {
                        const aiEl = aiElementsById.get(existingEl.id);
                        if (!aiEl) return existingEl; // AI didn't see it this time, keep as is
                        
                        // AI saw it! update description and navigates_to
                        const updatedDesc = aiEl.description || existingEl.description || "";
                        
                        // Merge navigates_to if AI found a new destination
                        let mergedNav = existingEl.navigates_to;
                        if (aiEl.navigates_to && !existingEl.navigates_to) {
                            mergedNav = aiEl.navigates_to;
                        }
                        
                        return { 
                            ...existingEl, 
                            description: updatedDesc,
                            navigates_to: mergedNav
                        };
                    });
                    
                    // 3. Add genuinely new elements
                    const existingIds = new Set(existingMap.elements.map(e => e.id));
                    const genuinelyNew = aiElements.filter((el: UIElementMap) => !existingIds.has(el.id));
                    
                    if (genuinelyNew.length > 0) {
                        mergedElements = [...mergedElements, ...genuinelyNew];
                        explorer.addLog(`Added ${genuinelyNew.length} new elements discoverd by AI. Total: ${mergedElements.length}`);
                    }
                } else {
                    // New Screen: just use AI results
                    mergedDescription = aiScreen.description || '';
                    mergedElements = aiElements;

                    // Enforce unique layout positions (left-to-right flow)
                    const occupiedPositions = new Set<string>();
                    maps.forEach(m => {
                        if (m.layout) occupiedPositions.add(`${m.layout.gridX},${m.layout.gridY}`);
                    });

                    if (aiScreen.layout && !occupiedPositions.has(`${aiScreen.layout.gridX},${aiScreen.layout.gridY}`)) {
                        resolvedLayout = aiScreen.layout;
                    } else {
                        // Find nearest unique position (expand right, then down)
                        let gx = aiScreen.layout?.gridX ?? 0;
                        let gy = aiScreen.layout?.gridY ?? 0;
                        while (occupiedPositions.has(`${gx},${gy}`)) {
                            gx++;
                            if (gx > 20) { gx = 0; gy++; }
                        }
                        resolvedLayout = { gridX: gx, gridY: gy };
                        explorer.addLog(`Layout positioning: ${aiScreen.name} placed at (${gx}, ${gy})`);
                    }
                }

                const map: ScreenMap = {
                    id: existingMap?.id || aiScreen.name.toLowerCase().replace(/\s+/g, '_'),
                    name: aiScreen.name,
                    // Preserve existing metadata: user or previous AI may have added important context
                    type: existingMap?.type || aiScreen.type || 'screen',
                    description: mergedDescription || undefined,
                    tags: [...new Set([...(existingMap?.tags || []), ...(aiScreen.tags || [])])],
                    elements: mergedElements,
                    base64_preview: b64,
                    layout: resolvedLayout
                };

                await saveScreenMap(activeProfileId, map);
                explorer.markScreenVisited(aiScreen.name);

                // Update UI State if it's the current screen we're looking at
                setScreenName(aiScreen.name);
                setScreenType(map.type as any);
                setScreenDescription(map.description || "");
                setScreenTags(map.tags || []);
                setMappedElements(mergedElements);
                
                if (aiScreen.layout) {
                    explorer.addLog(`AI suggested layout for ${aiScreen.name}: (${aiScreen.layout.gridX}, ${aiScreen.layout.gridY})`);
                }
            }

            // 4. Loop Detection — force escape if a screen is visited too many times
            //    Only triggers when the AI tries a REPEATED action on the same screen
            if (aiScreen.name) {
                const next = result.nextAction as ExplorationAction;
                const actionFingerprint = `${aiScreen.name}:${next.type}:${next.targetId || 'none'}`;
                const visitCount = explorer.trackScreenVisit(aiScreen.name, actionFingerprint);
                if (visitCount >= 4) {
                    explorer.addLog(`Loop detected: screen "${aiScreen.name}" visited ${visitCount} times with repeated actions. Forcing back to escape.`);
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });

                    if (!isExploringRef.current) return;
                    setExplorationLogs([...explorer.getLogs()]);
                    explorationTimeoutRef.current = setTimeout(runExplorationStep, 1500);
                    return;
                }
            }

            // 5. Navigation
            const next = result.nextAction as ExplorationAction;
            if (next.type === 'finish') {
                explorer.addLog("Exploration finished by AI.");
                stopExploration("Finished");
                return;
            } else if (next.type === 'back') {
                explorer.addLog("Navigating back...");
                explorer.resetSwipeCount();
                explorer.clearPreviousNavigation(); // Back doesn't create a connection
                await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });
            } else if (next.type === 'click' && next.targetId) {
                explorer.addLog(`Clicking element: ${next.targetId} (${next.details || 'no details'})`);
                explorer.resetSwipeCount();

                // Use findNodeByShortId to resolve targetId to coordinates
                const targetNode = findNodeByShortId(root, next.targetId);

                if (targetNode && targetNode.bounds) {
                    const centerX = Math.round(targetNode.bounds.x + targetNode.bounds.w / 2);
                    const centerY = Math.round(targetNode.bounds.y + targetNode.bounds.h / 2);
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'tap', String(centerX), String(centerY)] });
                    addTapAnimation(centerX, centerY);
                    // Record this click so next step can set navigates_to on this element
                    const clickedXPath = generateXPath(targetNode);
                    explorer.setPreviousNavigation(aiScreen.name, clickedXPath, 'click');
                } else {
                    explorer.addLog(`Could not find coordinates for element (ShortID: ${next.targetId}). Trying back.`);
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });
                }
            } else if (next.type === 'swipe') {
                const swipeDirection = next.direction || 'down';
                const currentSwipes = explorer.getConsecutiveSwipes();

                // Compute snapshot of visible elements using node IDs
                const snapshotIds: string[] = [];
                const extractIds = (node: any) => {
                    if (node && node.bounds) snapshotIds.push(node.short_id || node.id || "?");
                    if (node.children) node.children.forEach(extractIds);
                };
                extractIds(root);
                const currentSnapshot = snapshotIds.join(",");

                if (currentSwipes > 0 && explorer.getPreviousElementsSnapshot() === currentSnapshot) {
                    explorer.addLog(`Swipe ${swipeDirection} on ${next.targetId || 'screen'} produced no new elements. Aborting swipe repetition.`);
                    explorer.resetSwipeCount();
                    explorer.addLog("Navigating back to find new elements...");
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });

                    if (!isExploringRef.current) return;
                    setExplorationLogs([...explorer.getLogs()]);
                    explorationTimeoutRef.current = setTimeout(runExplorationStep, 1000);
                    return;
                }

                if (currentSwipes >= 10) {
                    explorer.addLog(`Max swipe limits reached (10). Forcing navigation back.`);
                    explorer.resetSwipeCount();
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '4'] });

                    if (!isExploringRef.current) return;
                    setExplorationLogs([...explorer.getLogs()]);
                    explorationTimeoutRef.current = setTimeout(runExplorationStep, 1000);
                    return;
                }

                explorer.addLog(`Swiping ${swipeDirection} on: ${next.targetId || 'screen'} (${next.details || 'no details'}) [Attempt ${currentSwipes + 1}]`);

                // Resolve swipe bounds: use targetId if provided, otherwise use full screen
                let swipeBounds: { x: number; y: number; w: number; h: number } | null = null;

                if (next.targetId) {
                    const targetNode = findNodeByShortId(root, next.targetId);
                    if (targetNode && targetNode.bounds) {
                        swipeBounds = targetNode.bounds;
                    }
                }

                // Fallback: use root node bounds or screen dimensions
                if (!swipeBounds && root && root.bounds) {
                    swipeBounds = root.bounds;
                }

                if (swipeBounds) {
                    const { x, y, w, h } = swipeBounds;
                    let startX = x + w / 2;
                    let startY = y + h / 2;
                    let endX = startX;
                    let endY = startY;

                    const offsetHand = 0.4; // Swipe 40% of container size
                    // ADB swipe = finger movement direction, which is OPPOSITE of scroll direction.
                    // "scroll down" (see content below) = finger swipes UP (startY > endY)
                    // "scroll up" (see content above) = finger swipes DOWN (startY < endY)
                    if (swipeDirection === 'down') { endY = startY - (h * offsetHand); }
                    else if (swipeDirection === 'up') { endY = startY + (h * offsetHand); }
                    else if (swipeDirection === 'right') { endX = startX - (w * offsetHand); }
                    else if (swipeDirection === 'left') { endX = startX + (w * offsetHand); }

                    await invoke('run_adb_command', {
                        device: selectedDevice,
                        args: ['shell', 'input', 'swipe', String(Math.round(startX)), String(Math.round(startY)), String(Math.round(endX)), String(Math.round(endY)), "500"]
                    });
                    addSwipeAnimation(startX, startY, endX, endY);
                    explorer.registerSwipeAction(currentSnapshot);
                } else {
                    explorer.addLog(`Could not resolve swipe bounds. Using screen center fallback.`);
                    // Fallback: hardcoded screen center (1080p resolution). Finger direction is inverted:
                    // "scroll down" = finger goes UP (1200 → 600), "scroll up" = finger goes DOWN (1200 → 1800)
                    const fallbackStartY = 1200;
                    const fallbackEndY = swipeDirection === 'down' ? 600 : 1800;
                    await invoke('run_adb_command', {
                        device: selectedDevice,
                        args: ['shell', 'input', 'swipe', '540', String(fallbackStartY), '540', String(fallbackEndY), "500"]
                    });
                    explorer.registerSwipeAction(currentSnapshot);
                }
            } else if (next.type === 'type_text' && next.targetId && next.text) {
                explorer.addLog(`Typing text on: ${next.targetId} -> "${next.text}" (${next.details || 'filling input field'})`);
                explorer.resetSwipeCount();

                // First tap the input field to focus it
                const targetNode = findNodeByShortId(root, next.targetId);
                if (targetNode && targetNode.bounds) {
                    const centerX = Math.round(targetNode.bounds.x + targetNode.bounds.w / 2);
                    const centerY = Math.round(targetNode.bounds.y + targetNode.bounds.h / 2);
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'tap', String(centerX), String(centerY)] });
                    addTapAnimation(centerX, centerY);

                    // Small delay to let the keyboard appear
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Normalize text: strip diacritics and non-ASCII for ADB compatibility
                    const normalized = next.text
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '') // Strip diacritics (ã→a, é→e, ç→c)
                        .replace(/[^\x20-\x7E]/g, '');   // Remove remaining non-ASCII
                    const escapedText = normalized.replace(/ /g, '%s').replace(/[&|;<>()$`"'\\!]/g, '');
                    if (escapedText.length === 0) {
                        explorer.addLog(`Text input skipped: no valid ASCII characters in "${next.text}".`);
                    } else {
                        await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'text', escapedText] });
                    }

                    // Press Enter/Done to dismiss keyboard
                    await new Promise(resolve => setTimeout(resolve, 300));
                    await invoke('run_adb_command', { device: selectedDevice, args: ['shell', 'input', 'keyevent', '66'] });
                } else {
                    explorer.addLog(`Could not find input field (ShortID: ${next.targetId}). Skipping text input.`);
                }
            }

            if (!isExploringRef.current) return;
            setExplorationLogs([...explorer.getLogs()]);

            // 5. Schedule next step
            explorationTimeoutRef.current = setTimeout(runExplorationStep, 3000);

        } catch (error: any) {
            const errorMsg = error?.message || String(error) || 'Unknown error';
            console.error("Exploration error:", error);
            explorer.addLog(`Error during exploration: ${errorMsg}`);
            setExplorationLogs([...explorer.getLogs()]);
            stopExploration(`Error: ${errorMsg}`);
        }
    };

    const startExploration = async () => {
        if (!selectedDevice) return;
        explorerRef.current = new AutonomousExplorer(9999); // Indefinite
        setExplorationLogs([]);
        setIsExploring(true);
        isExploringRef.current = true;

        // Ensure stay on is enabled during exploration if not already
        if (!isStayOn) {
            try {
                await invoke('set_stay_on', { device: selectedDevice, enabled: true });
                setIsStayOn(true);
                explorerRef.current.addLog("Device screen set to STAY AWAKE.");
            } catch (e) {
                console.error("Failed to set stay_on during start", e);
            }
        }
    };

    useEffect(() => {
        if (isExploring && explorerRef.current && explorerRef.current.getState().currentStep === 0) {
            runExplorationStep();
        }
    }, [isExploring]);

    const handleExportPOM = async () => {
        if (!screenName || mappedElements.length === 0) {
            feedback.toast.error(t('mapper.error.empty_map'));
            return;
        }
        const { generateRobotResource } = await import('@/lib/dashboard/pomGenerator');
        const content = generateRobotResource({
            id: screenName.toLowerCase().replace(/\s+/g, '_'),
            name: screenName,
            type: screenType,
            elements: mappedElements
        });

        const path = await save({
            filters: [{ name: 'Robot Framework Resource', extensions: ['robot'] }],
            defaultPath: `${screenName.toLowerCase().replace(/\s+/g, '_')}.robot`
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

        // Strategy: Open a folder dialog and save all files there.
        // Tauri's save dialog is for single files usually.
        // We can ask for a directory instead.
        const dir = await open({
            directory: true,
            multiple: false
        });

        if (dir && typeof dir === 'string') {
            for (const [fileName, content] of Object.entries(resources)) {
                const path = `${dir}/${fileName}`;
                await invoke('save_file', { path, content, append: false });
            }
            feedback.toast.success(t('mapper.feedback.saved'));
        }
    };

    // State for devices (REMOVED - Managed by Parent)
    const { sessions } = useTestSessions();
    // Only 'test' type sessions mark device as busy
    const busyDeviceIds = sessions.filter(s => s.status === 'running' && s.type === 'test').map(s => s.deviceUdid);

    // Derived State
    const selectedDevice = selectedDeviceId; // Prop-driven
    const isTestRunning = selectedDevice ? busyDeviceIds.includes(selectedDevice) : false;
    const prevTestRunning = useRef(isTestRunning);

    // Responsive State
    const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (!containerRef) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Increased threshold to 900px to ensure it collapses earlier
                setIsNarrow(entry.contentRect.width < 900);
            }
        });
        observer.observe(containerRef);
        return () => observer.disconnect();
    }, [containerRef]);


    const [loading, setLoading] = useState(false);

    const [copied, setCopied] = useState<string | null>(null);

    // Interaction State
    const [swipeStart, setSwipeStart] = useState<{ x: number, y: number } | null>(null);
    const [swipeStartTime, setSwipeStartTime] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const imgRef = useRef<HTMLImageElement>(null);

    // Animation State
    const [taps, setTaps] = useState<{ id: number, x: number, y: number }[]>([]);
    const [swipes, setSwipes] = useState<{ id: number, startX: number, startY: number, endX: number, endY: number }[]>([]);

    const addTapAnimation = (x: number, y: number) => {
        const id = Date.now();
        // Convert Device Coords -> CSS Coords for display
        if (!imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = rect.width / imgRef.current.naturalWidth;
        const scaleY = rect.height / imgRef.current.naturalHeight;

        setTaps(prev => [...prev, { id, x: x * scaleX, y: y * scaleY }]);
        setTimeout(() => setTaps(prev => prev.filter(t => t.id !== id)), 500);
    };

    const addSwipeAnimation = (startX: number, startY: number, endX: number, endY: number) => {
        const id = Date.now();
        if (!imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = rect.width / imgRef.current.naturalWidth;
        const scaleY = rect.height / imgRef.current.naturalHeight;

        setSwipes(prev => [...prev, {
            id,
            startX: startX * scaleX,
            startY: startY * scaleY,
            endX: endX * scaleX,
            endY: endY * scaleY
        }]);
        setTimeout(() => setSwipes(prev => prev.filter(s => s.id !== id)), 600);
    };

    // Main fetch logic
    useEffect(() => {
        if (!selectedDevice) {
            setScreenshot(null);
            setRootNode(null);
            setSelectedNode(null);
            prevTestRunning.current = isTestRunning;
            return;
        }

        const wasTestRunning = prevTestRunning.current;
        prevTestRunning.current = isTestRunning;

        if (isActive && !isTestRunning) {
            if (wasTestRunning) {
                // Device just finished test, give it a moment to recover (release resources/uiautomator)
                // before trying to dump XML, otherwise it fails often.
                const timer = setTimeout(refreshAll, 1500); // 1.5s delay
                return () => clearTimeout(timer);
            } else {
                // Only fetch if active, or if never loaded and just became active
                refreshAll();
            }
        }
    }, [selectedDevice, isActive, isTestRunning]);

    const refreshAll = async () => {
        if (!selectedDevice) return;
        setLoading(true);
        try {
            const b64 = await invoke<string>('get_screenshot', { deviceId: selectedDevice });
            setScreenshot(b64);

            const xml = await invoke<string>('get_xml_dump', { deviceId: selectedDevice });

            // Parse XML
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "",
                textNodeName: "_text"
            });
            const jsonObj = parser.parse(xml);
            // Transform
            const root = jsonObj.hierarchy ? transformXmlToTree(jsonObj.hierarchy) : transformXmlToTree(jsonObj);
            setRootNode(root);
            feedback.toast.success(t('mapper.feedback.updated'));

        } catch (e) {
            feedback.toast.error(t("mapper.update_error"), e);
        } finally {
            setLoading(false);
        }
    };

    const sendAdbInput = async (cmd: string) => {
        const args = ['shell', 'input', ...cmd.split(' ')];
        try {
            await invoke('run_adb_command', { device: selectedDevice, args });
            // Auto-refresh after input to show updated state
            setTimeout(refreshAll, 1500);
        } catch (e) {
            feedback.toast.error(t("mapper.input_error"), e);
        }
    };

    const getCoords = (e: React.MouseEvent<HTMLImageElement>) => {
        if (!imgRef.current) return null;
        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = imgRef.current.naturalWidth / rect.width;
        const scaleY = imgRef.current.naturalHeight / rect.height;
        return {
            x: Math.round((e.clientX - rect.left) * scaleX),
            y: Math.round((e.clientY - rect.top) * scaleY)
        };
    };

    const handleImageMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
        const coords = getCoords(e);
        if (coords) {
            setSwipeStart(coords);
            setSwipeStartTime(Date.now());
            setIsDragging(false);
        }
    };

    const handleImageMouseUp = (e: React.MouseEvent<HTMLImageElement>) => {
        if (swipeStart) {
            const end = getCoords(e);
            if (end && isDragging) {
                // Dragged -> Swipe
                const duration = swipeStartTime ? Math.max(100, Math.min(3000, Date.now() - swipeStartTime)) : 500;
                sendAdbInput(`swipe ${swipeStart.x} ${swipeStart.y} ${end.x} ${end.y} ${Math.floor(duration)}`);
                addSwipeAnimation(swipeStart.x, swipeStart.y, end.x, end.y);
            } else if (end && !isDragging) {
                // Not dragged -> Select
                processMouseInteraction(e, false);
            }
        }
        setSwipeStart(null);
        setSwipeStartTime(null);
        setIsDragging(false);
    };

    const handleScreenshotDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
        const coords = getCoords(e);
        if (coords) {
            sendAdbInput(`tap ${coords.x} ${coords.y}`);
            addTapAnimation(coords.x, coords.y);
        }
    };

    const handleImageMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
        if (swipeStart) {
            const coords = getCoords(e);
            if (coords) {
                const dist = Math.sqrt(Math.pow(coords.x - swipeStart.x, 2) + Math.pow(coords.y - swipeStart.y, 2));
                if (dist > 10) setIsDragging(true);
            }
        }
        processMouseInteraction(e, true);
    };

    const [availableNodes, setAvailableNodes] = useState<InspectorNode[]>([]);

    const processMouseInteraction = (e: React.MouseEvent<HTMLImageElement>, isHover: boolean) => {
        if (!rootNode || !imgRef.current) return false;
        const coords = getCoords(e);
        if (!coords) return false;

        const candidates = findNodesAtCoords(rootNode, coords.x, coords.y);
        if (candidates.length === 0) return false;

        const best = candidates[0];

        if (isHover) {
            if (best !== hoveredNode) setHoveredNode(best);
        } else {
            // Click Logic: Find all nodes with EXACT same bounds as best
            const exactMatches = candidates.filter((c: InspectorNode) =>
                c.bounds && best.bounds &&
                c.bounds.x === best.bounds.x &&
                c.bounds.y === best.bounds.y &&
                c.bounds.w === best.bounds.w &&
                c.bounds.h === best.bounds.h
            );

            // Prioritization Logic
            const getPriority = (node: InspectorNode): number => {
                const attr = node.attributes || {};

                // 1. Accessibility ID / Content Desc
                if (attr['content-desc']) return 60;

                // 2. Resource ID
                if (attr['resource-id']) return 50;

                // 3. Text
                if (attr['text']) return 40;

                // 4. Clickable
                if (attr['clickable'] === 'true') return 30;

                // 5. ScrollView (Check class or tag)
                const isScrollView = (node.tagName && node.tagName.includes('ScrollView')) ||
                    (attr['class'] && attr['class'].includes('ScrollView'));
                if (isScrollView) return 20;

                // 6. Others
                return 10;
            };

            // Sort Descending (Higher priority first -> Left in tabs)
            exactMatches.sort((a, b) => getPriority(b) - getPriority(a));

            setAvailableNodes(exactMatches);
            setSelectedNode(exactMatches[0]);
        }
        return true;
    };

    const copyToClipboard = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };

    const getHighlighterStyle = (node: InspectorNode | null, color: string) => {
        if (!node || !node.bounds || !imgLayout || !rootNode) return {};

        const { width: dispWidth, height: dispHeight, naturalWidth, naturalHeight } = imgLayout;

        const xmlWidth = rootNode.bounds?.w || naturalWidth;
        const xmlHeight = rootNode.bounds?.h || naturalHeight;

        const transformedBounds = transformBounds(
            node.bounds,
            xmlWidth,
            xmlHeight,
            naturalWidth,
            naturalHeight
        );

        const scaleX = dispWidth / naturalWidth;
        const scaleY = dispHeight / naturalHeight;

        return {
            left: (transformedBounds.x * scaleX),
            top: (transformedBounds.y * scaleY),
            width: transformedBounds.w * scaleX,
            height: transformedBounds.h * scaleY,
            borderColor: color,
            display: 'block'
        };
    };

    return (
        <div ref={setContainerRef} className="flex-1 min-h-[700px] flex flex-col space-y-4">
            {!selectedDevice ? (
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
                        <span className={clsx(isNarrow && "hidden")}>{t('mapper.flowchart.open', 'Open Flowchart')}</span>
                    </Button>
                </div>
            ) : isTestRunning ? (
                <div className="h-full flex-1 flex flex-col items-center justify-center text-on-surface-variant/80 text-sm">
                    <Scan size={32} className="opacity-20 mb-2" />
                    <p>{t('mapper.status.paused_test', 'Mapper disabled during test')}</p>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                            loadSavedMaps();
                            setIsFlowchartOpen(true);
                        }}
                        className="flex items-center gap-2 mt-4 px-3 py-1.5 bg-transparent border border-primary text-primary hover:bg-primary/90 hover:text-surface rounded-2xl transition-colors shadow-sm text-sm font-medium"
                        title={t('mapper.flowchart.open', 'Open Flowchart')}
                    >
                        <GitGraph size={16} />
                        <span className={clsx(isNarrow && "hidden")}>{t('mapper.flowchart.open', 'Open Flowchart')}</span>
                    </Button>
                </div>
            ) : (
                <>
                    {/* Toolbar */}
                    <Section
                        title={t('mapper.title', 'Mapper')}
                        icon={Scan}
                        variant="transparent"
                        className="p-0"
                        status={
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2">
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider",
                                        screenshot ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                                    )}>
                                        {screenshot ? t('mapper.status.ready') : (loading ? t('mapper.status.fetching') : t('mapper.status.loading'))}
                                    </span>
                                </div>
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
                                    title={t('mapper.action.export_project_pom', 'Export Project POM')}
                                >
                                    <FileStack size={18} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleImport}
                                    className="p-1.5 hover:bg-primary/10 hover:text-primary rounded text-on-surface-variant/80 transition-all"
                                    title={t('mapper.flowchart.import', 'Import Flow')}
                                >
                                    <Download size={18} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleExport}
                                    className="p-1.5 hover:bg-primary/10 hover:text-primary rounded text-on-surface-variant/80 transition-all"
                                    title={t('mapper.flowchart.export', 'Export Flow')}
                                >
                                    <Upload size={18} />
                                </Button>
                            </div>
                        }
                        actions={
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={refreshAll}
                                    disabled={loading}
                                    className={clsx(
                                        "flex items-center gap-2 px-3 py-1.5 bg-surface-variant/30 border border-outline-variant/30 rounded-2xl hover:bg-surface/50 text-sm font-medium transition-colors disabled:opacity-50",
                                        loading && "cursor-wait"
                                    )}
                                    title={t('mapper.refresh')}
                                >
                                    {loading ? <ExpressiveLoading size="xsm" variant="circular" /> : <RefreshCw size={16} />}
                                    <span className={clsx(isNarrow && "hidden")}>{t('mapper.refresh')}</span>
                                </Button>
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
                                    <span className={clsx(isNarrow && "hidden")}>{t('mapper.flowchart.open', 'Open Flowchart')}</span>
                                </Button>
                            </>
                        }
                    >
                    </Section>

                    <div className="flex-1 grid grid-cols-[auto_1fr] min-h-0 overflow-hidden mt-0 mb-0 py-0">
                        <div className="flex flex-col items-center justify-center overflow-hidden relative max-w-[48vw] bg-transparent px-2 py-0 mb-0 mt-0">
                            {screenshot ? (
                                <div className="relative inline-block shadow-2xl rounded-lg border border-outline-variant/30 flex-shrink-0 mb-2">
                                    {loading && <GestureOverlay />}
                                    <img
                                        ref={imgRef}
                                        src={`data:image/png;base64,${screenshot}`}
                                        alt="Device Screenshot"
                                        className="block w-auto h-auto max-w-full max-h-[600px] select-none rounded-lg"
                                        onLoad={(e) => {
                                            const img = e.currentTarget;
                                            setImgLayout({
                                                width: img.clientWidth,
                                                height: img.clientHeight,
                                                naturalWidth: img.naturalWidth,
                                                naturalHeight: img.naturalHeight
                                            });
                                        }}
                                        onMouseMove={handleImageMouseMove}
                                        onMouseDown={handleImageMouseDown}
                                        onMouseUp={handleImageMouseUp}
                                        onDoubleClick={handleScreenshotDoubleClick}
                                        draggable={false}
                                    />
                                    {/* Animation Layers */}
                                    {taps.map(tap => (
                                        <div
                                            key={tap.id}
                                            className="absolute rounded-full bg-primary/30 border-2 border-primary animate-ping pointer-events-none"
                                            style={{ left: tap.x - 20, top: tap.y - 20, width: 40, height: 40 }}
                                        />
                                    ))}
                                    {swipes.map(swipe => (
                                        <svg key={swipe.id} className="absolute top-0 left-0 w-full h-full pointer-events-none z-30">
                                            <line
                                                x1={swipe.startX} y1={swipe.startY}
                                                x2={swipe.endX} y2={swipe.endY}
                                                stroke="var(--color-primary)"
                                                strokeWidth="4"
                                                strokeDasharray="8 4"
                                                className="animate-pulse"
                                            />
                                        </svg>
                                    ))}
                                    <div
                                        className="absolute border-2 border-info-container/80 pointer-events-none transition-all duration-75 z-10"
                                        style={{ ...getHighlighterStyle(hoveredNode, '#60a5fa'), display: hoveredNode?.bounds ? 'block' : 'none' }}
                                    />
                                    <div
                                        className="absolute border-2 border-error pointer-events-none z-20"
                                        style={{ ...getHighlighterStyle(selectedNode, '#ef4444'), display: selectedNode?.bounds ? 'block' : 'none' }}
                                    />
                                </div>
                            ) : (
                                <div className="text-on-surface/80 flex flex-col items-center">
                                    {loading ? <ExpressiveLoading size="lg" variant="circular" className="mb-2" /> : <Maximize size={32} className="mb-2 opacity-50" />}
                                    <p>{loading ? t('mapper.status.loading') : t('mapper.status.no_screenshot')}</p>
                                </div>
                            )}
                            <Button
                                variant={isExploring ? "danger" : "primary"}
                                size="sm"
                                onClick={isExploring ? () => stopExploration("User stopped") : startExploration}
                                className={clsx(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-2xl transition-all shadow-sm text-sm font-medium mb-0",
                                    isExploring ? "bg-error text-surface hover:bg-error/80" : "bg-primary/10 border border-primary text-primary hover:bg-primary hover:text-surface"
                                )}
                                title={isExploring ? t('mapper.exploration.stop') : t('mapper.exploration.start')}
                            >
                                {isExploring ? <Square size={16} fill="currentColor" /> : <Sparkles size={16} stroke="currentColor" />}
                                <span className={clsx(isNarrow && "hidden")}>
                                    {isExploring ? t('mapper.exploration.stop') : t('mapper.exploration.start')}
                                </span>
                            </Button>
                        </div>

                        {/* Properties Panel */}
                        <div className="bg-surface border border-outline-variant/30 rounded-2xl flex flex-col overflow-hidden shadow-sm flex-1">
                            {/* Screen Settings */}
                            <div className="p-4 border-t border-outline-variant/30 bg-surface/50 space-y-3">
                                <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-start">
                                    <Combobox
                                        label={t('mapper.screen_name')}
                                        value={screenName}
                                        onChange={setScreenName}
                                        options={savedMaps.map(m => m.name)}
                                        placeholder={t('mapper.placeholder.screen_name')}
                                    />
                                    <div className="w-56 flex items-end gap-1">
                                        <div className="flex-1">
                                            <TagInput
                                                label={t('mapper.screen_tags')}
                                                tags={screenTags}
                                                assistant={
                                                    <AiButton
                                                        isLoading={isAISuggestingTags}
                                                        onClick={handleAISuggestTags}
                                                        label={t('mapper.action.ai_suggest_tags')}
                                                        variant="ghost"
                                                        className="mb-0 mr-2 h-3 p-0 text-[8px]"
                                                    />
                                                }
                                                onChange={setScreenTags}
                                                suggestions={[...new Set(savedMaps.flatMap(m => m.tags || []))]}
                                                placeholder={t('mapper.placeholder.screen_tags')}
                                            />
                                        </div>
                                    </div>
                                    <div className="w-32">
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
                                <div className="px-4 pb-2">
                                    <Textarea
                                        label={t('mapper.input.screen_description')}
                                        value={screenDescription}
                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setScreenDescription(e.target.value)}
                                        placeholder={t('mapper.placeholder.screen_description')}
                                        className="h-16"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => { handleSaveScreen(); refreshAll(); }} variant="primary" className="hover:bg-secondary-container">
                                        <Save size={16} className="mr-2" /> {t('mapper.action.save_screen')}
                                    </Button>
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
                                        <Button variant="ghost" size="icon" onClick={() => setShowLoadMenu(!showLoadMenu)}><FileClock size={16} /></Button>
                                        {showLoadMenu && (
                                            <div className="absolute top-full left-0 mt-2 w-80 bg-surface rounded-xl shadow-xl border border-outline-variant/30 overflow-hidden z-[100] flex flex-col max-h-80">
                                                <div className="p-2 border-b border-outline-variant/30 bg-surface-variant/5 flex flex-col gap-2">
                                                    <div className="px-1 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">
                                                        {t('mapper.saved_screens')}
                                                    </div>
                                                    <SegmentedControl
                                                        value={screenListMode}
                                                        onChange={setScreenListMode}
                                                        options={[
                                                            { value: 'all', label: t('mapper.grouping.all_screens', 'All Screens') },
                                                            { value: 'tags', label: t('mapper.grouping.by_tags', 'By Tags') }
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
                                                            const groupedEntries = groupScreensByTags(savedMaps, t('mapper.grouping.no_tags', 'No Tags'));

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
                                            size="icon"
                                            onClick={() => setShowElementsMenu(!showElementsMenu)}
                                            className={clsx(showElementsMenu ? "text-primary dark:text-primary/80 bg-primary/10" : "text-on-surface-variant/80")}
                                            title={t('mapper.saved_elements', 'Saved Elements')}
                                        >
                                            <FileClock size={16} />
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
                                    <div className="flex gap-2">
                                        <Button onClick={saveElementMapping} variant="primary" size="sm" className="hover:bg-secondary-container">
                                            <FileInput size={16} className="mr-2" />
                                            {mappedElements.find(e => e.id === currentElement.id) ? t('mapper.action.update') : t('mapper.action.add')}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-b border-outline-variant/30 shrink-0 bg-surface/50 pr-2">
                                {availableNodes.length > 1 ? (
                                    <div className="flex overflow-x-auto custom-scrollbar flex-1">
                                        {availableNodes.map((node) => (
                                            <button
                                                key={node.id}
                                                onClick={() => setSelectedNode(node)}
                                                className={clsx(
                                                    "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                                    selectedNode === node
                                                        ? "border-primary text-primary dark:text-primary/80 bg-surface-variant/30"
                                                        : "border-transparent text-on-surface-variant/80 hover:text-on-surface-variant/80 hover:bg-surface-variant/30"
                                                )}
                                            >
                                                {node.tagName}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="px-4 py-3 text-sm font-semibold text-on-surface-variant/80 flex-1">
                                        {t('mapper.properties')}
                                    </div>
                                )}
                                {selectedNode && (
                                    <button
                                        onClick={() => {
                                            setSelectedNode(null);
                                            setAvailableNodes([]);
                                        }}
                                        className="p-1.5 text-on-surface/80 hover:text-error hover:bg-error-container/10 rounded-2xl transition-colors ml-2"
                                    >
                                        <X size={16} />
                                    </button>
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
                title={t('mapper.confirm.delete_title', 'Delete Screen Map?')}
                description={t('mapper.confirm.delete_desc', 'Are you sure you want to delete this screen map? This action cannot be undone.')}
                variant="danger"
                confirmText={t('mapper.action.delete')}
            />

            {/* AI Exploration Log Panel */}
            {explorationLogs.length > 0 && (
                <div className={clsx(
                    "fixed bottom-6 right-6 w-96 bg-surface p-4 border border-outline-variant/30 rounded-2xl shadow-2xl z-[150] transition-all flex flex-col gap-3",
                    !isExploring && explorationLogs.length > 0 ? "opacity-90 grayscale-[0.5]" : "opacity-100"
                )}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={clsx("w-2 h-2 rounded-full", isExploring ? "bg-success animate-pulse" : "bg-on-surface-variant/30")} />
                            <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                                {isExploring ? t('mapper.exploration.active', 'AI Exploring...') : t('mapper.exploration.summary', 'Exploration Ended')}
                            </h4>
                        </div>
                        <div className="flex gap-1">
                            {!isExploring && (
                                <Button variant="ghost" size="icon" onClick={() => setExplorationLogs([])} className="h-6 w-6">
                                    <X size={14} />
                                </Button>
                            )}
                        </div>
                        {isExploring && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={toggleStayOn}
                                className={clsx("flex items-center gap-2 px-3 py-1.5 rounded-2xl transition-all", isStayOn ? "bg-warning/20 text-warning" : "text-on-surface-variant/60 hover:bg-surface-variant/30")}
                                title={t('mapper.action.toggle_stay_awake', 'Toggle Keep Screen Awake')}
                            >
                                {isStayOn ? <Eye size={16} stroke="currentColor" /> : <EyeClosed size={16} stroke="currentColor" />}
                            </Button>
                        )}
                    </div>
                    <div
                        ref={logScrollRef}
                        onScroll={onExplorationScroll}
                        className="bg-surface-variant/10 rounded-xl p-3 border border-outline-variant/10 overflow-y-auto max-h-60 custom-scrollbar flex flex-col gap-1"
                    >
                        {explorationLogs.map((log, i) => (
                            <div key={i} className="text-[10px] font-mono text-on-surface-variant/80 border-b border-outline-variant/5 pb-1 last:border-0">
                                {log}
                            </div>
                        ))}
                        {isExploring && <div className="flex items-center gap-2 text-[10px] text-primary animate-pulse mt-1">
                            <ExpressiveLoading size="xsm" variant="circular" /> {t('mapper.exploration.thinking', 'Thinking...')}
                        </div>}
                    </div>
                </div>
            )}
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
                        <button
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
                            {n.attributes['resource-id'] && <span className="ml-1 text-primary dark:text-primary/80">resource-id="{n.attributes['resource-id'].split('/').pop()}"</span>}
                            {!n.attributes['resource-id'] && n.attributes['content-desc'] && <span className="ml-1 text-on-success-container/10">content-desc="{n.attributes['content-desc'].substring(0, 15)}..."</span>}
                        </button>
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
