import React from 'react';

interface FlowchartSVGProps {
    children: React.ReactNode;
    zIndex: number;
}

export function FlowchartSVG({ children, zIndex }: FlowchartSVGProps) {
    return (
        <svg 
            className="absolute top-0 left-0 w-full h-full pointer-events-none" 
            style={{ zIndex, overflow: 'visible' }}
        >
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
                </marker>
                <marker id="arrowhead-highlighted" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                </marker>
            </defs>
            {children}
        </svg>
    );
}
