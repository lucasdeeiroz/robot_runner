import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ScreenMap } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { exportMapperData, importMapperData } from '@/lib/dashboard/mapperPersistence';
import { feedback } from '@/lib/feedback';
import { save, open } from '@tauri-apps/plugin-dialog';
// import { toPng } from 'html-to-image'; // Removed in favor of dynamic toBlob
import { useSettings } from '@/lib/settings';

// Hooks
import { useFlowchartView } from './flowchart/hooks/useFlowchartView';
import { useFlowchartLayout } from './flowchart/hooks/useFlowchartLayout';
import { useFlowchartInteraction } from './flowchart/hooks/useFlowchartInteraction';

// Components
import { FlowchartHeader } from './flowchart/components/FlowchartHeader';
import { FlowchartCanvas } from './flowchart/components/FlowchartCanvas';
import { FlowchartSVG } from './flowchart/components/FlowchartSVG';
import { QuickConnectDialog } from './flowchart/components/QuickConnectDialog';
import { UnsavedChangesDialog } from './flowchart/components/UnsavedChangesDialog';
import { FlowNode } from './flowchart/FlowNode';
import { FlowEdgeLine, FlowEdgeControls } from './flowchart/FlowEdge';
import { FlowPort } from './flowchart/FlowPort';

import {
    NODE_PORTS
} from './flowchart/types';

interface FlowchartModalProps {
    isOpen: boolean;
    onClose: () => void;
    maps: ScreenMap[];
    onEditScreen?: (screenName: string) => void;
    onRefresh?: () => void;
    activeProfileId: string;
}

