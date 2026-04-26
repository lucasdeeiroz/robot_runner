import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ScreenMap, FlowchartLayout, LayoutEdge } from '@/lib/types';
import { loadFlowchartLayout, deleteFlowchartLayout, saveScreenMap } from '@/lib/dashboard/mapperPersistence';
import { feedback } from '@/lib/feedback';
import { useTranslation } from 'react-i18next';
import { reorganizeFlowchartLayout as reorganizeWithGemini } from '@/lib/dashboard/gemini';
import { reorganizeFlowchartLayout as reorganizeWithOpenAI } from '@/lib/dashboard/openai';
import { reorganizeFlowchartLayout as reorganizeWithClaude } from '@/lib/dashboard/claude';
import { getAiContext } from '@/lib/dashboard/historyAnalysisUtils';


interface UseFlowchartLayoutProps {
    maps: ScreenMap[];
    activeProfileId: string;
    onRefresh?: () => void;
    settings: any;
}

export function useFlowchartLayout({ maps, activeProfileId, onRefresh, settings }: UseFlowchartLayoutProps) {
    const { t } = useTranslation();
    const [layout, setLayout] = useState<FlowchartLayout>({ version: 1, nodes: {}, edges: {} });
    const [loading, setLoading] = useState(true);
    const [isDirty, setIsDirty] = useState(false);
    const [isReorganizing, setIsReorganizing] = useState(false);
    const [missedScreens, setMissedScreens] = useState<string[]>([]);
    
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const mapsRef = useRef(maps);
    mapsRef.current = maps;

    const loadLayout = useCallback(async () => {
        setLoading(true);
        try {
            const centralLayout = await loadFlowchartLayout(activeProfileId);
            const newLayout: FlowchartLayout = { version: 1, nodes: {}, edges: {} };
            
            if (centralLayout) {
                newLayout.nodes = { ...centralLayout.nodes };
                newLayout.edges = { ...centralLayout.edges };
            }

            for (const map of maps) {
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
            for (const map of maps) {
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
    }, [activeProfileId, maps, t]);

    useEffect(() => {
        loadLayout();
    }, [loadLayout]);

    const saveLayout = useCallback(async (manual = true) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        
        try {
            const savePromises = maps.map(async (map) => {
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
                });
            });

            await Promise.all(savePromises);
            await deleteFlowchartLayout(activeProfileId);

            setIsDirty(false);
            if (manual) feedback.toast.success(t('mapper.flowchart.save_success'));
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Failed to save layout:', error);
            if (manual) feedback.toast.error(t('mapper.flowchart.save_error'));
        }
    }, [layout, maps, activeProfileId, t, onRefresh]);

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

        try {
            const { context } = await getAiContext('flowchart_layout', { profile_id: activeProfileId });
            const provider = settings.ai_provider || 'gemini';
            
            let result;
            const language = settings.language || 'en';

            if (provider === 'openai') {
                const apiKey = settings.openai_api_key;
                const model = settings.openai_model || 'gpt-4o';
                result = await reorganizeWithOpenAI(context, apiKey, model, language, undefined, customPrompt);
            } else if (provider === 'claude') {
                const apiKey = settings.claude_api_key;
                const model = settings.claude_model || 'claude-3-5-sonnet-20240620';
                result = await reorganizeWithClaude(context, apiKey, model, language, undefined, customPrompt);
            } else {
                const apiKey = settings.gemini_api_key;
                const model = settings.gemini_model || 'gemini-1.5-pro';
                result = await reorganizeWithGemini(context, apiKey, model, language, undefined, customPrompt);
            }

            if (result && result.nodes) {
                setLayout(prev => {
                    const newNodes = { ...prev.nodes };
                    Object.entries(result.nodes).forEach(([name, coords]) => {
                        newNodes[name] = {
                            gridX: (coords as any).gridX,
                            gridY: (coords as any).gridY
                        };
                    });

                    return {
                        ...prev,
                        nodes: newNodes,
                        version: (prev.version || 0) + 1
                    };
                });
                setIsDirty(true);
                if (result.missed) setMissedScreens(result.missed);
            }
        } catch (error) {
            console.error('AI Reorganization failed:', error);
            feedback.toast.error(t('mapper.flowchart.reorganize_error'));
        } finally {
            setIsReorganizing(false);
        }
    }, [
        activeProfileId,
        isReorganizing,
        settings.ai_provider,
        settings.language,
        settings.openai_api_key,
        settings.openai_model,
        settings.claude_api_key,
        settings.claude_model,
        settings.gemini_api_key,
        settings.gemini_model,
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
        handleClearAllCurvatures
    };
}
