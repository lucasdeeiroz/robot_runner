import React, { useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ScreenMap } from '@/lib/types';
import { X, ZoomIn, ZoomOut, Maximize, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

interface FlowchartModalProps {
    isOpen: boolean;
    onClose: () => void;
    maps: ScreenMap[];
    onEditScreen?: (screenName: string) => void;
}

interface Node {
    id: string;
    x: number;
    y: number;
    data: ScreenMap;
    // Layout helpers
    level: number;
}

interface Edge {
    id: string;
    from: string;
    to: string;
    label: string;
}

export function FlowchartModal({ isOpen, onClose, maps, onEditScreen }: FlowchartModalProps) {
    const { t } = useTranslation();
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStart = useRef({ x: 0, y: 0 });
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

    // --- Layout Logic ---
    const { nodes, edges, width, height } = useMemo(() => {
        if (maps.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

        const nodeIdMap = new Map<string, Node>();
        const edgesList: Edge[] = [];

        // 1. Build Edges & Calculate Degrees
        const degrees = new Map<string, number>(); // Total connections (in + out)

        maps.forEach(m => {
            if (!degrees.has(m.name)) degrees.set(m.name, 0);

            m.elements.forEach(el => {
                if (el.navigates_to) {
                    if (maps.find(target => target.name === el.navigates_to)) {
                        edgesList.push({
                            id: `${m.name}-${el.name}-${el.navigates_to}`,
                            from: m.name,
                            to: el.navigates_to,
                            label: el.name
                        });

                        // Increment degrees
                        degrees.set(m.name, (degrees.get(m.name) || 0) + 1);
                        degrees.set(el.navigates_to, (degrees.get(el.navigates_to) || 0) + 1);
                    }
                }
            });
        });

        // 2. Classify Nodes
        const screens = maps.filter(m => m.type === 'screen');
        const appendages = maps.filter(m => m.type !== 'screen');

        // 3. Sort Screens by Centrality (Degree)
        screens.sort((a, b) => {
            const degA = degrees.get(a.name) || 0;
            const degB = degrees.get(b.name) || 0;
            return degB - degA; // Descending
        });

        // 4. Assign Appendages to Parents (Screens)
        const parentMap = new Map<string, string[]>(); // ScreenName -> [AppendageNames]

        // Initialize map for all screens
        screens.forEach(s => parentMap.set(s.name, []));

        // Unassigned bucket for appendages that don't have a clear screen parent
        const unassigned: string[] = [];

        appendages.forEach(app => {
            // Find who points to this appendage
            const parents = edgesList.filter(e => e.to === app.name).map(e => e.from);

            // Prefer a 'screen' parent
            const screenParent = parents.find(p => screens.some(s => s.name === p));

            if (screenParent) {
                parentMap.get(screenParent)?.push(app.name);
            } else if (parents.length > 0) {
                // Pointed to by another appendage? (Nested logic could go here, but flattening for now)
                // Try to find the root screen of the parent appendage
                // For simplicity, treat as unassigned or attach to first parent
                unassigned.push(app.name);
            } else {
                unassigned.push(app.name);
            }
        });

        // 5. Calculate Coordinates
        const NODE_WIDTH = 220;
        const NODE_HEIGHT = 280;
        const X_GAP = 100;
        const Y_GAP = 80;

        let maxX = 0;
        let maxY = 0;
        let minX = 0;

        // 5a. Place Screens (Horizontal Backbone: Center, Right, Left, Right...)
        screens.forEach((screen, index) => {
            // Alternating placement: 0, 1, -1, 2, -2...
            const direction = index % 2 === 0 ? 1 : -1;
            const step = Math.ceil(index / 2);
            const gridX = index === 0 ? 0 : step * direction;

            const x = gridX * (NODE_WIDTH + X_GAP);
            const y = 0; // Baseline

            nodeIdMap.set(screen.name, {
                id: screen.name,
                x,
                y,
                data: screen,
                level: 0
            });

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + NODE_WIDTH);
            maxY = Math.max(maxY, y + NODE_HEIGHT);

            // 5b. Place Appendages (Vertical Stack below Screen)
            const myAppendages = parentMap.get(screen.name) || [];

            // Sort appendages? Optional: maybe by type?

            let currentY = y + NODE_HEIGHT + Y_GAP;
            myAppendages.forEach(appName => {
                const appData = maps.find(m => m.name === appName)!;
                nodeIdMap.set(appName, {
                    id: appName,
                    x: x, // Same X as parent
                    y: currentY,
                    data: appData,
                    level: 1
                });

                maxY = Math.max(maxY, currentY + NODE_HEIGHT);
                currentY += (NODE_HEIGHT + Y_GAP);
            });
        });

        // 5c. Place Unassigned Appendages (If any, place them at the end or separate row)
        // For now, let's just dump them to the far right to avoid invisibility
        if (unassigned.length > 0) {
            let unassignedStartX = maxX + X_GAP;
            unassigned.forEach((appName, i) => {
                const appData = maps.find(m => m.name === appName)!;
                nodeIdMap.set(appName, {
                    id: appName,
                    x: unassignedStartX + (i * (NODE_WIDTH + X_GAP)),
                    y: 0,
                    data: appData,
                    level: 0
                });
            });
            maxX += unassigned.length * (NODE_WIDTH + X_GAP);
        }

        // 6. Normalize Coordinates (Start at 50, 75) - 75 gives space for SKY_Y routing
        const finalNodes: Node[] = [];
        nodeIdMap.forEach(n => {
            n.x = n.x - minX + 50;
            n.y = n.y + 75;
            finalNodes.push(n);
        });

        return {
            nodes: finalNodes,
            edges: edgesList,
            width: (maxX - minX) + 100 + NODE_WIDTH, // Margin
            height: maxY + 250
        };
    }, [maps]);

    // --- Interaction ---
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setOffset({
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        // Simple zoom
        if (e.ctrlKey || e.metaKey) {
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setScale(s => Math.min(Math.max(s * delta, 0.1), 3));
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface w-[90vw] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-outline-variant/30">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30 bg-surface">
                    <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
                        <Maximize className="text-primary" size={20} />
                        {t('mapper.flowchart.title', 'Navigation Flow')}
                    </h2>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-surface-variant/30 rounded-lg p-1 mr-4">
                            <button onClick={() => setScale(s => s - 0.1)} className="p-1.5 hover:bg-surface/50 rounded text-on-surface-variant"><ZoomOut size={16} /></button>
                            <span className="px-2 text-xs flex items-center text-on-surface-variant/80 min-w-[3rem] justify-center">{Math.round(scale * 100)}%</span>
                            <button onClick={() => setScale(s => s + 0.1)} className="p-1.5 hover:bg-surface/50 rounded text-on-surface-variant"><ZoomIn size={16} /></button>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-error/10 hover:text-error rounded-full transition-colors text-on-surface/60"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Canvas */}
                <div
                    ref={containerRef}
                    className="flex-1 overflow-hidden relative bg-surface-variant/5 cursor-move"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                >
                    <div
                        className="absolute origin-top-left transition-transform duration-75"
                        style={{
                            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                            width: width,
                            height: height
                        }}
                    >
                        {/* SVG Layer for Edges */}
                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ width: width + 500, height: height + 500, zIndex: 10 }}>
                            <defs>
                                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
                                </marker>
                                <marker id="arrowhead-hover" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                                </marker>
                            </defs>
                            {(() => {
                                // 1. Pre-process connections to assign Ports
                                const NODE_WIDTH = 220;
                                const NODE_HEIGHT = 280;
                                const X_GAP = 100;
                                const Y_GAP = 80;

                                // Helper to generate a unique key for a port: "nodeId-side-index"
                                // We need to store edges per side per node.
                                type Side = 'top' | 'bottom' | 'left' | 'right';
                                const ports = new Map<string, { [key in Side]: Edge[] }>();
                                const getPorts = (nodeId: string) => {
                                    if (!ports.has(nodeId)) {
                                        ports.set(nodeId, { top: [], bottom: [], left: [], right: [] });
                                    }
                                    return ports.get(nodeId)!;
                                };

                                // Assign sides based on relative position
                                const edgeSides = new Map<string, { sourceSide: Side, targetSide: Side }>();

                                edges.forEach(edge => {
                                    const source = nodes.find(n => n.id === edge.from);
                                    const target = nodes.find(n => n.id === edge.to);
                                    if (!source || !target) return;

                                    const dx = target.x - source.x;
                                    const dy = target.y - source.y;
                                    const absDx = Math.abs(dx);
                                    const absDy = Math.abs(dy);

                                    let sourceSide: Side = 'right';
                                    let targetSide: Side = 'left';

                                    // Heuristic (Same as before but determining Side enum)
                                    if (absDx > NODE_WIDTH * 0.8 && absDx > absDy * 0.8) {
                                        // Horizontal
                                        if (dx > 0) {
                                            sourceSide = 'right';
                                            targetSide = 'left';
                                        } else {
                                            sourceSide = 'left';
                                            targetSide = 'right';
                                        }
                                    } else {
                                        // Vertical
                                        if (dy > 0) {
                                            sourceSide = 'bottom';
                                            targetSide = 'top';
                                        } else {
                                            sourceSide = 'top';
                                            targetSide = 'bottom';
                                        }
                                    }

                                    // Loopback Override
                                    if (target.y <= source.y + 50 && source.id !== target.id) {
                                        // Slight tweak: if it's a loopback to a previous node, forcing side might help?
                                        // Actually, let's keep the geometric heuristic, it usually puts them side-by-side or far apart.
                                        // If same node:
                                    }
                                    if (source.id === target.id) {
                                        sourceSide = 'right';
                                        targetSide = 'top'; // Curve around? Or Right -> Right?
                                        // Let's try Right -> Right for self-loops logic if we had it, but standard Bezier might fail.
                                        // Let's stick to Right -> Top for auto-layout or customize path later.
                                        // For now, let's register them.
                                    }

                                    edgeSides.set(edge.id, { sourceSide, targetSide });
                                    getPorts(source.id)[sourceSide].push(edge);
                                    getPorts(target.id)[targetSide].push(edge);
                                });

                                // 2. Sort edges on each port to minimize crossing
                                // For a 'right' port, sort by target Y.
                                // For a 'top' port, sort by target X.
                                nodes.forEach(node => {
                                    const p = getPorts(node.id);

                                    // Sort Top/Bottom by Target X
                                    ['top', 'bottom'].forEach(side => {
                                        p[side as Side].sort((a, b) => {
                                            const otherA = a.from === node.id ? nodes.find(n => n.id === a.to) : nodes.find(n => n.id === a.from);
                                            const otherB = b.from === node.id ? nodes.find(n => n.id === b.to) : nodes.find(n => n.id === b.from);
                                            return (otherA?.x || 0) - (otherB?.x || 0);
                                        });
                                    });

                                    // Sort Left/Right by Target Y
                                    ['left', 'right'].forEach(side => {
                                        p[side as Side].sort((a, b) => {
                                            const otherA = a.from === node.id ? nodes.find(n => n.id === a.to) : nodes.find(n => n.id === a.from);
                                            const otherB = b.from === node.id ? nodes.find(n => n.id === b.to) : nodes.find(n => n.id === b.from);
                                            return (otherA?.y || 0) - (otherB?.y || 0);
                                        });
                                    });
                                });

                                // 3. Calculate all edge paths first
                                const calculatedEdges = edges.map(edge => {
                                    const source = nodes.find(n => n.id === edge.from);
                                    const target = nodes.find(n => n.id === edge.to);
                                    if (!source || !target) return null;

                                    const dx = target.x - source.x;
                                    const dy = target.y - source.y;

                                    const sides = edgeSides.get(edge.id)!;

                                    // Calculate Start Point
                                    const sourcePorts = getPorts(source.id)[sides.sourceSide];
                                    const sourceIndex = sourcePorts.indexOf(edge);
                                    const sourceCount = sourcePorts.length;

                                    // Distribute along the side
                                    // Range is 0 to W or 0 to H.
                                    // We want to center them.
                                    // step = Size / (count + 1)
                                    // pos = step * (index + 1)
                                    let startX = source.x;
                                    let startY = source.y;

                                    if (sides.sourceSide === 'top') {
                                        startX += (NODE_WIDTH / (sourceCount + 1)) * (sourceIndex + 1);
                                    } else if (sides.sourceSide === 'bottom') {
                                        startX += (NODE_WIDTH / (sourceCount + 1)) * (sourceIndex + 1);
                                        startY += NODE_HEIGHT;
                                    } else if (sides.sourceSide === 'left') {
                                        startY += (NODE_HEIGHT / (sourceCount + 1)) * (sourceIndex + 1);
                                    } else if (sides.sourceSide === 'right') {
                                        startX += NODE_WIDTH;
                                        startY += (NODE_HEIGHT / (sourceCount + 1)) * (sourceIndex + 1);
                                    }

                                    // Calculate End Point
                                    const targetPorts = getPorts(target.id)[sides.targetSide];
                                    const targetIndex = targetPorts.indexOf(edge);
                                    const targetCount = targetPorts.length;

                                    let endX = target.x;
                                    let endY = target.y;

                                    if (sides.targetSide === 'top') {
                                        endX += (NODE_WIDTH / (targetCount + 1)) * (targetIndex + 1);
                                    } else if (sides.targetSide === 'bottom') {
                                        endX += (NODE_WIDTH / (targetCount + 1)) * (targetIndex + 1);
                                        endY += NODE_HEIGHT;
                                    } else if (sides.targetSide === 'left') {
                                        endY += (NODE_HEIGHT / (targetCount + 1)) * (targetIndex + 1);
                                    } else if (sides.targetSide === 'right') {
                                        endX += NODE_WIDTH;
                                        endY += (NODE_HEIGHT / (targetCount + 1)) * (targetIndex + 1);
                                    }

                                    // --- Orthogonal Routing with Obstacle Avoidance ---
                                    const CORNER_RADIUS = 15;

                                    let points: { x: number, y: number }[] = [];
                                    points.push({ x: startX, y: startY });

                                    // Helper: Add intermediate points
                                    // We need to move away from the port first
                                    const DEPARTURE_MARGIN = 30; // Distance to move away from node before turning

                                    let cursorX = startX;
                                    let cursorY = startY;

                                    // 1. Move out from Source
                                    if (sides.sourceSide === 'right') cursorX += DEPARTURE_MARGIN;
                                    else if (sides.sourceSide === 'left') cursorX -= DEPARTURE_MARGIN;
                                    else if (sides.sourceSide === 'top') cursorY -= DEPARTURE_MARGIN;
                                    else if (sides.sourceSide === 'bottom') cursorY += DEPARTURE_MARGIN;

                                    points.push({ x: cursorX, y: cursorY });

                                    // 2. Routing Logic
                                    // Check for obstacles or "distant" relationships
                                    const isSequence = source.level === 0 && target.level === 0 && dx > 0 && dx < (NODE_WIDTH + X_GAP * 2.1); // Direct neighbor tolerance
                                    const isVerticalStack = source.x === target.x && Math.abs(dy) < (NODE_HEIGHT + Y_GAP * 1.5); // Direct vertical neighbor
                                    const isCloseBackward = dx < 0 && dx > -(NODE_WIDTH + X_GAP * 1.5) && source.level === target.level; // Adjacent backward
                                    // New: Allow diagonal routing if not too far back
                                    const isDiagonal = dx < 0 && dx > -(NODE_WIDTH + X_GAP * 2.5) && dy > 0 && dy < (NODE_HEIGHT * 2 + Y_GAP * 2);


                                    // Destination Approach Point
                                    let approachX = endX;
                                    let approachY = endY;
                                    if (sides.targetSide === 'right') approachX += DEPARTURE_MARGIN;
                                    else if (sides.targetSide === 'left') approachX -= DEPARTURE_MARGIN;
                                    else if (sides.targetSide === 'top') approachY -= DEPARTURE_MARGIN;
                                    else if (sides.targetSide === 'bottom') approachY += DEPARTURE_MARGIN;

                                    if (isSequence || isVerticalStack || isCloseBackward || isDiagonal) {
                                        // Simple Z / L shape
                                        // Midpoint routing
                                        if (sides.sourceSide === 'right' && sides.targetSide === 'left') {
                                            const midX = (cursorX + approachX) / 2;
                                            points.push({ x: midX, y: cursorY });
                                            points.push({ x: midX, y: approachY });
                                        } else if (sides.sourceSide === 'left' && sides.targetSide === 'right') {
                                            const midX = (cursorX + approachX) / 2;
                                            points.push({ x: midX, y: cursorY });
                                            points.push({ x: midX, y: approachY });
                                        } else if (sides.sourceSide === 'bottom' && sides.targetSide === 'top') {
                                            const midY = (cursorY + approachY) / 2;
                                            points.push({ x: cursorX, y: midY });
                                            points.push({ x: approachX, y: midY });
                                        } else {
                                            // Generic fallback for close but odd ports
                                            // For diagonal (Right -> Left but lower), we might want:
                                            // Right -> midX -> Down -> Left
                                            if (isDiagonal && sides.sourceSide === 'right' && sides.targetSide === 'left') {
                                                const midX2 = (cursorX + approachX) / 2;
                                                points.push({ x: midX2, y: cursorY });
                                                points.push({ x: midX2, y: approachY });
                                            } else {
                                                points.push({ x: approachX, y: cursorY });
                                            }
                                        }
                                    } else {
                                        // --- Advanced Grid Routing ---
                                        // Coordinate System Constants (Center-based)
                                        const GRID_W = NODE_WIDTH + X_GAP;
                                        const GRID_H = NODE_HEIGHT + Y_GAP;
                                        const NODE_CENTER_X = NODE_WIDTH / 2;
                                        const NODE_CENTER_Y = NODE_HEIGHT / 2;

                                        // Grid Helpers
                                        const getGridX = (x: number) => Math.round((x + NODE_CENTER_X - 50) / GRID_W);
                                        const getGridY = (y: number) => Math.round((y + NODE_CENTER_Y - 75) / GRID_H);

                                        // Inverse Helpers (Gap Center)
                                        // Index 0.5 -> 50 + 0.5*GRID + GRID/2? 
                                        // Center(0) = 50 + W/2. Center(1) = 50 + GRID + W/2.
                                        // Mid(0.5) = 50 + W/2 + GRID/2.
                                        const getPixelX = (g: number) => 50 + NODE_CENTER_X + g * GRID_W;
                                        const getPixelY = (g: number) => 75 + NODE_CENTER_Y + g * GRID_H;




                                        const sCol = getGridX(source.x);
                                        const sRow = getGridY(source.y);
                                        const tCol = getGridX(target.x);
                                        const tRow = getGridY(target.y);

                                        // 3-Segment Grid Routing with "French Road" Rules (Right-Hand Traffic)
                                        // Goal: Move from Source (S) to Target (T) using Gaps like streets.
                                        // Rule: "Drive on the Right".
                                        // Horizontal Street (GapY):
                                        // - Going East (dx > 0): Use South Lane (y + Offset).
                                        // - Going West (dx < 0): Use North Lane (y - Offset).
                                        // Vertical Street (GapX):
                                        // - Going South (dy > 0): Use West Lane (x - Offset).
                                        // - Going North (dy < 0): Use East Lane (x + Offset).

                                        const LANE_OFFSET = 12; // Half-width of the "street" separation

                                        // 1. Determine Streets (Gaps)
                                        // Horizontal Street: Gap between Source Row and Next Row (or Prev).
                                        // Heuristic: Use the gap closest to the straight line S->T.
                                        // If T is below S, use Gap Below. If T is above, use Gap Above.
                                        let gapRowIndex = sRow + (target.y < source.y ? -0.5 : 0.5);

                                        // If S and T are same row (or close), we use SPECIAL RULES.
                                        // Rule 1: "Same Row" -> Go Above if driving East, Go Below if driving West.
                                        // Note: Logic inverted from previous implementation based on user feedback.
                                        if (Math.abs(sRow - tRow) < 0.1) {
                                            if (dx > 0) gapRowIndex = sRow - 0.5; // East (Forward) -> Go Above
                                            else gapRowIndex = sRow + 0.5; // West (Backward) -> Go Below
                                        }

                                        // Vertical Street: Gap next to Target Column.
                                        // Default: If approaching from Left (dx > 0), use Gap Left of Target. 
                                        //          If approaching from Right (dx < 0), use Gap Right of Target.
                                        let gapColIndex = tCol + (dx > 0 ? -0.5 : 0.5);

                                        // If S and T are same column (or close), we use SPECIAL RULES.
                                        // Rule 2: "Same Column" -> Go Right if driving South, Go Left if driving North.
                                        if (Math.abs(sCol - tCol) < 0.1) {
                                            if (dy > 0) gapColIndex = tCol + 0.5; // South (Down) -> Go Right
                                            else gapColIndex = tCol - 0.5; // North (Up) -> Go Left
                                        }

                                        // 2. Determine Lanes (Offsets) based on Direction
                                        // Horizontal Direction on the Street: S.x to GapX.
                                        // Actually, the main horizontal movement is sCol -> tCol.
                                        const drivingEast = dx > 0;
                                        // const drivingSouth = dy > 0; // Not used direclty, using computed diff

                                        // Base Coordinates (Center of Street)
                                        let routeY = getPixelY(gapRowIndex);
                                        let routeX = getPixelX(gapColIndex);

                                        // Apply French Rules (Lanes)
                                        // Horizontal Street Lane:
                                        if (drivingEast) routeY += LANE_OFFSET; // South Lane
                                        else routeY -= LANE_OFFSET; // North Lane

                                        // Vertical Street Lane:
                                        // We travel from routeY to approachY.
                                        const vertDirection = approachY - routeY;
                                        if (vertDirection > 0) routeX -= LANE_OFFSET; // Going South -> West Lane
                                        else routeX += LANE_OFFSET; // Going North -> East Lane

                                        // 3. Build Path
                                        // S -> (cursorX, routeY) -> (routeX, routeY) -> (routeX, approachY) -> T

                                        // Step A: Move Vertically to Horizontal Street (Driveway)
                                        points.push({ x: cursorX, y: routeY });

                                        // Step B: Travel Horizontal Street
                                        points.push({ x: routeX, y: routeY });

                                        // Step C: Travel Vertical Street to Target Y
                                        points.push({ x: routeX, y: approachY });
                                    }

                                    // 3. Move to Approach Point then End
                                    points.push({ x: approachX, y: approachY });
                                    points.push({ x: endX, y: endY });

                                    // Filter duplicate points (where x and y match prev)
                                    points = points.filter((p, i) => {
                                        if (i === 0) return true;
                                        return Math.abs(p.x - points[i - 1].x) > 1 || Math.abs(p.y - points[i - 1].y) > 1;
                                    });

                                    // Generate Path Data with Rounded Corners
                                    let pathD = `M ${points[0].x} ${points[0].y}`;
                                    for (let i = 1; i < points.length; i++) {
                                        const p = points[i];
                                        // If not last point, and form a corner with next? 
                                        // Simplifying: just LineTo for now. Implementing true rounded corners requires looking ahead.
                                        // Let's do simple LineTo first to verify routing, then add arcs if needed.
                                        // To do rounded corners simply: stop Radius short of P, draw Quad/Arc to Radius past P.
                                        pathD += ` L ${p.x} ${p.y}`;
                                    }

                                    // Rounded Corners Implementation
                                    if (points.length > 2) {
                                        pathD = `M ${points[0].x} ${points[0].y}`;
                                        for (let i = 1; i < points.length - 1; i++) {
                                            const cur = points[i];
                                            const next = points[i + 1];
                                            const prev = points[i - 1];

                                            // Vector from Prev to Cur
                                            const dx1 = cur.x - prev.x;
                                            const dy1 = cur.y - prev.y;
                                            const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                                            // Vector from Cur to Next
                                            const dx2 = next.x - cur.x;
                                            const dy2 = next.y - cur.y;
                                            const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                                            // Real radius is min of declared and available space
                                            const r = Math.min(CORNER_RADIUS, dist1 / 2, dist2 / 2);

                                            // Start of curve (backing up from Cur towards Prev)
                                            const startX = cur.x - (dx1 / dist1) * r;
                                            const startY = cur.y - (dy1 / dist1) * r;

                                            // End of curve (moving from Cur towards Next)
                                            const endX = cur.x + (dx2 / dist2) * r;
                                            const endY = cur.y + (dy2 / dist2) * r;

                                            pathD += ` L ${startX} ${startY}`;
                                            pathD += ` Q ${cur.x} ${cur.y} ${endX} ${endY}`;
                                        }
                                        pathD += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
                                    } else {
                                        // Simple line for 2 points
                                        pathD = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
                                    }

                                    // Midpoint for label (Evaluate at approx middle of total length)
                                    // Calculate total length
                                    let totalLen = 0;
                                    for (let i = 1; i < points.length; i++) {
                                        totalLen += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
                                    }
                                    const targetLen = totalLen / 3; // 1/3 as requested

                                    let currentLen = 0;
                                    let midX = points[0].x;
                                    let midY = points[0].y;

                                    for (let i = 1; i < points.length; i++) {
                                        const segLen = Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
                                        if (currentLen + segLen >= targetLen) {
                                            // Interpolate
                                            const remain = targetLen - currentLen;
                                            const ratio = remain / segLen;
                                            midX = points[i - 1].x + (points[i].x - points[i - 1].x) * ratio;
                                            midY = points[i - 1].y + (points[i].y - points[i - 1].y) * ratio;
                                            break;
                                        }
                                        currentLen += segLen;
                                        midX = points[i].x; // Fallback
                                        midY = points[i].y;
                                    }

                                    const isMainFlow = Math.abs(dx) > Math.abs(dy) && dx > 0;
                                    const isLoopback = target.y <= source.y + 50;

                                    return { edge, pathD, midX, midY, isMainFlow, isLoopback };
                                }).filter((e): e is NonNullable<typeof e> => e !== null);

                                // --- Rendering with Z-Index Logic ---
                                // Order: 
                                // 1. All Non-hovered Edge Paths
                                // 2. All Non-hovered Edge Labels
                                // 3. Hovered Edge Path
                                // 4. Hovered Edge Label

                                return (
                                    <>
                                        {/* 1. Edge Paths */}
                                        {calculatedEdges.map(({ edge, pathD, isMainFlow }) => {
                                            const isHovered = edge.id === hoveredEdgeId;
                                            // Render base path if not hovered (or if hovered, we render a high-z version later? No, usually just render once)
                                            // Actually, to satisfy "Labels on top of Arrows except when hovered", we render ALL arrows first.
                                            if (isHovered) return null; // Render later
                                            return (
                                                <g key={edge.id}>
                                                    <path
                                                        d={pathD}
                                                        fill="none"
                                                        stroke={isMainFlow ? "#9ca3af" : "#d1d5db"}
                                                        strokeWidth={isMainFlow ? 2 : 1.5}
                                                        markerEnd="url(#arrowhead)"
                                                        className="opacity-70"
                                                        style={{ zIndex: 0 }}
                                                    />
                                                    {/* Hitbox */}
                                                    <path
                                                        d={pathD}
                                                        fill="none"
                                                        stroke="transparent"
                                                        strokeWidth="20"
                                                        className="cursor-pointer"
                                                        onMouseEnter={() => setHoveredEdgeId(edge.id)}
                                                    />
                                                </g>
                                            );
                                        })}

                                        {/* 2. Edge Labels */}
                                        {calculatedEdges.map(({ edge, midX, midY, isMainFlow, isLoopback }) => {
                                            if (edge.id === hoveredEdgeId) return null; // Render later
                                            return (
                                                <foreignObject
                                                    key={edge.id}
                                                    x={midX - 60}
                                                    y={midY - 12}
                                                    width="120"
                                                    height="24"
                                                    style={{ overflow: 'visible', pointerEvents: 'auto' }}
                                                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                                                    className="cursor-pointer"
                                                >
                                                    <div className="flex justify-center items-center">
                                                        <span className={clsx(
                                                            "px-2 py-0.5 rounded text-[10px] whitespace-nowrap border shadow-sm transition-all cursor-default opacity-80",
                                                            isLoopback
                                                                ? "bg-secondary-container text-on-secondary-container border-secondary-container"
                                                                : isMainFlow
                                                                    ? "bg-surface-variant text-on-surface-variant border-outline-variant/60 font-medium"
                                                                    : "bg-surface text-on-surface-variant/80 border-outline-variant/30"
                                                        )}>
                                                            {edge.label}
                                                        </span>
                                                    </div>
                                                </foreignObject>
                                            );
                                        })}

                                        {/* 3 & 4. Hovered Edge (Path + Label) on Top */}
                                        {calculatedEdges.filter(e => e.edge.id === hoveredEdgeId).map(({ edge, pathD, midX, midY, isMainFlow }) => (
                                            <g key={edge.id}>
                                                <path
                                                    d={pathD}
                                                    fill="none"
                                                    stroke={isMainFlow ? "#3b82f6" : "#3b82f6"} // Primary color highlight
                                                    strokeWidth={2.5}
                                                    markerEnd="url(#arrowhead-hover)"
                                                    className="opacity-100 transition-all duration-300"
                                                    style={{ zIndex: 100, filter: 'drop-shadow(0 0 2px rgba(59,130,246,0.5))' }}
                                                />
                                                {/* Hitbox maintenance */}
                                                <path
                                                    d={pathD}
                                                    fill="none"
                                                    stroke="transparent"
                                                    strokeWidth="20"
                                                    className="cursor-pointer"
                                                    onMouseLeave={() => setHoveredEdgeId(null)}
                                                />
                                                <foreignObject x={midX - 60} y={midY - 12} width="120" height="24" style={{ overflow: 'visible', pointerEvents: 'none' }}>
                                                    <div className="flex justify-center items-center">
                                                        <span className={clsx(
                                                            "px-2 py-0.5 rounded text-[10px] whitespace-nowrap border shadow-md scale-110",
                                                            "bg-primary-container text-on-primary-container border-primary"
                                                        )}>
                                                            {edge.label}
                                                        </span>
                                                    </div>
                                                </foreignObject>
                                            </g>
                                        ))}
                                    </>
                                );
                            })()}
                        </svg>

                        {/* Node Layer */}
                        {nodes.map(node => (
                            <div
                                key={node.id}
                                className={clsx(
                                    "absolute flex flex-col bg-surface border rounded-xl overflow-hidden shadow-sm hover:shadow-xl hover:scale-105 transition-all duration-300 group/card",
                                    node.data.type === 'modal' ? 'border-dashed border-tertiary' : 'border-outline-variant/50'
                                )}
                                style={{
                                    left: node.x,
                                    top: node.y,
                                    width: 220,
                                    height: 280
                                }}
                            >
                                <div className="h-48 w-full bg-surface-variant/20 relative overflow-hidden flex items-center justify-center p-2">
                                    {node.data.base64_preview ? (
                                        <img src={`data:image/png;base64,${node.data.base64_preview}`} className="max-h-full max-w-full object-contain shadow-sm rounded" />
                                    ) : (
                                        <span className="text-xs text-on-surface-variant/50">No Preview</span>
                                    )}
                                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white backdrop-blur-sm">
                                        {node.data.type}
                                    </div>
                                </div>
                                <div className="flex-1 p-3 flex flex-col justify-center border-t border-outline-variant/10 bg-surface">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="font-semibold text-sm text-on-surface truncate" title={node.data.name}>
                                            {node.data.name}
                                        </h3>
                                        {onEditScreen && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEditScreen(node.data.name);
                                                    onClose();
                                                }}
                                                className="opacity-0 group-hover/card:opacity-100 p-1.5 hover:bg-primary/10 text-on-surface-variant hover:text-primary rounded-full transition-all"
                                                title={t('mapper.action.edit')}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="text-xs text-on-surface-variant/70 mt-1">
                                        {node.data.elements.length} elements
                                    </div>
                                </div>
                            </div>
                        ))}

                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
