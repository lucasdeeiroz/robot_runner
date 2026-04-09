import React from 'react';
import { Plus } from 'lucide-react';
import clsx from 'clsx';
import { PortPosition } from './types';

interface FlowPortProps {
    nodeId: string;
    port: PortPosition;
    pixel: { x: number, y: number };
    isHovered: boolean;
    isInteractive: boolean;
    showPorts: boolean;
    canQuickConnect: boolean;
    isDraggingConnection: boolean;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onClick: (e: React.MouseEvent) => void;
}

export const FlowPort = React.memo(({
    nodeId,
    port,
    pixel,
    isHovered,
    isInteractive,
    showPorts,
    canQuickConnect,
    isDraggingConnection,
    onMouseEnter,
    onMouseLeave,
    onMouseDown,
    onClick
}: FlowPortProps) => {
    return (
        <div
            data-port-id={port.id}
            data-node-id={nodeId}
            className={clsx(
                "absolute w-12 h-12 rounded-full flex items-center justify-center",
                isInteractive ? "pointer-events-auto" : "pointer-events-none"
            )}
            style={{
                zIndex: 60,
                left: pixel.x + port.x - 24,
                top: pixel.y + port.y - 24,
                backgroundColor: 'rgba(255, 255, 255, 0.001)'
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onMouseDown={onMouseDown}
            onClick={onClick}
        >
            <div
                className={clsx(
                    "w-4 h-4 rounded-full border border-solid transition-all flex items-center justify-center bg-surface pointer-events-none",
                    showPorts ? "opacity-100 scale-100" : "opacity-0 scale-0",
                    isDraggingConnection ? (isHovered ? "border-primary bg-primary/20 scale-125" : "border-outline-variant/50") : (
                        canQuickConnect && isHovered ? "border-primary scale-125 shadow-lg" : "border-outline-variant/30"
                    )
                )}
            >
                {isHovered && canQuickConnect && (
                    <Plus size={10} className="text-primary" />
                )}
                {isDraggingConnection && isHovered && (
                    <div className="w-2 h-2 rounded-full bg-primary/50" />
                )}
            </div>
        </div>
    );
});

FlowPort.displayName = 'FlowPort';
