import React from 'react';
import clsx from 'clsx';

interface FlowEdgeProps {
    edgeId: string;
    points: { x: number, y: number }[];
    startPoint: { x: number, y: number };
    endPoint: { x: number, y: number };
    elName: string;
    isVisible: boolean;
    isInteracting: boolean;
    hoveredEdge: string | null;
    isDraggingConnection: boolean;
    isDraggingEdge: boolean;
    isSpacePressed: boolean;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onSegmentMouseDown: (idx: number, e: React.MouseEvent) => void;
    onSegmentDoubleClick: (idx: number, e: React.MouseEvent) => void;
    onSourceMouseDown: (e: React.MouseEvent) => void;
    onTargetMouseDown: (e: React.MouseEvent) => void;
    onVertexMouseDown: (idx: number, e: React.MouseEvent) => void;
    onVertexDoubleClick: (idx: number, e: React.MouseEvent) => void;
}

export const FlowEdgeLine = React.memo(({
    edgeId,
    points,
    isVisible,
    isInteracting,
    hoveredEdge
}: Pick<FlowEdgeProps, 'edgeId' | 'points' | 'isVisible' | 'isInteracting' | 'hoveredEdge'>) => {
    if (!isVisible && !isInteracting) return null;

    let d = `M ${points[0].x} ${points[0].y} `;
    for (let i = 0; i < points.length - 1; i++) {
        const p2 = points[i + 1];
        d += ` L ${p2.x} ${p2.y} `;
    }

    return (
        <g className={clsx(!isVisible && "opacity-20 pointer-events-none")}>
            <path
                d={d}
                stroke={hoveredEdge === edgeId ? "#3b82f6" : "#9ca3af"}
                strokeWidth={hoveredEdge === edgeId ? 3 : 2}
                fill="none"
                markerEnd={hoveredEdge === edgeId ? "url(#arrowhead-highlighted)" : "url(#arrowhead)"}
                className="transition-colors pointer-events-none"
            />
        </g>
    );
});

export const FlowEdgeControls = React.memo(({
    edgeId,
    points,
    startPoint,
    endPoint,
    elName,
    isVisible,
    isInteracting,
    hoveredEdge,
    isDraggingConnection,
    isDraggingEdge,
    isSpacePressed,
    onMouseEnter,
    onMouseLeave,
    onSegmentMouseDown,
    onSegmentDoubleClick,
    onSourceMouseDown,
    onTargetMouseDown,
    onVertexMouseDown,
    onVertexDoubleClick
}: FlowEdgeProps) => {
    if (!isVisible && !isInteracting) return null;

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
                    (isDraggingConnection || !isVisible) ? "pointer-events-none" : "pointer-events-auto"
                )}
                onMouseDown={(e) => {
                    if (isSpacePressed || e.button === 1 || !isVisible) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onSegmentMouseDown(i, e);
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSegmentDoubleClick(i, e);
                }}
            />
        );
    }

    // Label position calculation
    const midSegIndex = Math.floor((points.length - 1) / 2);
    const pA = points[midSegIndex];
    const pB = points[midSegIndex + 1];

    let midX = (pA.x + pB.x) / 2;
    let midY = (pA.y + pB.y) / 2;
    if (pA.x > pB.x) midX -= 10;
    else if (pA.x === pB.x) midX -= 2;
    else midX -= 110;

    if (pA.y > pB.y) midY += 10;
    else if (pA.y === pB.y) midY += 2;
    else midY -= 30;

    return (
        <g
            className={clsx("group/edge pointer-events-auto", !isVisible && "opacity-20")}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {segments}
            
            {/* Label */}
            {!isDraggingEdge && (
                <foreignObject x={midX} y={midY} width={120} height={24} style={{ overflow: 'visible' }}>
                    <div
                        className={clsx(
                            "text-on-surface text-[10px] px-2 py-0.5 rounded-full text-center truncate border shadow-sm pointer-events-auto select-none transition-colors cursor-move",
                            hoveredEdge === edgeId ? "bg-surface border-primary text-primary dark:text-primary/80 ring-1 ring-primary" : "bg-surface/90 border-outline-variant/50 hover:border-primary hover:text-primary"
                        )}
                        onMouseDown={(e) => {
                            if (isSpacePressed || e.button === 1) return;
                            e.stopPropagation();
                        }}
                    >
                        {elName}
                    </div>
                </foreignObject>
            )}

            {/* Source/Target Handles */}
            <circle
                cx={startPoint.x} cy={startPoint.y} r={6} 
                fill={hoveredEdge === edgeId ? "rgba(59, 130, 246, 0.8)" : "rgba(156, 163, 175, 0.3)"}
                stroke={hoveredEdge === edgeId ? "#3b82f6" : "transparent"}
                strokeWidth={2}
                className={clsx("cursor-grab transition-all", isDraggingConnection ? "pointer-events-none" : "pointer-events-auto")}
                onMouseDown={(e) => { if (!isSpacePressed && e.button !== 1) { e.preventDefault(); e.stopPropagation(); onSourceMouseDown(e); } }}
            />
            <circle
                cx={endPoint.x} cy={endPoint.y} r={6}
                fill={hoveredEdge === edgeId ? "rgba(59, 130, 246, 0.8)" : "rgba(156, 163, 175, 0.3)"}
                stroke={hoveredEdge === edgeId ? "#3b82f6" : "transparent"}
                strokeWidth={2}
                className={clsx("cursor-grab transition-all", isDraggingConnection ? "pointer-events-none" : "pointer-events-auto")}
                onMouseDown={(e) => { if (!isSpacePressed && e.button !== 1) { e.preventDefault(); e.stopPropagation(); onTargetMouseDown(e); } }}
            />

            {/* Vertices */}
            {points.slice(1, -1).map((p, idx) => (
                <circle
                    key={`${edgeId}-v-${idx}`}
                    cx={p.x} cy={p.y} r={5} fill="#3b82f6"
                    className={clsx("cursor-move opacity-0 hover:opacity-100", isDraggingConnection ? "pointer-events-none" : "pointer-events-auto")}
                    onMouseDown={(e) => { if (!isSpacePressed && e.button !== 1) { e.preventDefault(); e.stopPropagation(); onVertexMouseDown(idx, e); } }}
                    onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onVertexDoubleClick(idx, e); }}
                />
            ))}
        </g>
    );
});

FlowEdgeLine.displayName = 'FlowEdgeLine';
FlowEdgeControls.displayName = 'FlowEdgeControls';