export function FlowchartModal({ isOpen, onClose, maps = [], onEditScreen, onRefresh, activeProfileId }: FlowchartModalProps) {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [filterTag, setFilterTag] = useState<string | null>(null);
    const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
    const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
    const [quickConnectData, setQuickConnectData] = useState<{ sourceNodeId: string; sourcePortId: string } | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    const [isSpacePressed, setIsSpacePressed] = useState(false);
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpacePressed(true); };
        const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpacePressed(false); };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    useEffect(() => {
        setShowUnsavedChangesModal(false);
        setIsQuickConnectOpen(false);
        setQuickConnectData(null);
    }, [isOpen]);

    const view = useFlowchartView(containerRef);
    const layoutHook = useFlowchartLayout({ maps, activeProfileId, onRefresh, settings, isOpen });
    const {
        layout, setLayout, isDirty, setIsDirty,
        isReorganizing, missedScreens, allTags, gridBounds,
        saveLayout, autoReorganizeLayout, handleClearAllCurvatures
    } = layoutHook;

    const prevReorganizingRef = useRef(isReorganizing);
    useEffect(() => {
        if (prevReorganizingRef.current && !isReorganizing) {
            view.centerView(layout.nodes);
        }
        prevReorganizingRef.current = isReorganizing;
    }, [isReorganizing, layout.nodes, view]);

    const interaction = useFlowchartInteraction({
        layout, setLayout, viewTransform: view.viewTransform,
        setOffset: view.setOffset, performZoom: view.performZoom,
        setIsDirty, containerRef,
        getPixelCoords: view.getPixelCoords, getPortCoords: view.getPortCoords,
        snapToLanes: view.snapToLanes, getClosestLane: view.getClosestLane
    });


    const matchesFilter = useCallback((screenName: string) => {
        if (!filterTag) return true;
        const map = maps.find(m => m.name === screenName);
        return map?.tags?.includes(filterTag) || false;
    }, [maps, filterTag]);

    const handleImport = async () => {
        const selected = await open({ filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (selected) {
            try {
                const { readTextFile } = await import('@tauri-apps/plugin-fs');
                const content = await readTextFile(selected as string);
                await importMapperData(activeProfileId, content, settings.paths?.mappings);
                feedback.toast.success(t('mapper.flowchart.import_success'));
                if (onRefresh) onRefresh();
            } catch (error) { feedback.toast.error(t('mapper.flowchart.import_error')); }
        }
    };

    const handleExport = async () => {
        const path = await save({ filters: [{ name: 'JSON', extensions: ['json'] }], defaultPath: 'mapper_backup.json' });
        if (path) {
            try {
                const { writeTextFile } = await import('@tauri-apps/plugin-fs');
                const content = await exportMapperData(activeProfileId, settings.paths?.mappings);
                await writeTextFile(path, content);
                feedback.toast.success(t('mapper.flowchart.export_success'));
            } catch (error) { feedback.toast.error(t('mapper.flowchart.export_error')); }
        }
    };

    const handleExportImage = async () => {
        if (!contentRef.current || isExporting) return;

        const { toBlob } = await import('html-to-image');
        
        setIsExporting(true);
        feedback.toast.info(t('mapper.flowchart.exporting_image'));

        // Use a small timeout to allow the toast and UI to update before heavy processing starts
        setTimeout(async () => {
            try {
                // Use toBlob for better memory handling with large images
                const blob = await toBlob(contentRef.current!, { 
                    backgroundColor: settings.theme === 'dark' ? '#0f1115' : '#ffffff',
                    pixelRatio: 2, // Higher quality
                    skipAutoScale: false,
                    style: {
                        transform: 'none', // Reset transform for capture
                        transformOrigin: '0 0'
                    }
                });

                if (!blob) throw new Error("Failed to generate image blob");

                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `flowchart-${activeProfileId}-${new Date().getTime()}.png`;
                link.href = url;
                link.click();
                
                // Clean up the URL object after a short delay
                setTimeout(() => URL.revokeObjectURL(url), 100);
                
                feedback.toast.success(t('mapper.flowchart.export_image_success'));
            } catch (error) { 
                console.error("Export Image Error:", error);
                feedback.toast.error(t('mapper.flowchart.export_image_error')); 
            } finally {
                setIsExporting(false);
            }
        }, 150);
    };

    // viewportBounds logic removed as it was unused

    const baseEdgeLayouts = useMemo(() => {
        const layouts: any[] = [];
        const seenEdgeIds = new Set<string>();
        (maps || []).forEach(sourceMap => {
            const sourceLayout = layout.nodes[sourceMap.name];
            if (!sourceLayout) return;
            const sourceOrigin = view.getPixelCoords(sourceLayout.gridX, sourceLayout.gridY);
            (sourceMap.elements || []).forEach(el => {
                const navigatesTo = el.navigates_to;
                if (!navigatesTo) return;
                let destinations: string[] = [];
                if (typeof navigatesTo === 'string') destinations = [navigatesTo];
                else if (Array.isArray(navigatesTo)) destinations = navigatesTo.map(d => typeof d === 'string' ? d : (d as any).destination).filter(Boolean);
                else if (navigatesTo && typeof navigatesTo === 'object') {
                    const dest = (navigatesTo as any).destination;
                    if (dest) destinations = [dest];
                }
                [...new Set(destinations)].forEach(targetName => {
                    const edgeId = `${sourceMap.name}-${el.name}-${targetName}`;
                    if (seenEdgeIds.has(edgeId)) return;
                    seenEdgeIds.add(edgeId);

                    const targetMap = maps.find(m => m.name === targetName);
                    if (!targetMap) return;
                    const targetLayout = layout.nodes[targetName];
                    if (!targetLayout) return;
                    const targetOrigin = view.getPixelCoords(targetLayout.gridX, targetLayout.gridY);
                    const edgeData = layout.edges[edgeId] || {};
                    const effectiveVertices = edgeData.vertices || [];

                    let startPoint = edgeData.sourceHandle
                        ? view.getPortCoords(sourceOrigin.x, sourceOrigin.y, edgeData.sourceHandle)
                        : view.getPortCoords(sourceOrigin.x, sourceOrigin.y, targetLayout.gridX >= sourceLayout.gridX ? 'right-3' : 'left-3');
                    let endPoint = edgeData.targetHandle
                        ? view.getPortCoords(targetOrigin.x, targetOrigin.y, edgeData.targetHandle)
                        : view.getPortCoords(targetOrigin.x, targetOrigin.y, targetLayout.gridX >= sourceLayout.gridX ? 'left-3' : 'right-3');

                    let points = [startPoint, ...effectiveVertices, endPoint];
                    if (effectiveVertices.length === 0) {
                        if (Math.abs(startPoint.x - endPoint.x) < 10 || Math.abs(startPoint.y - endPoint.y) < 10) points = [startPoint, endPoint];
                        else {
                            const midX = view.getClosestLane((startPoint.x + endPoint.x) / 2);
                            points = [startPoint, { x: midX, y: startPoint.y }, { x: midX, y: endPoint.y }, endPoint];
                        }
                    }
                    layouts.push({ edgeId, points, startPoint, endPoint, elName: el.name, sourceName: sourceMap.name, targetName });
                });
            });
        });
        return layouts;
    }, [maps, layout, filterTag, view]);

    const edgeLayouts = useMemo(() => {
        const dragState = interaction.state;
        const isDraggingSource = dragState.type === 'DRAGGING_SOURCE';
        const isDraggingTarget = dragState.type === 'DRAGGING_TARGET';
        if (!isDraggingSource && !isDraggingTarget) return baseEdgeLayouts;

        const dragEdgeId = dragState.id;
        return baseEdgeLayouts.map(e => {
            if (e.edgeId !== dragEdgeId) return e;

            let startPoint = e.startPoint;
            let endPoint = e.endPoint;

            if (isDraggingSource) {
                if (interaction.hoveredPort) {
                    const p = interaction.hoveredPort;
                    const node = layout.nodes[p.nodeId];
                    if (node) {
                        const nodeP = view.getPixelCoords(node.gridX, node.gridY);
                        startPoint = view.getPortCoords(nodeP.x, nodeP.y, p.portId);
                    }
                } else {
                    startPoint = interaction.cursorPos;
                }
            } else {
                if (interaction.hoveredPort) {
                    const p = interaction.hoveredPort;
                    const node = layout.nodes[p.nodeId];
                    if (node) {
                        const nodeP = view.getPixelCoords(node.gridX, node.gridY);
                        endPoint = view.getPortCoords(nodeP.x, nodeP.y, p.portId);
                    }
                } else {
                    endPoint = interaction.cursorPos;
                }
            }

            const edgeData = layout.edges[e.edgeId] || {};
            const effectiveVertices = edgeData.vertices || [];
            let points = [startPoint, ...effectiveVertices, endPoint];
            if (effectiveVertices.length === 0) {
                if (Math.abs(startPoint.x - endPoint.x) < 10 || Math.abs(startPoint.y - endPoint.y) < 10) points = [startPoint, endPoint];
                else {
                    const midX = view.getClosestLane((startPoint.x + endPoint.x) / 2);
                    points = [startPoint, { x: midX, y: startPoint.y }, { x: midX, y: endPoint.y }, endPoint];
                }
            }
            return { ...e, points, startPoint, endPoint };
        });
    }, [baseEdgeLayouts, interaction.state, interaction.hoveredPort, interaction.cursorPos, layout, view]);

    const sortedEdgeLayouts = useMemo(() => {
        if (!interaction.hoveredEdge) return edgeLayouts;
        return [...edgeLayouts].sort((a, b) => a.edgeId === interaction.hoveredEdge ? 1 : (b.edgeId === interaction.hoveredEdge ? -1 : 0));
    }, [edgeLayouts, interaction.hoveredEdge]);

    const portOccupancyMap = useMemo(() => {
        const occ: Record<string, Set<string>> = {};
        edgeLayouts.forEach(e => {
            const edgeData = layout.edges[e.edgeId] || {};
            const sHandle = edgeData.sourceHandle || (view.getPixelCoords(layout.nodes[e.sourceName]?.gridX, 0).x <= view.getPixelCoords(layout.nodes[e.targetName]?.gridX, 0).x ? 'right-3' : 'left-3');
            const tHandle = edgeData.targetHandle || (view.getPixelCoords(layout.nodes[e.sourceName]?.gridX, 0).x <= view.getPixelCoords(layout.nodes[e.targetName]?.gridX, 0).x ? 'left-3' : 'right-3');
            if (!occ[e.sourceName]) occ[e.sourceName] = new Set();
            occ[e.sourceName].add(sHandle);
            if (!occ[e.targetName]) occ[e.targetName] = new Set();
            occ[e.targetName].add(tHandle);
        });
        return occ;
    }, [edgeLayouts, layout.edges, layout.nodes, view]);

    // Maps each occupied port to its edge and whether it's the source or target side
    const portEdgeMap = useMemo(() => {
        const map: Record<string, { edgeId: string, isSource: boolean }> = {};
        edgeLayouts.forEach(e => {
            const edgeData = layout.edges[e.edgeId] || {};
            const sHandle = edgeData.sourceHandle || (view.getPixelCoords(layout.nodes[e.sourceName]?.gridX, 0).x <= view.getPixelCoords(layout.nodes[e.targetName]?.gridX, 0).x ? 'right-3' : 'left-3');
            const tHandle = edgeData.targetHandle || (view.getPixelCoords(layout.nodes[e.sourceName]?.gridX, 0).x <= view.getPixelCoords(layout.nodes[e.targetName]?.gridX, 0).x ? 'left-3' : 'right-3');
            const sKey = `${e.sourceName}::${sHandle}`;
            const tKey = `${e.targetName}::${tHandle}`;
            if (!map[sKey]) map[sKey] = { edgeId: e.edgeId, isSource: true };
            if (!map[tKey]) map[tKey] = { edgeId: e.edgeId, isSource: false };
        });
        return map;
    }, [edgeLayouts, layout.edges, layout.nodes, view]);

    const handleClose = () => { if (isDirty) setShowUnsavedChangesModal(true); else onClose(); };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[150000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                >
                    <motion.div
                        ref={contentRef}
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25, mass: 1 }}
                        className="relative bg-surface w-[90vw] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-outline-variant/30"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <FlowchartHeader
                            missedScreensCount={missedScreens.length}
                            isReorganizing={isReorganizing || isExporting}
                            onAutoReorganize={autoReorganizeLayout}
                            onImport={handleImport}
                            onExport={handleExport}
                            onSave={() => saveLayout()}
                            onClearCurvatures={handleClearAllCurvatures}
                            onExportImage={handleExportImage}
                            filterTag={filterTag}
                            setFilterTag={setFilterTag}
                            allTags={allTags}
                            onCenterView={() => view.centerView(layout.nodes)}
                            onZoom={view.performZoom}
                            scale={view.scale}
                            onClose={handleClose}
                        />

                        {(isReorganizing || isExporting) && (
                            <div className="absolute inset-0 z-[10000] bg-black/20 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-300">
                                <div className="bg-surface p-6 rounded-2xl shadow-xl border border-outline-variant/30 flex flex-col items-center gap-4">
                                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                    <div className="flex flex-col items-center gap-1 text-center">
                                        <span className="text-sm font-bold text-on-surface">
                                            {isReorganizing ? t('mapper.flowchart.reorganizing') : t('mapper.flowchart.exporting_image')}
                                        </span>
                                        <span className="text-[10px] text-on-surface-variant animate-pulse">{t('common.please_wait', 'Please wait...')}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <FlowchartCanvas
                            containerRef={containerRef}
                            contentRef={contentRef}
                            isDraggingCanvas={interaction.isDraggingCanvas}
                            isSpacePressed={isSpacePressed}
                            offset={view.offset}
                            scale={view.scale}
                            gridBounds={gridBounds}
                            onMouseDown={interaction.handleCanvasMouseDown}
                            onMouseMove={interaction.handleMouseMove}
                            onMouseUp={interaction.handleMouseUp}
                            onMouseLeave={interaction.handleMouseUp}
                            onWheel={interaction.handleWheel}
                        >
                            <FlowchartSVG zIndex={10}>
                                {sortedEdgeLayouts.map(e => (
                                    <FlowEdgeLine key={`${e.edgeId}-line`} edgeId={e.edgeId} points={e.points} isVisible={matchesFilter(e.sourceName) && matchesFilter(e.targetName)} isInteracting={interaction.state.type !== 'IDLE'} hoveredEdge={interaction.hoveredEdge} />
                                ))}
                            </FlowchartSVG>
                            <FlowchartSVG zIndex={50}>
                                {sortedEdgeLayouts.map(e => (
                                    <FlowEdgeControls
                                        key={`${e.edgeId}-ctrl`}
                                        edgeId={e.edgeId}
                                        points={e.points}
                                        startPoint={e.startPoint}
                                        endPoint={e.endPoint}
                                        elName={e.elName}
                                        isVisible={matchesFilter(e.sourceName) && matchesFilter(e.targetName)}
                                        isInteracting={interaction.state.type !== 'IDLE'}
                                        hoveredEdge={interaction.hoveredEdge}
                                        isDraggingConnection={interaction.state.type === 'DRAGGING_CONNECTION' || interaction.state.type === 'DRAGGING_SOURCE' || interaction.state.type === 'DRAGGING_TARGET'}
                                        isDraggingEdge={interaction.state.type !== 'IDLE'}
                                        isSpacePressed={isSpacePressed}
                                        onMouseEnter={() => interaction.setHoveredEdge(e.edgeId)}
                                        onMouseLeave={() => interaction.setHoveredEdge(null)}
                                        onSegmentMouseDown={(idx) => interaction.dispatch({ type: 'START_SEGMENT_DRAG', id: e.edgeId, index: idx, points: e.points })}
                                        onSegmentDoubleClick={(idx, ev) => interaction.handleSegmentDoubleClick(idx, ev, e.edgeId)}
                                        onSourceMouseDown={() => interaction.dispatch({ type: 'START_SOURCE_DRAG', id: e.edgeId })}
                                        onTargetMouseDown={() => interaction.dispatch({ type: 'START_TARGET_DRAG', id: e.edgeId })}
                                        onVertexMouseDown={(idx) => interaction.dispatch({ type: 'START_VERTEX_DRAG', id: e.edgeId, index: idx })}
                                        onVertexDoubleClick={(idx) => interaction.handleVertexDoubleClick(idx, e.edgeId)}
                                    />
                                ))}
                            </FlowchartSVG>

                            {Object.entries(layout.nodes).map(([name, pos]) => {
                                const data = maps.find(m => m.name === name);
                                if (!data) return null;
                                const pixel = view.getPixelCoords(pos.gridX, pos.gridY);
                                const isVisible = matchesFilter(name);
                                return (
                                    <React.Fragment key={name}>
                                        <FlowNode data={data} pixel={pixel} isVisible={isVisible} isInteracting={interaction.state.type !== 'IDLE'} isDraggingThis={interaction.state.type === 'DRAGGING_NODE' && interaction.state.id === name} isDraggingCanvas={interaction.isDraggingCanvas} onMouseDown={(e) => { if (!isSpacePressed && e.button !== 1 && isVisible) { e.preventDefault(); e.stopPropagation(); interaction.dispatch({ type: 'START_NODE_DRAG', id: name }); } }} onEditScreen={onEditScreen} />
                                        {NODE_PORTS.map(p => {
                                            const isOccupied = portOccupancyMap[name]?.has(p.id);
                                            const isHovered = interaction.hoveredPort?.nodeId === name && interaction.hoveredPort?.portId === p.id;
                                            const isDraggingConn = interaction.state.type === 'DRAGGING_SOURCE' || interaction.state.type === 'DRAGGING_TARGET' || interaction.state.type === 'DRAGGING_CONNECTION';
                                            return <FlowPort key={`${name}-${p.id}`} nodeId={name} port={p} pixel={pixel} isHovered={isHovered} isInteractive={true} showPorts={isDraggingConn || isHovered} canQuickConnect={!isDraggingConn && !isOccupied} isDraggingConnection={isDraggingConn} onMouseEnter={() => interaction.setHoveredPort({ nodeId: name, portId: p.id })} onMouseLeave={() => interaction.setHoveredPort(null)} onMouseDown={e => { e.preventDefault(); e.stopPropagation(); if (isDraggingConn) return; if (isOccupied) { const edgeInfo = portEdgeMap[`${name}::${p.id}`]; if (edgeInfo) { interaction.dispatch({ type: edgeInfo.isSource ? 'START_SOURCE_DRAG' : 'START_TARGET_DRAG', id: edgeInfo.edgeId }); } } else { interaction.dispatch({ type: 'START_CONNECTION_DRAG', nodeId: name, portId: p.id }); } }} onClick={() => { if (!isOccupied && !isDraggingConn && !interaction.justStoppedDragging) { setQuickConnectData({ sourceNodeId: name, sourcePortId: p.id }); setIsQuickConnectOpen(true); } }} />;
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </FlowchartCanvas>
                    </motion.div>

                    {isQuickConnectOpen && quickConnectData && (
                        <QuickConnectDialog maps={maps} sourceNodeId={quickConnectData.sourceNodeId} onClose={() => setIsQuickConnectOpen(false)} onConfirm={(target, element) => {
                            const edgeId = `${quickConnectData.sourceNodeId}-${element}-${target}`;
                            setLayout(prev => ({ ...prev, edges: { ...prev.edges, [edgeId]: { sourceHandle: quickConnectData.sourcePortId, vertices: [] } } }));
                            setIsDirty(true);
                            setIsQuickConnectOpen(false);
                        }} />
                    )}

                    {showUnsavedChangesModal && (
                        <UnsavedChangesDialog onCancel={() => setShowUnsavedChangesModal(false)} onSaveAndExit={async () => { await saveLayout(); onClose(); }} onExitWithoutSaving={onClose} />
                    )}
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
