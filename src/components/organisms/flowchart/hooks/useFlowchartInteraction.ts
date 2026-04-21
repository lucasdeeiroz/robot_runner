import { useState, useCallback, useReducer, useEffect, useRef } from 'react';
import { FlowchartLayout } from '@/lib/types';
import { 
    CELL_WIDTH, 
    CELL_HEIGHT, 
    NODE_OFFSET_X, 
    NODE_OFFSET_Y,
    NODE_PORTS
} from '../types';
import { feedback } from '@/lib/feedback';
import { useTranslation } from 'react-i18next';

type InteractionState = 
    | { type: 'IDLE' }
    | { type: 'DRAGGING_CANVAS'; startX: number; startY: number }
    | { type: 'DRAGGING_NODE'; id: string }
    | { type: 'DRAGGING_VERTEX'; id: string; index: number }
    | { type: 'DRAGGING_SEGMENT'; id: string; index: number; points: { x: number; y: number }[] }
    | { type: 'DRAGGING_SOURCE'; id: string }
    | { type: 'DRAGGING_TARGET'; id: string }
    | { type: 'DRAGGING_CONNECTION'; nodeId: string; portId: string };

type InteractionAction =
    | { type: 'START_CANVAS_DRAG'; x: number; y: number }
    | { type: 'START_NODE_DRAG'; id: string }
    | { type: 'START_VERTEX_DRAG'; id: string; index: number }
    | { type: 'START_SEGMENT_DRAG'; id: string; index: number; points: { x: number; y: number }[] }
    | { type: 'START_SOURCE_DRAG'; id: string }
    | { type: 'START_TARGET_DRAG'; id: string }
    | { type: 'START_CONNECTION_DRAG'; nodeId: string; portId: string }
    | { type: 'STOP_DRAG' };

function interactionReducer(state: InteractionState, action: InteractionAction): InteractionState {
    switch (action.type) {
        case 'START_CANVAS_DRAG': return { type: 'DRAGGING_CANVAS', startX: action.x, startY: action.y };
        case 'START_NODE_DRAG': return { type: 'DRAGGING_NODE', id: action.id };
        case 'START_VERTEX_DRAG': return { type: 'DRAGGING_VERTEX', id: action.id, index: action.index };
        case 'START_SEGMENT_DRAG': return { type: 'DRAGGING_SEGMENT', id: action.id, index: action.index, points: action.points };
        case 'START_SOURCE_DRAG': return { type: 'DRAGGING_SOURCE', id: action.id };
        case 'START_TARGET_DRAG': return { type: 'DRAGGING_TARGET', id: action.id };
        case 'START_CONNECTION_DRAG': return { type: 'DRAGGING_CONNECTION', nodeId: action.nodeId, portId: action.portId };
        case 'STOP_DRAG': return { type: 'IDLE' };
        default: return state;
    }
}

function normalizeEdgeVertices(vertices: { x: number; y: number }[]): { x: number; y: number }[] {
    const EPSILON = 0.001;
    const isClose = (a: number, b: number) => Math.abs(a - b) <= EPSILON;

    if (vertices.length <= 1) return vertices;

    const deduped: { x: number; y: number }[] = [];
    vertices.forEach(vertex => {
        const last = deduped[deduped.length - 1];
        if (!last || !isClose(last.x, vertex.x) || !isClose(last.y, vertex.y)) {
            deduped.push(vertex);
        }
    });

    if (deduped.length <= 2) return deduped;

    const normalized: { x: number; y: number }[] = [deduped[0]];
    for (let i = 1; i < deduped.length - 1; i++) {
        const prev = normalized[normalized.length - 1];
        const curr = deduped[i];
        const next = deduped[i + 1];
        const isCollinear =
            (isClose(prev.x, curr.x) && isClose(curr.x, next.x)) ||
            (isClose(prev.y, curr.y) && isClose(curr.y, next.y));
        if (!isCollinear) {
            normalized.push(curr);
        }
    }
    normalized.push(deduped[deduped.length - 1]);

    return normalized;
}

