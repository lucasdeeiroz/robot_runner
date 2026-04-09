// Flowchart types and constants

export const CELL_WIDTH = 400;
export const CELL_HEIGHT = 300;
export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 180;
export const NODE_OFFSET_X = (CELL_WIDTH - NODE_WIDTH) / 2;
export const NODE_OFFSET_Y = (CELL_HEIGHT - NODE_HEIGHT) / 2;
export const LANE_SIZE = 20;

export interface FlowLayout {
    nodes: Record<string, { gridX: number, gridY: number }>;
    edges: Record<string, {
        vertices?: { x: number, y: number }[];
        sourceHandle?: string;
        targetHandle?: string;
    }>;
}

export type DragItem = {
    type: 'node' | 'vertex' | 'segment' | 'source' | 'target';
    id: string;
    index?: number;
    points?: { x: number, y: number }[];
} | null;

export interface PortPosition {
    id: string;
    x: number;
    y: number;
}

const PORT_OFFSET = -12;

export const NODE_PORTS: PortPosition[] = [
    // Top (0-4)
    { id: 'top-0', x: (NODE_WIDTH / 6) * 1, y: PORT_OFFSET },
    { id: 'top-1', x: (NODE_WIDTH / 6) * 2, y: PORT_OFFSET },
    { id: 'top-2', x: (NODE_WIDTH / 6) * 3, y: PORT_OFFSET },
    { id: 'top-3', x: (NODE_WIDTH / 6) * 4, y: PORT_OFFSET },
    { id: 'top-4', x: (NODE_WIDTH / 6) * 5, y: PORT_OFFSET },

    // Bottom (0-4)
    { id: 'bottom-0', x: (NODE_WIDTH / 6) * 1, y: NODE_HEIGHT - PORT_OFFSET },
    { id: 'bottom-1', x: (NODE_WIDTH / 6) * 2, y: NODE_HEIGHT - PORT_OFFSET },
    { id: 'bottom-2', x: (NODE_WIDTH / 6) * 3, y: NODE_HEIGHT - PORT_OFFSET },
    { id: 'bottom-3', x: (NODE_WIDTH / 6) * 4, y: NODE_HEIGHT - PORT_OFFSET },
    { id: 'bottom-4', x: (NODE_WIDTH / 6) * 5, y: NODE_HEIGHT - PORT_OFFSET },

    // Left (0-6)
    { id: 'left-0', x: PORT_OFFSET, y: (NODE_HEIGHT / 8) * 1 },
    { id: 'left-1', x: PORT_OFFSET, y: (NODE_HEIGHT / 8) * 2 },
    { id: 'left-2', x: PORT_OFFSET, y: (NODE_HEIGHT / 8) * 3 },
    { id: 'left-3', x: PORT_OFFSET, y: (NODE_HEIGHT / 8) * 4 },
    { id: 'left-4', x: PORT_OFFSET, y: (NODE_HEIGHT / 8) * 5 },
    { id: 'left-5', x: PORT_OFFSET, y: (NODE_HEIGHT / 8) * 6 },
    { id: 'left-6', x: PORT_OFFSET, y: (NODE_HEIGHT / 8) * 7 },

    // Right (0-6)
    { id: 'right-0', x: NODE_WIDTH - PORT_OFFSET, y: (NODE_HEIGHT / 8) * 1 },
    { id: 'right-1', x: NODE_WIDTH - PORT_OFFSET, y: (NODE_HEIGHT / 8) * 2 },
    { id: 'right-2', x: NODE_WIDTH - PORT_OFFSET, y: (NODE_HEIGHT / 8) * 3 },
    { id: 'right-3', x: NODE_WIDTH - PORT_OFFSET, y: (NODE_HEIGHT / 8) * 4 },
    { id: 'right-4', x: NODE_WIDTH - PORT_OFFSET, y: (NODE_HEIGHT / 8) * 5 },
    { id: 'right-5', x: NODE_WIDTH - PORT_OFFSET, y: (NODE_HEIGHT / 8) * 6 },
    { id: 'right-6', x: NODE_WIDTH - PORT_OFFSET, y: (NODE_HEIGHT / 8) * 7 },
];

// NavigationData is now imported from @/lib/types
