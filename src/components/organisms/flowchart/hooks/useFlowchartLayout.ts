import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ScreenMap, FlowchartLayout, LayoutEdge } from '@/lib/types';
import { loadFlowchartLayout, deleteFlowchartLayout, saveScreenMap } from '@/lib/dashboard/mapperPersistence';
import { feedback } from '@/lib/feedback';
import { useTranslation } from 'react-i18next';
import { reorganizeFlowchartLayout as reorganizeWithGemini } from '@/lib/dashboard/gemini';
import { reorganizeFlowchartLayout as reorganizeWithOpenAI } from '@/lib/dashboard/openai';
import { reorganizeFlowchartLayout as reorganizeWithClaude } from '@/lib/dashboard/claude';
import { reorganizeFlowchartLayout as reorganizeWithClaudeCode } from '@/lib/dashboard/claudeCode';
import { reorganizeFlowchartLayout as reorganizeWithAntigravity } from '@/lib/dashboard/antigravityCode';
import { getAiContext } from '@/lib/dashboard/historyAnalysisUtils';


interface UseFlowchartLayoutProps {
    maps: ScreenMap[];
    activeProfileId: string;
    onRefresh?: () => void;
    settings: any;
    isOpen: boolean;
}

export function useFlowchartLayout({ maps = [], activeProfileId, onRefresh, settings, isOpen }: UseFlowchartLayoutProps) {
    const { t } = useTranslation();
    const [layout, setLayout] = useState<FlowchartLayout>({ version: 1, nodes: {}, edges: {} });
    const [loading, setLoading] = useState(true);
    const [isDirty, setIsDirty] = useState(false);
    const [isReorganizing, setIsReorganizing] = useState(false);
    const [missedScreens, setMissedScreens] = useState<string[]>([]);
    
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const cancelReorganizeLayout = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsReorganizing(false);
    }, []);
    const mappingsPath = settings.paths?.mappings;

    const mapsRef = useRef(maps);
    mapsRef.current = maps;

    const loadLayout = useCallback(async () => {
        setLoading(true);
        try {
            const centralLayout = await loadFlowchartLayout(activeProfileId, mappingsPath);
            const newLayout: FlowchartLayout = { version: 1, nodes: {}, edges: {} };
            
            if (centralLayout) {
                newLayout.nodes = { ...centralLayout.nodes };
                newLayout.edges = { ...centralLayout.edges };
            }

            for (const map of (maps || [])) {
                if (map.layout) {
                    // Support both legacy {gridX, gridY} and new {node, edges} formats
                    if ('node' in map.layout) {
                        newLayout.nodes[map.name] = { ...map.layout.node };
                        if (map.layout.edges) {
                            Object.entries(map.layout.edges).forEach(([eId, eData]) => {
                                newLayout.edges[eId] = eData;
                            });
                        }
                    } else {
                        // Legacy format
                        const legacy = map.layout as unknown as { gridX: number, gridY: number };
                        newLayout.nodes[map.name] = { gridX: legacy.gridX, gridY: legacy.gridY };
                    }
                }
            }

            // --- AUTO-PLACEMENT FOR NEW SCREENS ---
            let nextX = 0;
            Object.values(newLayout.nodes).forEach(n => {
                if (n.gridX >= nextX) nextX = n.gridX + 1;
            });

            let addedNew = false;
            for (const map of (maps || [])) {
                if (!newLayout.nodes[map.name]) {
                    newLayout.nodes[map.name] = { gridX: nextX, gridY: 0 };
                    nextX++;
                    addedNew = true;
                }
            }

            if (addedNew) {
                setIsDirty(true);
            }

            setLayout(newLayout);
        } catch (error) {
            console.error('Failed to load flowchart layout:', error);
            feedback.toast.error(t('mapper.flowchart.load_error'));
        } finally {
            setLoading(false);
            setIsDirty(false);
        }
    }, [activeProfileId, maps, mappingsPath, t]);

    const loadedLayoutKeyRef = useRef<string | null>(null);
    const layoutLoadKey = `${activeProfileId}::${mappingsPath ?? ''}`;

    useEffect(() => {
        if (isOpen) {
            if (loadedLayoutKeyRef.current !== layoutLoadKey) {
                loadLayout();
                loadedLayoutKeyRef.current = layoutLoadKey;
            }
        } else {
            loadedLayoutKeyRef.current = null;
        }
    }, [isOpen, layoutLoadKey, loadLayout]);

    const saveLayout = useCallback(async (manual = true) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        
        try {
            const savePromises = (maps || []).map(async (map) => {
                const nodeLayout = layout.nodes[map.name];
                if (!nodeLayout) return;

                const mapEdges: Record<string, LayoutEdge> = {};
                const isEdgeOwnedByMap = (edgeId: string) => {
                    if (edgeId.includes('->')) {
                        const [source] = edgeId.split('->');
                        return source === map.name;
                    }
                    const [source] = edgeId.split('-');
                    return source === map.name;
                };
                Object.entries(layout.edges).forEach(([eId, eData]) => {
                    if (isEdgeOwnedByMap(eId)) {
                        mapEdges[eId] = eData;
                    }
                });

                await saveScreenMap(activeProfileId, {
                    ...map,
                    layout: { node: nodeLayout, edges: mapEdges }
                }, mappingsPath);
            });

            await Promise.all(savePromises);
            await deleteFlowchartLayout(activeProfileId, mappingsPath);

            setIsDirty(false);
            if (manual) feedback.toast.success(t('mapper.flowchart.save_success'));
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Failed to save layout:', error);
            if (manual) feedback.toast.error(t('mapper.flowchart.save_error'));
        }
    }, [layout, maps, activeProfileId, mappingsPath, t, onRefresh]);

    // Auto-save debounce
    useEffect(() => {
        if (isDirty) {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
                saveLayout(false);
            }, 5000); // Auto-save after 5 seconds of inactivity
        }
        return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    }, [isDirty, saveLayout]);

    const autoReorganizeLayout = useCallback(async (customPrompt?: string) => {
        if (isReorganizing) return;
        setIsReorganizing(true);
        setMissedScreens([]);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            // console.log("[Flowchart] Fetching AI context for layout...");
            const { context } = await getAiContext('flowchart_layout', { 
                profile_id: activeProfileId,
                custom_mappings_dir: mappingsPath
            });
            
            if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

            if (!context || context.trim() === "") {
                console.warn("[Flowchart] AI context is empty. Reorganization might fail or do nothing.");
            } else {
                // console.log("[Flowchart] AI Context acquired (length):", context.length);
            }

            const provider = settings.aiProvider || 'gemini';
            const language = settings.language || 'en';
            
            // console.log(`[Flowchart] Using provider: ${provider}`);

            let result;
            if (provider === 'openai') {
                const apiKey = settings.openaiApiKey;
                const model = settings.openaiModel || 'gpt-4o';
                result = await reorganizeWithOpenAI(context, apiKey, model, language, controller.signal, customPrompt);
            } else if (provider === 'claude') {
                const apiKey = settings.claudeApiKey;
                const model = settings.claudeModel || 'claude-3-5-sonnet-20240620';
                result = await reorganizeWithClaude(context, apiKey, model, language, controller.signal, customPrompt);
            } else if (provider === 'claude-code') {
                result = await reorganizeWithClaudeCode(context, settings.paths.automationRoot || '', language, undefined, customPrompt, settings.claudeCodeToken);
            } else if (provider === 'antigravity-cli') {
                result = await reorganizeWithAntigravity(context, settings.paths.automationRoot || '', language, undefined, customPrompt, settings.antigravityApiKey);
            } else {
                const apiKey = settings.geminiApiKey;
                const model = settings.geminiModel || 'gemini-1.5-pro';
                result = await reorganizeWithGemini(context, apiKey, model, language, controller.signal, customPrompt);
            }

            if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

            // console.log("[Flowchart] AI Reorganization result:", result);

            if (result && result.nodes) {
                setLayout(prev => {
                    const newNodes = { ...prev.nodes };
                    let changedCount = 0;
                    const changeDetails: Array<{ screen: string; from: { x: number; y: number } | null; to: { x: number; y: number } }> = [];

                    Object.entries(result.nodes).forEach(([name, coords]) => {
                        const oldCoord = prev.nodes[name];
                        const newX = (coords as any).gridX;
                        const newY = (coords as any).gridY;
                        
                        if (!oldCoord || oldCoord.gridX !== newX || oldCoord.gridY !== newY) {
                            changedCount++;
                            changeDetails.push({
                                screen: name,
                                from: oldCoord ? { x: oldCoord.gridX, y: oldCoord.gridY } : null,
                                to: { x: newX, y: newY }
                            });
                        }

                        newNodes[name] = {
                            gridX: newX,
                            gridY: newY
                        };
                    });

                    // console.log(`[Flowchart AI] Reorganized ${Object.keys(newNodes).length} nodes. Coordinates changed: ${changedCount}`);
                    // console.log("[Flowchart AI] Previous positions:", prev.nodes);
                    // console.log("[Flowchart AI] New positions proposed:", newNodes);
                    if (changeDetails.length > 0) {
                        console.log("[Flowchart AI] Changed elements details:", changeDetails);
                    } else {
                        console.log("[Flowchart AI] No coordinate values were modified by the AI suggestion. The AI layout proposal is identical to the current one.");
                    }

                    return {
                        ...prev,
                        nodes: newNodes,
                        version: (prev.version || 0) + 1
                    };
                });
                setIsDirty(true);
                if (result.missed) {
                    console.log("[Flowchart] Screens missed by AI:", result.missed);
                    setMissedScreens(result.missed);
                }
                feedback.toast.success(t('mapper.flowchart.reorganize_success'));
            } else {
                console.warn("[Flowchart] AI returned no nodes or invalid format:", result);
                throw new Error("AI returned no nodes or invalid format");
            }
        } catch (error: any) {
            if (error?.name === 'AbortError' || String(error).includes('abort')) {
                console.log('AI Reorganization was cancelled by the user.');
                feedback.toast.info(t('mapper.flowchart.reorganize_cancelled'));
                return;
            }
            console.error('AI Reorganization failed:', error);
            const errorMessage = error?.message || String(error);
            feedback.toast.error(`${t('mapper.flowchart.reorganize_error')}: ${errorMessage}`);
        } finally {
            setIsReorganizing(false);
            abortControllerRef.current = null;
        }
    }, [
        activeProfileId,
        isReorganizing,
        settings.aiProvider,
        settings.language,
        settings.openaiApiKey,
        settings.openaiModel,
        settings.claudeApiKey,
        settings.claudeModel,
        settings.geminiApiKey,
        settings.geminiModel,
        settings.antigravityApiKey,
        mappingsPath,
        settings.paths?.automationRoot,
        t
    ]);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        maps.forEach(m => { if (m.tags) m.tags.forEach(t => tags.add(t)); });
        return Array.from(tags).sort();
    }, [maps]);

    const gridBounds = useMemo(() => {
        const nodes = Object.values(layout.nodes);
        if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            minX = Math.min(minX, n.gridX); minY = Math.min(minY, n.gridY);
            maxX = Math.max(maxX, n.gridX); maxY = Math.max(maxY, n.gridY);
        });

        minX -= 5; minY -= 5; maxX += 15; maxY += 15;
        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }, [layout.nodes]);

    const handleClearAllCurvatures = useCallback(() => {
        setLayout(prev => {
            const newEdges: Record<string, LayoutEdge> = {};
            Object.keys(prev.edges).forEach(id => {
                newEdges[id] = { ...prev.edges[id], vertices: [] };
            });
            return { ...prev, edges: newEdges };
        });
        setIsDirty(true);
    }, []);

    return {
        layout,
        setLayout,
        loading,
        isDirty,
        setIsDirty,
        isReorganizing,
        missedScreens,
        allTags,
        gridBounds,
        saveLayout,
        autoReorganizeLayout,
        cancelReorganizeLayout,
        handleClearAllCurvatures
    };
}