interface UseFlowchartInteractionProps {
    layout: FlowchartLayout;
    setLayout: React.Dispatch<React.SetStateAction<FlowchartLayout>>;
    viewTransform: { scale: number; offset: { x: number; y: number } };
    setOffset: (o: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
    performZoom: (delta: number, center?: { x: number; y: number }) => void;
    setIsDirty: (dirty: boolean) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    getPixelCoords: (gridX: number, gridY: number) => { x: number; y: number };
    getPortCoords: (nodeX: number, nodeY: number, portId: string) => { x: number; y: number };
    snapToLanes: (x: number, y: number) => { x: number; y: number };
    getClosestLane: (val: number) => number;
}

export function useFlowchartInteraction({
    layout,
    setLayout,
    viewTransform,
    setOffset,
    performZoom,
    setIsDirty,
    containerRef,
    getPixelCoords,
    getPortCoords,
    snapToLanes,
    getClosestLane
}: UseFlowchartInteractionProps) {
    const { t } = useTranslation();
    const { scale, offset } = viewTransform;

    const [state, dispatch] = useReducer(interactionReducer, { type: 'IDLE' });
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const [hoveredPort, _setHoveredPort] = useState<{ nodeId: string, portId: string } | null>(null);
    const hoveredPortRef = useRef<{ nodeId: string, portId: string } | null>(null);
    const setHoveredPort = useCallback((val: { nodeId: string, portId: string } | null) => {
        hoveredPortRef.current = val;
        _setHoveredPort(val);
    }, []);
    const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
    const [justStoppedDragging, setJustStoppedDragging] = useState(false);

    const isDraggingCanvas = state.type === 'DRAGGING_CANVAS';

    const handleMouseUp = useCallback(() => {
        if (state.type === 'IDLE') return;

        if (state.type === 'DRAGGING_SOURCE' || state.type === 'DRAGGING_TARGET' || state.type === 'DRAGGING_CONNECTION') {
            const currentPort = hoveredPortRef.current;
            if (currentPort) {
                setLayout(prev => {
                    const isSourceDrag = state.type === 'DRAGGING_SOURCE';
                    const isNewConn = state.type === 'DRAGGING_CONNECTION';

                    let edgeId = isNewConn ? `${state.nodeId}->${currentPort.nodeId}` : state.id;
                    const handleKey = (isSourceDrag || isNewConn) ? 'sourceHandle' : 'targetHandle';

                    // For new connections, check if nodes are different
                    if (isNewConn && state.nodeId === currentPort.nodeId) return prev;

                    // Occupancy check - improved to handle both source-el-target and source->target formats
                    const isOccupied = Object.entries(prev.edges).some(([eKey, edge]) => {
                        if (!isNewConn && eKey === edgeId) return false;
                        
                        let sName, tName;
                        if (eKey.includes('->')) {
                            [sName, tName] = eKey.split('->');
                        } else {
                            const parts = eKey.split('-');
                            sName = parts[0];
                            tName = parts[parts.length - 1];
                        }

                        if (sName === currentPort.nodeId && edge.sourceHandle === currentPort.portId) return true;
                        if (tName === currentPort.nodeId && edge.targetHandle === currentPort.portId) return true;
                        return false;
                    });

                    if (isOccupied) {
                        feedback.toast.error(t('mapper.flowchart.port_occupied'));
                        return prev;
                    }

                    if (isNewConn) {
                        return {
                            ...prev,
                            edges: {
                                ...prev.edges,
                                [edgeId]: {
                                    sourceHandle: state.portId,
                                    targetHandle: currentPort.portId,
                                    vertices: []
                                }
                            }
                        };
                    }

                    return {
                        ...prev,
                        edges: {
                            ...prev.edges,
                            [edgeId]: { ...prev.edges[edgeId], [handleKey]: currentPort.portId }
                        }
                    };
                });
                setIsDirty(true);
            }
        }

        if (state.type === 'DRAGGING_VERTEX' || state.type === 'DRAGGING_SEGMENT') {
            setLayout(prev => {
                const edgeId = state.id;
                const edge = prev.edges[edgeId];
                if (!edge || !edge.vertices) return prev;

                const cleanedVertices = normalizeEdgeVertices(edge.vertices);
                if (JSON.stringify(cleanedVertices) === JSON.stringify(edge.vertices)) {
                    return prev;
                }

                return {
                    ...prev,
                    edges: {
                        ...prev.edges,
                        [edgeId]: {
                            ...edge,
                            vertices: cleanedVertices
                        }
                    }
                };
            });
        }

        dispatch({ type: 'STOP_DRAG' });
        setHoveredPort(null);
        
        // Block clicks for a brief moment to avoid triggering QuickConnect after a drop
        setJustStoppedDragging(true);
        setTimeout(() => setJustStoppedDragging(false), 100);
    }, [state, setLayout, setIsDirty, t]);

    useEffect(() => {
        const globalUp = () => handleMouseUp();
        window.addEventListener('mouseup', globalUp);
        return () => window.removeEventListener('mouseup', globalUp);
    }, [handleMouseUp]);

    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0 && e.button !== 1) return;
        e.preventDefault();
        if (e.button === 1) e.preventDefault();
        dispatch({ type: 'START_CANVAS_DRAG', x: e.clientX - offset.x, y: e.clientY - offset.y });
    }, [offset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current) return;

        if (state.type === 'DRAGGING_CANVAS') {
            setOffset({
                x: e.clientX - state.startX,
                y: e.clientY - state.startY
            });
            return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - offset.x) / scale;
        const mouseY = (e.clientY - rect.top - offset.y) / scale;

        if (state.type !== 'IDLE') {
            setCursorPos({ x: mouseX, y: mouseY });
        }

        if (state.type === 'DRAGGING_NODE') {
            const gridX = Math.round((mouseX - NODE_OFFSET_X) / CELL_WIDTH);
            const gridY = Math.round((mouseY - NODE_OFFSET_Y) / CELL_HEIGHT);

            const isOccupied = Object.entries(layout.nodes).some(([name, pos]) => {
                if (name === state.id) return false;
                return pos.gridX === gridX && pos.gridY === gridY;
            });

            if (!isOccupied) {
                setLayout(prev => {
                    const current = prev.nodes[state.id];
                    if (current && current.gridX === gridX && current.gridY === gridY) {
                        return prev;
                    }
                    return {
                        ...prev,
                        nodes: { 
                            ...prev.nodes, 
                            [state.id]: { gridX, gridY }
                        }
                    };
                });
                setIsDirty(true);
            }
        }

        if (state.type === 'DRAGGING_SOURCE' || state.type === 'DRAGGING_TARGET' || state.type === 'DRAGGING_CONNECTION') {
            // Find closest port
            let bestPort: { nodeId: string, portId: string } | null = null;
            let minDist = 40; // Snap threshold increased

            Object.entries(layout.nodes).forEach(([nodeId, pos]) => {
                const nodeX = pos.gridX * CELL_WIDTH + NODE_OFFSET_X;
                const nodeY = pos.gridY * CELL_HEIGHT + NODE_OFFSET_Y;
                
                NODE_PORTS.forEach(port => {
                    const portId = port.id;
                    const pCoords = getPortCoords(nodeX, nodeY, portId);
                    const dist = Math.sqrt(Math.pow(mouseX - pCoords.x, 2) + Math.pow(mouseY - pCoords.y, 2));
                    if (dist < minDist) {
                        minDist = dist;
                        bestPort = { nodeId, portId };
                    }
                });
            });

            const finalPort = bestPort as { nodeId: string, portId: string } | null;
            const isSamePort = (
                finalPort?.nodeId === hoveredPort?.nodeId && 
                finalPort?.portId === hoveredPort?.portId
            );
            if (!isSamePort) {
                setHoveredPort(finalPort);
            }
        }

        if (state.type === 'DRAGGING_VERTEX') {
            let snapped = snapToLanes(mouseX, mouseY);
            
            // Smart Snapping logic from original file
            const edgeId = state.id;
            const parts = edgeId.split('-');
            if (parts.length >= 3) {
                const sourceName = parts[0];
                const targetName = parts[parts.length - 1];
                const sLayout = layout.nodes[sourceName];
                const tLayout = layout.nodes[targetName];
                const edge = layout.edges[edgeId];
                if (sLayout && tLayout && edge) {
                    const sOrigin = getPixelCoords(sLayout.gridX, sLayout.gridY);
                    const tOrigin = getPixelCoords(tLayout.gridX, tLayout.gridY);
                    const startP = edge.sourceHandle ? getPortCoords(sOrigin.x, sOrigin.y, edge.sourceHandle) : getPortCoords(sOrigin.x, sOrigin.y, tLayout.gridX >= sLayout.gridX ? 'right-3' : 'left-3');
                    const endP = edge.targetHandle ? getPortCoords(tOrigin.x, tOrigin.y, edge.targetHandle) : getPortCoords(tOrigin.x, tOrigin.y, tLayout.gridX >= sLayout.gridX ? 'left-3' : 'right-3');
                    if (Math.abs(snapped.x - startP.x) < 20) snapped.x = startP.x;
                    if (Math.abs(snapped.x - endP.x) < 20) snapped.x = endP.x;
                    if (Math.abs(snapped.y - startP.y) < 20) snapped.y = startP.y;
                    if (Math.abs(snapped.y - endP.y) < 20) snapped.y = endP.y;
                }
            }

            setLayout(prev => {
                const edge = prev.edges[state.id];
                if (!edge || !edge.vertices) return prev;
                const currentVertex = edge.vertices[state.index];
                if (currentVertex && currentVertex.x === snapped.x && currentVertex.y === snapped.y) {
                    return prev;
                }
                const newVertices = [...edge.vertices];
                newVertices[state.index] = snapped;
                return { ...prev, edges: { ...prev.edges, [state.id]: { ...edge, vertices: newVertices } } };
            });
            setIsDirty(true);
        }

        if (state.type === 'DRAGGING_SEGMENT') {
            const { points, index, id: edgeId } = state;
            const p1 = points[index];
            const p2 = points[index + 1];
            const isHorizontal = Math.abs(p1.y - p2.y) < 1;
            const snappedX = getClosestLane(mouseX);
            const snappedY = getClosestLane(mouseY);

            setLayout(prev => {
                const prevEdge = prev.edges[edgeId] || { vertices: [] };
                let newVertices: { x: number, y: number }[] = [];

                if (!prevEdge.vertices || prevEdge.vertices.length === 0) {
                    const currentPoints = points.map(p => ({ ...p }));
                    if (isHorizontal && index > 0 && index < points.length - 1) {
                        currentPoints[index].y = snappedY;
                        currentPoints[index + 1].y = snappedY;
                    } else if (!isHorizontal && index > 0 && index < points.length - 1) {
                        currentPoints[index].x = snappedX;
                        currentPoints[index + 1].x = snappedX;
                    }
                    newVertices = currentPoints.slice(1, -1);
                } else {
                    newVertices = [...prevEdge.vertices];
                    const vIdx1 = index - 1;
                    const vIdx2 = index;
                    if (isHorizontal) {
                        if (vIdx1 >= 0 && vIdx1 < newVertices.length) newVertices[vIdx1].y = snappedY;
                        if (vIdx2 >= 0 && vIdx2 < newVertices.length) newVertices[vIdx2].y = snappedY;
                    } else {
                        if (vIdx1 >= 0 && vIdx1 < newVertices.length) newVertices[vIdx1].x = snappedX;
                        if (vIdx2 >= 0 && vIdx2 < newVertices.length) newVertices[vIdx2].x = snappedX;
                    }
                }
                
                // Bail out if vertices haven't changed
                const oldVerticesStr = JSON.stringify(prevEdge.vertices || []);
                const newVerticesStr = JSON.stringify(newVertices);
                if (oldVerticesStr === newVerticesStr) return prev;

                return { ...prev, edges: { ...prev.edges, [edgeId]: { ...prevEdge, vertices: newVertices } } };
            });
            setIsDirty(true);
        }

    }, [containerRef, state, offset, scale, setOffset, layout, setLayout, setIsDirty, snapToLanes, getClosestLane, getPixelCoords, getPortCoords, hoveredPort]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const pixelDelta = e.deltaY > 0 ? -0.1 : 0.1;
            performZoom(pixelDelta, { x: mouseX, y: mouseY });
        } else if (e.shiftKey) {
            setOffset(prev => ({ ...prev, x: prev.x - e.deltaY }));
        } else {
            setOffset(prev => ({ ...prev, y: prev.y - e.deltaY }));
        }
    }, [containerRef, performZoom, setOffset]);

    const handleSegmentDoubleClick = useCallback((idx: number, e: React.MouseEvent, id: string) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = (e.clientX - rect.left - offset.x) / scale;
        const mouseY = (e.clientY - rect.top - offset.y) / scale;
        const snapped = snapToLanes(mouseX, mouseY);

        setLayout(prev => {
            const edge = prev.edges[id];
            if (!edge) return prev;
            const newVertices = [...(edge.vertices || [])];
            newVertices.splice(idx, 0, snapped);
            return { ...prev, edges: { ...prev.edges, [id]: { ...edge, vertices: newVertices } } };
        });
        setIsDirty(true);
    }, [containerRef, offset, scale, snapToLanes, setLayout, setIsDirty]);

    const handleVertexDoubleClick = useCallback((idx: number, id: string) => {
        setLayout(prev => {
            const edge = prev.edges[id];
            if (!edge || !edge.vertices) return prev;
            const newVertices = edge.vertices.filter((_, i) => i !== idx);
            return { ...prev, edges: { ...prev.edges, [id]: { ...edge, vertices: newVertices } } };
        });
        setIsDirty(true);
    }, [setLayout, setIsDirty]);

    return {
        isDraggingCanvas,
        state,
        dispatch,
        cursorPos,
        hoveredPort,
        justStoppedDragging,
        setHoveredPort,
        hoveredEdge,
        setHoveredEdge,
        handleCanvasMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleWheel,
        handleSegmentDoubleClick,
        handleVertexDoubleClick
    };
}
