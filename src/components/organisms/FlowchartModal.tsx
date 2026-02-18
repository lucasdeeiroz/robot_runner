import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ScreenMap, FlowchartLayout } from '@/lib/types';
import { X, ZoomIn, ZoomOut, Maximize, Pencil, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { saveFlowchartLayout, loadFlowchartLayout } from '@/lib/dashboard/mapperPersistence';
import { feedback } from '@/lib/feedback';

interface FlowchartModalProps {
    isOpen: boolean;
    onClose: () => void;
    maps: ScreenMap[];
    onEditScreen?: (screenName: string) => void;
    activeProfileId: string;
}

// --- Constants ---
const CELL_WIDTH = 300;
const CELL_HEIGHT = 400;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 280;
const LANE_SIZE = 20;

// Grid offsets to center node in cell
const NODE_OFFSET_X = (CELL_WIDTH - NODE_WIDTH) / 2;
const NODE_OFFSET_Y = (CELL_HEIGHT - NODE_HEIGHT) / 2;

// Port Configuration
const PORTS_TOP = 5;
const PORTS_BOTTOM = 5;
const PORTS_LEFT = 7;
const PORTS_RIGHT = 7;

type Side = 'top' | 'bottom' | 'left' | 'right';

interface Port {
    id: string; // "top-0", "left-3"
    side: Side;
    index: number;
    x: number; // Relative to node
    y: number;
}

// Generate Ports for a generic node
const generatePorts = (): Port[] => {
    const ports: Port[] = [];
    const OFFSET = -12; // Move ports outside the node

    // Top (0 to 4)
    const stepX = NODE_WIDTH / (PORTS_TOP + 1);
    for (let i = 0; i < PORTS_TOP; i++) {
        ports.push({ id: `top-${i}`, side: 'top', index: i, x: stepX * (i + 1), y: OFFSET });
    }

    // Bottom (0 to 4)
    for (let i = 0; i < PORTS_BOTTOM; i++) {
        ports.push({ id: `bottom-${i}`, side: 'bottom', index: i, x: stepX * (i + 1), y: NODE_HEIGHT - OFFSET });
    }

    // Left (0 to 6)
    const stepY = NODE_HEIGHT / (PORTS_LEFT + 1);
    for (let i = 0; i < PORTS_LEFT; i++) {
        ports.push({ id: `left-${i}`, side: 'left', index: i, x: OFFSET, y: stepY * (i + 1) });
    }

    // Right (0 to 6)
    for (let i = 0; i < PORTS_RIGHT; i++) {
        ports.push({ id: `right-${i}`, side: 'right', index: i, x: NODE_WIDTH - OFFSET, y: stepY * (i + 1) });
    }

    return ports;
};

const NODE_PORTS = generatePorts();


export function FlowchartModal({ isOpen, onClose, maps, onEditScreen, activeProfileId }: FlowchartModalProps) {
    const { t } = useTranslation();
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStart = useRef({ x: 0, y: 0 });

    // Layout State
    const [layout, setLayout] = useState<FlowchartLayout>({ version: 1, nodes: {}, edges: {} });
    const [loading, setLoading] = useState(true);

    // Interaction State
    const [dragItem, setDragItem] = useState<{
        type: 'node' | 'vertex' | 'source' | 'target' | 'segment';
        id: string; // Node Name or Edge ID
        index?: number;
        points?: { x: number, y: number }[]; // Snapshot of points for segment dragging
    } | null>(null);

    // Initial drag position
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

    // For rendering potential connections
    const [hoveredPort, setHoveredPort] = useState<{ nodeId: string, portId: string } | null>(null);


    // Load Layout
    useEffect(() => {
        if (isOpen) {
            loadLayout();
        }
    }, [isOpen, activeProfileId]);

    const loadLayout = async () => {
        setLoading(true);
        const saved = await loadFlowchartLayout(activeProfileId);
        if (saved) {
            setLayout(saved);
        } else {
            setLayout({ version: 1, nodes: {}, edges: {} });
        }
        setLoading(false);
    };

    const saveLayout = async () => {
        await saveFlowchartLayout(activeProfileId, layout);
        feedback.toast.success(t('common.saved', 'Saved'));
    };

    // Auto-Layout New Nodes
    useEffect(() => {
        if (loading) return;

        let hasChanges = false;
        const newNodes = { ...layout.nodes };
        const occupied = new Set<string>();
        Object.values(newNodes).forEach(n => occupied.add(`${n.gridX},${n.gridY}`));

        let nextX = 0;
        let nextY = 0;

        maps.forEach(map => {
            if (!newNodes[map.name]) {
                while (occupied.has(`${nextX},${nextY}`)) {
                    nextX++;
                    if (nextX > 5) {
                        nextX = 0;
                        nextY++;
                    }
                }
                newNodes[map.name] = { gridX: nextX, gridY: nextY };
                occupied.add(`${nextX},${nextY}`);
                hasChanges = true;
            }
        });

        if (hasChanges) {
            setLayout(prev => ({ ...prev, nodes: newNodes }));
        }
    }, [maps, loading]);


    // --- Helper Functions ---

    const getPixelCoords = (gridX: number, gridY: number) => ({
        x: gridX * CELL_WIDTH + NODE_OFFSET_X,
        y: gridY * CELL_HEIGHT + NODE_OFFSET_Y
    });

    const getPortCoords = (nodeX: number, nodeY: number, portId: string) => {
        const port = NODE_PORTS.find(p => p.id === portId);
        if (!port) return { x: nodeX + NODE_WIDTH / 2, y: nodeY + NODE_HEIGHT / 2 }; // Center fallback
        return { x: nodeX + port.x, y: nodeY + port.y };
    };

    const snapToLanes = (x: number, y: number) => {
        return {
            x: Math.round(x / LANE_SIZE) * LANE_SIZE,
            y: Math.round(y / LANE_SIZE) * LANE_SIZE
        };
    };

    const getClosestLane = (val: number) => Math.round(val / LANE_SIZE) * LANE_SIZE;


    // --- Event Handlers ---

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        setIsDraggingCanvas(true);
        dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;

        // Canvas Panning
        if (isDraggingCanvas) {
            setOffset({
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            });
            return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - offset.x) / scale;
        const mouseY = (e.clientY - rect.top - offset.y) / scale;

        // Update Cursor Position for Visual Feedback
        if (dragItem) {
            setCursorPos({ x: mouseX, y: mouseY });
        }

        // Node Dragging
        if (dragItem?.type === 'node') {
            const gridX = Math.round((mouseX - NODE_OFFSET_X) / CELL_WIDTH);
            const gridY = Math.round((mouseY - NODE_OFFSET_Y) / CELL_HEIGHT);

            // Check grid occupancy (exclude self)
            const isOccupied = Object.entries(layout.nodes).some(([name, pos]) => {
                if (name === dragItem.id) return false;
                return pos.gridX === Math.max(0, gridX) && pos.gridY === Math.max(0, gridY);
            });

            if (!isOccupied) {
                setLayout(prev => ({
                    ...prev,
                    nodes: {
                        ...prev.nodes,
                        [dragItem.id]: { gridX: Math.max(0, gridX), gridY: Math.max(0, gridY) }
                    }
                }));
            }
        }

        // Edge Connection Dragging (Source / Target)
        if (dragItem?.type === 'source' || dragItem?.type === 'target') {
            // Manual collision detection for ports
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const portEl = el?.closest('[data-port-id]');

            if (portEl) {
                const portId = portEl.getAttribute('data-port-id');
                const nodeId = portEl.getAttribute('data-node-id');
                // Only allow hovering if not dragged from same node (optional, but good)
                // Actually, self-loops are allowed.
                if (portId && nodeId) {
                    setHoveredPort({ nodeId, portId });
                }
            } else {
                setHoveredPort(null);
            }
        }

        // Edge Dragging (Vertex, Source, Target, Segment)
        if (dragItem?.type === 'vertex' || dragItem?.type === 'source' || dragItem?.type === 'target' || dragItem?.type === 'segment') {
            // Lane Snapping for Vertices
            let snapped = { x: mouseX, y: mouseY };

            // Smart Snapping to Edge Extremities (Start/End)
            if (dragItem.type === 'vertex') {
                // Default grid snap
                snapped = snapToLanes(mouseX, mouseY);

                // Try to get Edge Start/End for Align-Snapping
                const edgeId = dragItem.id;
                const parts = edgeId.split('-');
                if (parts.length >= 3) {
                    const sourceName = parts[0];
                    const targetName = parts[parts.length - 1];
                    const sourceLayout = layout.nodes[sourceName];
                    const targetLayout = layout.nodes[targetName];
                    const edge = layout.edges[edgeId];

                    if (sourceLayout && targetLayout && edge) {
                        const sourceMap = maps.find(m => m.name === sourceName);
                        const targetMap = maps.find(m => m.name === targetName);
                        if (sourceMap && targetMap) {
                            const sOrigin = getPixelCoords(sourceLayout.gridX, sourceLayout.gridY);
                            const tOrigin = getPixelCoords(targetLayout.gridX, targetLayout.gridY);
                            let startPoint = { x: 0, y: 0 };
                            let endPoint = { x: 0, y: 0 };

                            if (edge.sourceHandle) startPoint = getPortCoords(sOrigin.x, sOrigin.y, edge.sourceHandle);
                            else {
                                const dx = targetLayout.gridX - sourceLayout.gridX;
                                startPoint = getPortCoords(sOrigin.x, sOrigin.y, dx >= 0 ? 'right-3' : 'left-3');
                            }

                            if (edge.targetHandle) endPoint = getPortCoords(tOrigin.x, tOrigin.y, edge.targetHandle);
                            else {
                                const dx = targetLayout.gridX - sourceLayout.gridX;
                                endPoint = getPortCoords(tOrigin.x, tOrigin.y, dx >= 0 ? 'left-3' : 'right-3');
                            }

                            // Snap X to Start/End X if close (20px threshold)
                            if (Math.abs(snapped.x - startPoint.x) < 20) snapped.x = startPoint.x;
                            if (Math.abs(snapped.x - endPoint.x) < 20) snapped.x = endPoint.x;

                            // Snap Y to Start/End Y if close
                            if (Math.abs(snapped.y - startPoint.y) < 20) snapped.y = startPoint.y;
                            if (Math.abs(snapped.y - endPoint.y) < 20) snapped.y = endPoint.y;
                        }
                    }
                }
            }

            // Segment Dragging
            if (dragItem.type === 'segment' && dragItem.points && typeof dragItem.index === 'number') {
                const { points, index, id: edgeId } = dragItem;

                const p1 = points[index];
                const p2 = points[index + 1];
                const isHorizontal = Math.abs(p1.y - p2.y) < 1;

                const snappedX = getClosestLane(mouseX);
                const snappedY = getClosestLane(mouseY);

                setLayout(prev => {
                    const prevEdge = prev.edges[edgeId] || {};
                    let newVertices: { x: number, y: number }[] = [];

                    // If no vertices yet, we are creating them from the default path snapshot
                    if (!prevEdge.vertices || prevEdge.vertices.length === 0) {
                        const currentPoints = points.map(p => ({ ...p })); // Deep copy

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

                        // Update vertices based on segment drag
                        if (isHorizontal) {
                            const vIndex1 = index - 1; // Start of segment (if vertex)
                            const vIndex2 = index;     // End of segment (if vertex)

                            if (vIndex1 >= 0 && vIndex1 < newVertices.length) newVertices[vIndex1].y = snappedY;
                            if (vIndex2 >= 0 && vIndex2 < newVertices.length) newVertices[vIndex2].y = snappedY;

                        } else {
                            const vIndex1 = index - 1;
                            const vIndex2 = index;

                            if (vIndex1 >= 0 && vIndex1 < newVertices.length) newVertices[vIndex1].x = snappedX;
                            if (vIndex2 >= 0 && vIndex2 < newVertices.length) newVertices[vIndex2].x = snappedX;
                        }
                    }

                    return {
                        ...prev,
                        edges: {
                            ...prev.edges,
                            [edgeId]: { ...prevEdge, vertices: newVertices }
                        }
                    };
                });
                return;
            }

            // Update Layout temporarily for feedback (Vertex/Handles)
            setLayout(prev => {
                const edgeId = dragItem.id;
                const edge = prev.edges[edgeId] || { vertices: [] };

                if (dragItem.type === 'vertex' && typeof dragItem.index === 'number') {
                    const newVertices = [...(edge.vertices || [])];
                    if (newVertices[dragItem.index]) {
                        newVertices[dragItem.index] = snapped;
                    }

                    return { ...prev, edges: { ...prev.edges, [edgeId]: { ...edge, vertices: newVertices } } };
                }
                return prev;
            });
        }
    };

    const handleMouseUp = () => {
        // Grid Occupancy is handled in MouseMove (we don't allow move if occupied)

        // Port Occupancy
        if (dragItem?.type === 'source' || dragItem?.type === 'target') {
            if (hoveredPort) {
                // Check if port is occupied
                const isOccupied = Object.entries(layout.edges).some(([eKey, edge]) => {
                    // Check if ANY edge uses this port on this node
                    // This mimics the logic in render
                    const [sName, _, tName] = eKey.split('-');
                    // IMPORTANT: We must NOT block if the edge occupying it is the ONE WE ARE DRAGGING (dragItem.id)
                    if (eKey === dragItem.id) return false;

                    if (sName === hoveredPort.nodeId && edge.sourceHandle === hoveredPort.portId) return true;
                    if (tName === hoveredPort.nodeId && edge.targetHandle === hoveredPort.portId) return true;
                    return false;
                });

                if (!isOccupied) {
                    setLayout(prev => ({
                        ...prev, // Keep prev layout
                        edges: {
                            ...prev.edges,
                            [dragItem.id]: {
                                ...prev.edges[dragItem.id],
                                [dragItem.type === 'source' ? 'sourceHandle' : 'targetHandle']: hoveredPort.portId
                            }
                        }
                    }));
                } else {
                    feedback.toast.error("Port already occupied");
                }
            }
        }

        // Edge Cleanups (Merge/Straighten) on Drop
        if (dragItem?.type === 'vertex' || dragItem?.type === 'segment') {
            setLayout(prev => {
                const edgeId = dragItem.id;
                const edge = prev.edges[edgeId];
                if (!edge || !edge.vertices) return prev;

                // 1. Get Full Path Context (Start, End)
                // We need to re-calculate Start/End to do 3-point collinear check with endpoints
                let startPoint = { x: 0, y: 0 };
                let endPoint = { x: 0, y: 0 };

                // Parse ID: source-element-target
                const parts = edgeId.split('-');
                if (parts.length >= 3) {
                    const sourceName = parts[0];
                    const targetName = parts[parts.length - 1]; // Last part is target
                    // Note: element name could contain hyphens, so this is risky if names have hyphens.
                    // But names usually don't have hyphens in this app context (or handled).
                    // Actually, let's use a safer find if possible. 
                    // Given the constraint, we might need to rely on `maps` find or store source/target in edge.
                    // Let's iterate maps to match source/target from ID? No, ID is constructed.
                    // Let's assume standard names for now or use the helper if available.

                    const sourceMap = maps.find(m => m.name === sourceName);
                    const targetMap = maps.find(m => m.name === targetName);
                    const sourceLayout = prev.nodes[sourceName];
                    const targetLayout = prev.nodes[targetName];

                    if (sourceMap && targetMap && sourceLayout && targetLayout) {
                        const sOrigin = getPixelCoords(sourceLayout.gridX, sourceLayout.gridY);
                        const tOrigin = getPixelCoords(targetLayout.gridX, targetLayout.gridY);

                        if (edge.sourceHandle) startPoint = getPortCoords(sOrigin.x, sOrigin.y, edge.sourceHandle);
                        else {
                            const dx = targetLayout.gridX - sourceLayout.gridX;
                            startPoint = getPortCoords(sOrigin.x, sOrigin.y, dx >= 0 ? 'right-3' : 'left-3');
                        }

                        if (edge.targetHandle) endPoint = getPortCoords(tOrigin.x, tOrigin.y, edge.targetHandle);
                        else {
                            const dx = targetLayout.gridX - sourceLayout.gridX;
                            endPoint = getPortCoords(tOrigin.x, tOrigin.y, dx >= 0 ? 'left-3' : 'right-3');
                        }
                    }
                }

                // 2. Merge duplicated vertices and Remove vertices overlapping Start/End
                let cleaned = edge.vertices.filter((v, i, arr) => {
                    // Start point overlap logic (Increased threshold to 15px)
                    if (Math.abs(v.x - startPoint.x) < 15 && Math.abs(v.y - startPoint.y) < 15) return false;
                    // End point overlap logic (Increased threshold to 15px)
                    if (Math.abs(v.x - endPoint.x) < 15 && Math.abs(v.y - endPoint.y) < 15) return false;

                    if (i === 0) return true;
                    // Internal duplicates logic
                    const p = arr[i - 1];
                    return (Math.abs(v.x - p.x) > 10 || Math.abs(v.y - p.y) > 10);
                });

                // 3. Remove collinear with Start/End
                // Full path: [start, ...cleaned, end]
                const fullPath = [startPoint, ...cleaned, endPoint];

                // We check internal points (indices 1 to length-2)
                const toRemove = new Set<number>();

                for (let i = 1; i < fullPath.length - 1; i++) {
                    const p0 = fullPath[i - 1];
                    const p1 = fullPath[i];
                    const p2 = fullPath[i + 1];

                    // Collinearity check: Distance of p1 from line p0-p2
                    // Dist = |(y2-y1)x0 - (x2-x1)y0 + x2y1 - y2x1| / sqrt((y2-y1)^2 + (x2-x1)^2)
                    // Simplified Cross Product Area: 
                    const crossProduct = (p1.y - p0.y) * (p2.x - p1.x) - (p2.y - p1.y) * (p1.x - p0.x);

                    // Normalize by distance squared? 
                    // Let's use simple distance from line segment logic if P0 != P2
                    const l2 = (p2.x - p0.x) ** 2 + (p2.y - p0.y) ** 2;
                    if (l2 === 0) continue; // p0 == p2

                    // Since we want "visually straight", absolute cross product is okay-ish but depends on length.
                    // Better: Distance < Threshold
                    // Area = 0.5 * Base * Height -> Height = |CrossProduct| / Sqrt(l2)

                    const dist = Math.abs(crossProduct) / Math.sqrt(l2);

                    if (dist < 15) { // Increased threshold to 15px for straightening
                        // Index in 'cleaned' is i-1
                        toRemove.add(i - 1);
                    }
                }

                cleaned = cleaned.filter((_, i) => !toRemove.has(i));

                return {
                    ...prev,
                    edges: { ...prev.edges, [edgeId]: { ...edge, vertices: cleaned } }
                };
            });
        }

        setIsDraggingCanvas(false);
        setDragItem(null);
        setHoveredPort(null);
    };

    // --- Zoom Logic ---

    const performZoom = (change: number, center?: { x: number, y: number }) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();

        // If no center provided (e.g. buttons), use center of viewport
        const viewportX = center ? center.x : rect.width / 2;
        const viewportY = center ? center.y : rect.height / 2;

        // Calculate point in "Content Space" before zoom
        // ContentX = (ViewportX - OffsetX) / Scale
        const contentX = (viewportX - offset.x) / scale;
        const contentY = (viewportY - offset.y) / scale;

        // Calculate New Scale
        const newScale = Math.min(Math.max(scale + change, 0.1), 3);
        if (newScale === scale) return;

        // Calculate New Offset to preserve content point at viewport point
        // ViewportX = ContentX * NewScale + NewOffsetX
        // NewOffsetX = ViewportX - ContentX * NewScale
        const newOffsetX = viewportX - (contentX * newScale);
        const newOffsetY = viewportY - (contentY * newScale);

        setScale(newScale);
        setOffset({ x: newOffsetX, y: newOffsetY });
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;

            // Calculate Mouse Position relative to Container
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Standard delta direction
            const pixelDelta = e.deltaY > 0 ? -0.1 : 0.1;

            performZoom(pixelDelta, { x: mouseX, y: mouseY });
        }
    };

    const handleSegmentDoubleClick = (e: React.MouseEvent, edgeId: string, segmentIndex: number) => {
        e.stopPropagation();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = (e.clientX - rect.left - offset.x) / scale;
        const mouseY = (e.clientY - rect.top - offset.y) / scale;

        setLayout(prev => {
            const edge = prev.edges[edgeId];
            if (!edge) return prev;

            const newVertices = [...(edge.vertices || [])];
            // Insert at segmentIndex
            newVertices.splice(segmentIndex, 0, { x: mouseX, y: mouseY });

            return {
                ...prev,
                edges: { ...prev.edges, [edgeId]: { ...edge, vertices: newVertices } }
            };
        });
    };

    const handleVertexDoubleClick = (e: React.MouseEvent, edgeId: string, vertexIndex: number) => {
        e.stopPropagation();
        setLayout(prev => {
            const edge = prev.edges[edgeId];
            if (!edge || !edge.vertices) return prev;

            const newVertices = [...edge.vertices];
            newVertices.splice(vertexIndex, 1);

            return {
                ...prev,
                edges: { ...prev.edges, [edgeId]: { ...edge, vertices: newVertices } }
            };
        });
    };

    // --- Render Logic ---

    const edgeLayouts = useMemo(() => {
        const layouts: {
            edgeId: string;
            points: { x: number, y: number }[];
            startPoint: { x: number, y: number };
            endPoint: { x: number, y: number };
            elName: string;
        }[] = [];

        maps.forEach(sourceMap => {
            const sourceLayout = layout.nodes[sourceMap.name];
            if (!sourceLayout) return;
            const sourceOrigin = getPixelCoords(sourceLayout.gridX, sourceLayout.gridY);

            sourceMap.elements.forEach(el => {
                const targetName = el.navigates_to;
                if (!targetName) return;

                const targetMap = maps.find(m => m.name === targetName);
                const targetLayout = layout.nodes[targetName];
                if (!targetMap || !targetLayout) return;

                const targetOrigin = getPixelCoords(targetLayout.gridX, targetLayout.gridY);
                const edgeId = `${sourceMap.name}-${el.name}-${targetName}`;
                const edgeData = layout.edges[edgeId] || {};

                let startPoint = { x: 0, y: 0 };
                let endPoint = { x: 0, y: 0 };

                // Source
                // Check if dragging START point
                if (dragItem?.type === 'source' && dragItem.id === edgeId) {
                    startPoint = cursorPos;
                } else if (edgeData.sourceHandle) {
                    startPoint = getPortCoords(sourceOrigin.x, sourceOrigin.y, edgeData.sourceHandle);
                } else {
                    const dx = targetLayout.gridX - sourceLayout.gridX;
                    if (dx >= 0) startPoint = getPortCoords(sourceOrigin.x, sourceOrigin.y, 'right-3');
                    else startPoint = getPortCoords(sourceOrigin.x, sourceOrigin.y, 'left-3');
                }

                // Target
                // Check if dragging END point
                if (dragItem?.type === 'target' && dragItem.id === edgeId) {
                    endPoint = cursorPos;
                } else if (edgeData.targetHandle) {
                    endPoint = getPortCoords(targetOrigin.x, targetOrigin.y, edgeData.targetHandle);
                } else {
                    const dx = targetLayout.gridX - sourceLayout.gridX;
                    if (dx >= 0) endPoint = getPortCoords(targetOrigin.x, targetOrigin.y, 'left-3');
                    else endPoint = getPortCoords(targetOrigin.x, targetOrigin.y, 'right-3');
                }

                let points = [startPoint, ...(edgeData.vertices || []), endPoint];

                // Default routing for new/unmodified edges (standard dogleg or straight)
                if ((!edgeData.vertices || edgeData.vertices.length === 0)) {
                    // Check for straight alignment
                    if (Math.abs(startPoint.x - endPoint.x) < 10) {
                        // Vertical Straight Line
                        points = [startPoint, endPoint];
                    } else if (Math.abs(startPoint.y - endPoint.y) < 10) {
                        // Horizontal Straight Line
                        points = [startPoint, endPoint];
                    } else {
                        // Standard dogleg routing
                        const midX = (startPoint.x + endPoint.x) / 2;
                        const snappedMidX = getClosestLane(midX);
                        points = [startPoint, { x: snappedMidX, y: startPoint.y }, { x: snappedMidX, y: endPoint.y }, endPoint];
                    }
                }

                layouts.push({ edgeId, points, startPoint, endPoint, elName: el.name });
            });
        });
        return layouts;
    }, [maps, layout, dragItem, cursorPos]); // layout change (edges/nodes) triggers recalc

    // Layer 1: Lines (Z-Index 10) - Beneath Nodes
    const renderEdgeLines = useMemo(() => {
        return edgeLayouts.map(({ edgeId, points }) => {
            let d = `M ${points[0].x} ${points[0].y}`;
            for (let i = 0; i < points.length - 1; i++) {
                const p2 = points[i + 1];
                d += ` L ${p2.x} ${p2.y}`;
            }

            return (
                <g key={`${edgeId}-line`}>
                    <path d={d} stroke="#9ca3af" strokeWidth={2} fill="none" markerEnd="url(#arrowhead)"
                        className="group-hover/edge:stroke-primary transition-colors pointer-events-none" />
                </g>
            );
        });
    }, [edgeLayouts]);

    // Layer 2: Controls & Interaction (Z-Index 30) - Above Nodes
    const renderEdgeControls = useMemo(() => {
        const isDraggingConnection = dragItem?.type === 'source' || dragItem?.type === 'target';
        const isDraggingEdge = dragItem?.type === 'segment' || dragItem?.type === 'vertex' || isDraggingConnection;

        return edgeLayouts.map(({ edgeId, points, startPoint, endPoint, elName }) => {
            const segments: React.ReactNode[] = [];
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const isHorizontal = Math.abs(p1.y - p2.y) < 1;

                segments.push(
                    <line
                        key={`${edgeId}-seg-${i}`}
                        x1={p1.x} y1={p1.y}
                        x2={p2.x} y2={p2.y}
                        stroke="transparent"
                        strokeWidth={15}
                        className={clsx(
                            "cursor-pointer",
                            isHorizontal ? "cursor-row-resize" : "cursor-col-resize",
                            isDraggingConnection ? "pointer-events-none" : "pointer-events-auto"
                        )}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragItem({ type: 'segment', id: edgeId, index: i, points: points });
                        }}
                        onDoubleClick={(e) => handleSegmentDoubleClick(e, edgeId, i)}
                    />
                );
            }

            return (
                <g key={`${edgeId}-ctrl`} className="group/edge pointer-events-auto">
                    {/* Hover Hit Area (Duplicate Path for Hover detection if needed, or stick to segments) */}
                    {/* The problem: If we only have segments, the gaps might be missing? No, segments cover it. */}
                    {/* However, purely for visual hover effect on the line, we might need a transparent path here too if we want 'group-hover' to work across layers */}
                    {/* Actually, since we split, group-hover won't propagate from Controls to Lines easily unless we use a global hover state or shared parent. 
                        But we can just rely on the segments being hovered to show handles. 
                        Visual highlight of the line might be lost if we don't sync. 
                        For now, let's focus on interactivity. */}

                    {segments}

                    {/* Label (Hidden during ANY drag to prevent visual noise) */}
                    {points.length >= 2 && !isDraggingEdge && (() => {
                        // Find the middle segment for better centering
                        const midSegIndex = Math.floor((points.length - 1) / 2);
                        const pA = points[midSegIndex];
                        const pB = points[midSegIndex + 1];

                        // Midpoint of the central segment
                        const midX = (pA.x + pB.x) / 2;
                        const midY = (pA.y + pB.y) / 2;

                        // Apply Offset: Below (+15) and Left (-15)
                        // foreignObject is centered by subtracting half width (60) and half height (12)
                        // Final X = midX - 75
                        // Final Y = midY + 3

                        return (
                            <foreignObject
                                x={midX - 75}
                                y={midY + 3}
                                width={120}
                                height={24}
                                style={{ overflow: 'visible' }}
                            >
                                <div className="bg-surface/90 text-on-surface text-[10px] px-2 py-0.5 rounded-full text-center truncate border border-outline-variant/50 shadow-sm pointer-events-auto select-none hover:border-primary hover:text-primary transition-colors cursor-move"
                                    onMouseDown={(e) => {
                                        // Make label draggable or just pass through
                                        e.stopPropagation();
                                    }}>
                                    {elName}
                                </div>
                            </foreignObject>
                        );
                    })()}

                    {/* Source Handle */}
                    <circle cx={startPoint.x} cy={startPoint.y} r={6} fill="transparent"
                        className={clsx(
                            "cursor-grab hover:fill-primary/50",
                            (dragItem?.type === 'source' && dragItem.id === edgeId) ? "pointer-events-none" : (isDraggingConnection ? "pointer-events-none" : "pointer-events-auto")
                        )}
                        onMouseDown={(e) => { e.stopPropagation(); setDragItem({ type: 'source', id: edgeId }); }} />

                    {/* Target Handle */}
                    <circle cx={endPoint.x} cy={endPoint.y} r={6} fill="transparent"
                        className={clsx(
                            "cursor-grab hover:fill-primary/50",
                            (dragItem?.type === 'target' && dragItem.id === edgeId) ? "pointer-events-none" : (isDraggingConnection ? "pointer-events-none" : "pointer-events-auto")
                        )}
                        onMouseDown={(e) => { e.stopPropagation(); setDragItem({ type: 'target', id: edgeId }); }} />

                    {/* Vertices */}
                    {points.slice(1, -1).map((p, idx) => (
                        <circle key={`${edgeId}-v-${idx}`} cx={p.x} cy={p.y} r={5} fill="#3b82f6"
                            className={clsx(
                                "cursor-move opacity-0 hover:opacity-100",
                                isDraggingConnection ? "pointer-events-none" : "pointer-events-auto"
                            )}
                            onMouseDown={(e) => { e.stopPropagation(); setDragItem({ type: 'vertex', id: edgeId, index: idx }); }}
                            onDoubleClick={(e) => handleVertexDoubleClick(e, edgeId, idx)}
                        />
                    ))}
                </g>
            );
        });
    }, [edgeLayouts, dragItem]); // Added dragItem dependency for re-render on drag start


    if (!isOpen) return null;


    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface w-[90vw] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-outline-variant/30">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30 bg-surface">
                    <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
                        <Maximize className="text-primary" size={20} />
                        {t('mapper.flowchart.title', 'Navigation Flow')}
                        <span className="text-xs font-normal text-on-surface-variant/50 ml-2">(Enhanced)</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <button onClick={saveLayout} className="p-2 hover:bg-primary/10 text-primary rounded-full" title={t('common.save')}>
                            <Save size={20} />
                        </button>
                        <div className="h-6 w-px bg-outline-variant/30 mx-2" />
                        <div className="flex bg-surface-variant/30 rounded-lg p-1 mr-4">
                            <button onClick={() => performZoom(-0.1)} className="p-1.5 hover:bg-surface/50 rounded text-on-surface-variant"><ZoomOut size={16} /></button>
                            <span className="px-2 text-xs flex items-center text-on-surface-variant/80 min-w-[3rem] justify-center">{Math.round(scale * 100)}%</span>
                            <button onClick={() => performZoom(0.1)} className="p-1.5 hover:bg-surface/50 rounded text-on-surface-variant"><ZoomIn size={16} /></button>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-error/10 hover:text-error rounded-full transition-colors text-on-surface/60"><X size={20} /></button>
                    </div>
                </div>

                {/* Canvas */}
                <div
                    ref={containerRef}
                    className="flex-1 overflow-hidden relative bg-surface-variant/5 cursor-move"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    data-bg="true"
                >
                    <div
                        className="absolute origin-top-left transition-transform duration-75"
                        style={{
                            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                            width: 3000,
                            height: 3000
                        }}
                    >
                        {/* Grid Background */}
                        <div className="absolute inset-0 pointer-events-none"
                            style={{
                                zIndex: 0,
                                backgroundImage: `
                                     linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
                                     linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)
                                 `,
                                backgroundSize: `${CELL_WIDTH}px ${CELL_HEIGHT}px`
                            }}
                        />

                        {/* Edges Layer (Lines) - Z-Index 10 */}
                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 10, overflow: 'visible' }}>
                            <defs>
                                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
                                </marker>
                            </defs>
                            {renderEdgeLines}
                        </svg>

                        {/* Edges Layer (Controls) - Z-Index 30 (Above Nodes) */}
                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 30, overflow: 'visible' }}>
                            {renderEdgeControls}
                        </svg>

                        {/* Nodes (Z-Index 20) */}
                        {Object.entries(layout.nodes).map(([name, pos]) => {
                            const data = maps.find(m => m.name === name);
                            if (!data) return null;

                            const pixel = getPixelCoords(pos.gridX, pos.gridY);
                            const isDraggingThis = dragItem?.type === 'node' && dragItem.id === name;

                            return (
                                <div
                                    key={name}
                                    className={clsx(
                                        "absolute flex flex-col bg-surface border rounded-xl overflow-visible shadow-sm hover:shadow-xl transition-shadow group/card",
                                        data.type === 'modal' ? 'border-dashed border-tertiary' : 'border-outline-variant/60',
                                        isDraggingThis ? 'z-50 ring-2 ring-primary shadow-2xl opacity-90' : 'z-20'
                                    )}
                                    style={{
                                        left: pixel.x,
                                        top: pixel.y,
                                        width: NODE_WIDTH,
                                        height: NODE_HEIGHT,
                                        cursor: isDraggingCanvas ? 'move' : 'grab'
                                    }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setDragItem({ type: 'node', id: name });
                                    }}
                                >
                                    {/* Content */}
                                    <div className="h-48 w-full bg-surface-variant/20 relative overflow-hidden flex items-center justify-center p-2 pointer-events-none rounded-t-xl">
                                        {data.base64_preview ? (
                                            <img src={`data:image/png;base64,${data.base64_preview}`} className="max-h-full max-w-full object-contain shadow-sm rounded" />
                                        ) : (
                                            <span className="text-xs text-on-surface-variant/50">No Preview</span>
                                        )}
                                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white backdrop-blur-sm">
                                            {data.type}
                                        </div>
                                    </div>
                                    <div className="flex-1 p-3 flex flex-col justify-center border-t border-outline-variant/10 bg-surface rounded-b-xl pointer-events-none">
                                        <div className="flex items-center justify-between gap-2 pointer-events-auto">
                                            <h3 className="font-semibold text-sm text-on-surface truncate" title={data.name}>
                                                {data.name}
                                            </h3>
                                            {onEditScreen && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEditScreen(data.name);
                                                        onClose();
                                                    }}
                                                    className="p-1.5 hover:bg-primary/10 text-on-surface-variant hover:text-primary rounded-full transition-all"
                                                    title={t('mapper.action.edit')}
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-xs text-on-surface-variant/70 mt-1 pointer-events-auto">
                                            {data.elements.length} {t('mapper.elements', 'elements')}
                                        </div>
                                    </div>

                                    {/* Ports Layer (Moved to end and pointer-events-auto) */}
                                    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }}>
                                        {NODE_PORTS.map(p => {


                                            // Correct Layout-Based Occupancy Check
                                            const isTrulyOccupied = Object.entries(layout.edges).some(([eKey, edge]) => {
                                                const [sName, _, tName] = eKey.split('-'); // rudimentary parsing
                                                if (sName === name && edge.sourceHandle === p.id) return true;
                                                if (tName === name && edge.targetHandle === p.id) return true;
                                                return false;
                                            });

                                            const isHovered = hoveredPort?.nodeId === name && hoveredPort?.portId === p.id;
                                            // Show ports ONLY when dragging connection
                                            const isDraggingConnection = dragItem?.type === 'source' || dragItem?.type === 'target';
                                            const showPorts = isDraggingConnection;

                                            return (
                                                <div
                                                    key={p.id}
                                                    data-port-id={p.id}
                                                    data-node-id={name}
                                                    className="absolute w-12 h-12 rounded-full flex items-center justify-center pointer-events-auto z-50" // Hit Area: 48px
                                                    style={{
                                                        left: p.x - 24, // Center the 48px container
                                                        top: p.y - 24
                                                    }}
                                                    onMouseEnter={() => setHoveredPort({ nodeId: name, portId: p.id })}
                                                    onMouseLeave={() => setHoveredPort(null)}
                                                >
                                                    {/* Visual Port */}
                                                    <div
                                                        className={clsx(
                                                            "w-4 h-4 rounded-full border border-solid transition-all flex items-center justify-center",
                                                            isTrulyOccupied
                                                                ? (showPorts ? "bg-error/20 border-error" : "opacity-0 scale-0") // Hide occupied unless error showing
                                                                : (showPorts || isHovered)
                                                                    ? "bg-surface border-outline-variant opacity-100 scale-100"
                                                                    : "opacity-0 scale-0", // Hide if not dragging
                                                            isHovered && !isTrulyOccupied && "bg-primary border-primary scale-125",
                                                            isHovered && isTrulyOccupied && "cursor-not-allowed"
                                                        )}
                                                    >
                                                        {isTrulyOccupied && showPorts && <div className="w-1.5 h-1.5 rounded-full bg-error" />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
