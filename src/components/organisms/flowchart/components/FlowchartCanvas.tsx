import React from 'react';
import clsx from 'clsx';
import { CELL_WIDTH, CELL_HEIGHT } from '../types';

interface FlowchartCanvasProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    contentRef: React.RefObject<HTMLDivElement | null>;
    isDraggingCanvas: boolean;
    isSpacePressed: boolean;
    offset: { x: number; y: number };
    scale: number;
    gridBounds: { minX: number; minY: number; width: number; height: number };
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onWheel: (e: React.WheelEvent) => void;
    children: React.ReactNode;
}

export function FlowchartCanvas({
    containerRef,
    contentRef,
    isDraggingCanvas,
    isSpacePressed,
    offset,
    scale,
    gridBounds,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onWheel,
    children
}: FlowchartCanvasProps) {
    return (
        <div
            ref={containerRef}
            className={clsx(
                "flex-1 bg-surface-variant/5 relative overflow-hidden",
                isDraggingCanvas ? "cursor-grabbing" : (isSpacePressed ? "cursor-grab" : "cursor-default")
            )}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onWheel={onWheel}
        >
            <div
                ref={contentRef}
                className="absolute inset-0 z-0 bg-surface-variant/5 lines-bg"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                    width: `${gridBounds.width * CELL_WIDTH}px`,
                    height: `${gridBounds.height * CELL_HEIGHT}px`
                }}
            >
                {/* Grid Background */}
                <div className="absolute pointer-events-none"
                    style={{
                        zIndex: 0,
                        left: `${gridBounds.minX * CELL_WIDTH}px`,
                        top: `${gridBounds.minY * CELL_HEIGHT}px`,
                        width: `${gridBounds.width * CELL_WIDTH}px`,
                        height: `${gridBounds.height * CELL_HEIGHT}px`,
                        backgroundImage: `
                            linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)
                        `,
                        backgroundSize: `${CELL_WIDTH}px ${CELL_HEIGHT}px`,
                        backgroundPosition: `0 0`
                    }}
                />
                
                {children}
            </div>
        </div>
    );
}
